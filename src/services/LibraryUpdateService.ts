import { libraryRepository } from "@/db/repositories/libraryRepository";
import { updatesRepository } from "@/db/repositories/updatesRepository";
import { providerRegistry } from "@/services/providerRegistry";
import { withCloudflareRetry } from "@/services/SearchService";
import type { LibraryUpdateProgress, LibraryUpdateSummary } from "@/domain/models";

/**
 * Walks every library title through the same provider call the details
 * screen makes, diffs the returned chapter list against `chapter_cache`,
 * and records genuinely new chapters.
 */

type Listener = (payload: {
  progress: LibraryUpdateProgress;
  summary?: LibraryUpdateSummary;
}) => void;

class LibraryUpdateEngine {
  private running = false;
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(progress: LibraryUpdateProgress, summary?: LibraryUpdateSummary) {
    this.listeners.forEach((l) => l({ progress, summary }));
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Runs a full library check. A second call while one is in-flight is a
   * no-op, mirroring the manual-vs-background overlap guard in Honya. */
  async run(): Promise<LibraryUpdateSummary> {
    if (this.running) {
      throw new Error("A library update is already running");
    }
    this.running = true;

    const library = await libraryRepository.getAll();
    const total = library.length;
    let checked = 0;
    let updatedTitles = 0;
    let newChapters = 0;
    const failed: LibraryUpdateSummary["failed"] = [];

    this.emit({ running: true, current: 0, total });

    try {
      for (const entry of library) {
        checked += 1;
        this.emit({ running: true, current: checked, total, mangaTitle: entry.title });

        try {
          const details = await withCloudflareRetry(entry.sourceId, async () => {
            const provider = await providerRegistry.get(entry.sourceId);
            return provider.getMangaDetails(entry.mangaId);
          });

          const known = await updatesRepository.getKnownChapterIds(
            entry.sourceId,
            entry.mangaId
          );
          // First sync for a title establishes the baseline silently —
          // shouldn't flood Updates with the entire backlog on add.
          const isBaseline = known.size === 0;
          const newCount = await updatesRepository.syncChapters(
            entry.sourceId,
            entry.mangaId,
            details.chapters,
            known
          );
          if (!isBaseline && newCount > 0) {
            updatedTitles += 1;
            newChapters += newCount;
          }
        } catch (err) {
          failed.push({
            mangaId: entry.mangaId,
            title: entry.title,
            message: err instanceof Error ? err.message : "Update failed",
          });
        }
      }

      await updatesRepository.pruneOrphans();

      const summary: LibraryUpdateSummary = {
        lastUpdateAt: new Date().toISOString(),
        checked,
        updatedTitles,
        newChapters,
        failed,
      };
      this.emit({ running: false, current: total, total }, summary);
      return summary;
    } finally {
      this.running = false;
    }
  }
}

export const libraryUpdateEngine = new LibraryUpdateEngine();
