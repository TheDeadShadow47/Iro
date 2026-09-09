import { Directory, File, Paths } from "expo-file-system";
import type { ChapterInfo, DownloadEntry } from "@/domain/models";
import { downloadsRepository } from "@/db/repositories/downloadsRepository";
import { Application } from "@/providers/sandbox/network";
import { providerRegistry } from "@/services/providerRegistry";
import { withCloudflareRetry } from "@/services/SearchService";
import { normalizePageImageUrl } from "@/utils/imageQuality";
import { DOWNLOADS_DIR_NAME } from "@/constants/storage";

const DOWNLOADS_ROOT = new Directory(Paths.document, DOWNLOADS_DIR_NAME);

type ProgressListener = (entry: DownloadEntry) => void;

class DownloadQueue {
  private listeners = new Set<ProgressListener>();
  private processing = false;

  subscribe(listener: ProgressListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(entry: DownloadEntry) {
    this.listeners.forEach((l) => l(entry));
  }

  async enqueueChapter(chapter: ChapterInfo, totalPages: number = 0) {
    await downloadsRepository.enqueue(
      chapter.sourceId,
      chapter.mangaId,
      chapter.chapterId,
      chapter.title,
      chapter.chapterNumber,
      totalPages
    );
    this.kick();
  }

  /** Bulk-enqueue helper for chapter-list selection actions. Total page
   * counts aren't known until each entry is actually processed. */
  async enqueueChapters(chapters: ChapterInfo[]) {
    for (const chapter of chapters) {
      await downloadsRepository.enqueue(
        chapter.sourceId,
        chapter.mangaId,
        chapter.chapterId,
        chapter.title,
        chapter.chapterNumber,
        0
      );
    }
    this.kick();
  }

  async getAll(): Promise<DownloadEntry[]> {
    return downloadsRepository.getAll();
  }

  async getForManga(sourceId: string, mangaId: string): Promise<DownloadEntry[]> {
    return downloadsRepository.getForManga(sourceId, mangaId);
  }

  /** Removes a download's local files (if any) and its DB row. */
  async remove(id: number) {
    const entry = (await downloadsRepository.getAll()).find((d) => d.id === id);
    if (entry) {
      await this.deleteLocalFiles(entry.sourceId, entry.mangaId, entry.chapterId);
    }
    await downloadsRepository.remove(id);
  }

  async removeByChapter(sourceId: string, mangaId: string, chapterId: string) {
    await this.deleteLocalFiles(sourceId, mangaId, chapterId);
    await downloadsRepository.removeByChapter(sourceId, mangaId, chapterId);
  }

  private async deleteLocalFiles(sourceId: string, mangaId: string, chapterId: string) {
    const chapterDir = new Directory(DOWNLOADS_ROOT, sourceId, mangaId, chapterId);
    try {
      if (chapterDir.exists) {
        chapterDir.delete();
      }
    } catch {
      // best-effort — a missing/locked directory shouldn't block the DB cleanup
    }
  }

  /**
   * Delete on-disk chapter folders with no matching `downloads` DB row,
   * and prune empty manga folders. Catches files orphaned by crashes
   * between writing pages and updating the DB row.
   */
  async pruneOrphanedFiles(): Promise<{ removedDirs: number; freedBytes: number }> {
    let removedDirs = 0;
    let freedBytes = 0;
    if (!DOWNLOADS_ROOT.exists) return { removedDirs, freedBytes };

    const known = new Set(
      (await downloadsRepository.getAll()).map(
        (d) => `${d.sourceId}/${d.mangaId}/${d.chapterId}`
      )
    );

    const dirSize = (dir: Directory): number => {
      let bytes = 0;
      for (const entry of dir.list()) {
        bytes += entry instanceof Directory ? dirSize(entry) : entry.size ?? 0;
      }
      return bytes;
    };

    for (const sourceEntry of DOWNLOADS_ROOT.list()) {
      if (!(sourceEntry instanceof Directory)) continue;
      const sourceId = sourceEntry.name;
      for (const mangaEntry of sourceEntry.list()) {
        if (!(mangaEntry instanceof Directory)) continue;
        const mangaId = mangaEntry.name;
        let mangaHasSurvivors = false;
        for (const chapterEntry of mangaEntry.list()) {
          if (!(chapterEntry instanceof Directory)) continue;
          const key = `${sourceId}/${mangaId}/${chapterEntry.name}`;
          if (known.has(key)) {
            mangaHasSurvivors = true;
            continue;
          }
          try {
            freedBytes += dirSize(chapterEntry);
            chapterEntry.delete();
            removedDirs += 1;
          } catch {
            // best-effort
          }
        }
        if (!mangaHasSurvivors) {
          try {
            mangaEntry.delete();
          } catch {
            // best-effort — non-empty or locked, leave it
          }
        }
      }
    }
    return { removedDirs, freedBytes };
  }

  private async kick() {
    if (this.processing) return;
    this.processing = true;
    try {
      if (!DOWNLOADS_ROOT.exists) {
        DOWNLOADS_ROOT.create({ intermediates: true });
      }

      let queued = (await downloadsRepository.getAll()).filter(
        (d) => d.status === "queued"
      );
      while (queued.length > 0) {
        const entry = queued[0];
        await this.processEntry(entry);
        queued = (await downloadsRepository.getAll()).filter(
          (d) => d.status === "queued"
        );
      }
    } finally {
      this.processing = false;
    }
  }

  private async processEntry(entry: DownloadEntry) {
    const chapterDir = new Directory(
      DOWNLOADS_ROOT,
      entry.sourceId,
      entry.mangaId,
      entry.chapterId
    );
    try {
      // Clear leftover files from any prior attempt — retries always
      // restart from index 0, so stale files would show as extra wrong pages.
      if (chapterDir.exists) {
        chapterDir.delete();
      }
      chapterDir.create({ intermediates: true });

      const pages = await withCloudflareRetry(entry.sourceId, async () => {
        const provider = await providerRegistry.get(entry.sourceId);
        return provider.getPageList(entry.chapterId);
      });

      await downloadsRepository.setTotalPages(entry.id, pages.length);
      this.emit({ ...entry, status: "downloading", totalPages: pages.length });

      for (let i = 0; i < pages.length; i++) {
        const resolved = await Application.resolveImageUri(
          entry.sourceId,
          normalizePageImageUrl(pages[i].rawUrl),
          pages[i].headers
        );
        const destination = new File(
          chapterDir,
          `${String(i).padStart(3, "0")}.jpg`
        );
        await File.downloadFileAsync(resolved.uri, destination, {
          headers: resolved.headers,
          idempotent: true,
        });
        await downloadsRepository.updateProgress(entry.id, i + 1);
        this.emit({ ...entry, status: "downloading", progressPages: i + 1, totalPages: pages.length });
      }

      await downloadsRepository.complete(entry.id, chapterDir.uri);
      this.emit({
        ...entry,
        status: "completed",
        progressPages: pages.length,
        localDir: chapterDir.uri,
      });
    } catch (err: any) {
      await downloadsRepository.fail(entry.id, err?.message ?? "Unknown error");
      this.emit({ ...entry, status: "error", errorMessage: err?.message });
    }
  }
}

export const DownloadService = new DownloadQueue();
