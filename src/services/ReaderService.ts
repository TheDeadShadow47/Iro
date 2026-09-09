import type { ChapterInfo, ChapterProgress, PageInfo } from "@/domain/models";
import { historyRepository } from "@/db/repositories/historyRepository";
import { progressRepository } from "@/db/repositories/progressRepository";
import { downloadsRepository } from "@/db/repositories/downloadsRepository";
import { Application } from "@/providers/sandbox/network";
import { providerRegistry } from "@/services/providerRegistry";
import { withCloudflareRetry } from "@/services/SearchService";
import { normalizePageImageUrl } from "@/utils/imageQuality";
import { runProvider } from "@/utils/sourceErrors";
import { Directory, File } from "expo-file-system";

export const ReaderService = {
  async getChapters(sourceId: string, mangaId: string): Promise<ChapterInfo[]> {
    return withCloudflareRetry(sourceId, () =>
      runProvider({
        sourceId,
        operation: "getChapters",
        fn: () => providerRegistry.get(sourceId).then((p) => p.getChapters(mangaId)),
      })
    );
  },

  /**
   * Returns page list with `rawUrl` already resolved into a safe
   * `{ uri, headers }` pair for <Image>, via Application.resolveImageUri
   * (which attaches Cloudflare clearance / auth cookies transparently).
   * Falls back to any completed local download first.
   */
  async getResolvedPages(
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<{ uri: string; headers?: Record<string, string> }[]> {
    const localDirUri = await getLocalDownloadDir(sourceId, mangaId, chapterId);
    if (localDirUri) {
      const dir = new Directory(localDirUri);
      const entries = dir
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      return entries.map((f) => ({ uri: f.uri }));
    }

    const pages = await withCloudflareRetry(sourceId, () =>
      runProvider({
        sourceId,
        operation: "getPageList",
        fn: async () => {
          const provider = await providerRegistry.get(sourceId);
          try {
            return await provider.getPageList(chapterId);
          } catch (err: any) {
            const msg = String(err?.message ?? "");
            if (/was not loaded/i.test(msg)) {
              await provider.getChapters(mangaId);
              return provider.getPageList(chapterId);
            }
            throw err;
          }
        },
      })
    );

    return Promise.all(
      pages.map((p: PageInfo) =>
        Application.resolveImageUri(
          sourceId,
          normalizePageImageUrl(p.rawUrl),
          p.headers
        )
      )
    );
  },

  async getProgress(
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<ChapterProgress | null> {
    return progressRepository.get(sourceId, mangaId, chapterId);
  },

  async reportPageViewed(
    sourceId: string,
    mangaId: string,
    chapterId: string,
    chapterNumber: number,
    pageIndex: number,
    pageCount: number
  ): Promise<void> {
    await progressRepository.upsert(
      sourceId,
      mangaId,
      chapterId,
      pageIndex,
      pageCount
    );
    await historyRepository.recordOpen(
      sourceId,
      mangaId,
      chapterId,
      chapterNumber,
      pageIndex
    );
  },

  async markChapterRead(
    sourceId: string,
    mangaId: string,
    chapterId: string,
    pageCount: number
  ): Promise<void> {
    await progressRepository.markRead(sourceId, mangaId, chapterId, pageCount);
  },
};

async function getLocalDownloadDir(
  sourceId: string,
  mangaId: string,
  chapterId: string
): Promise<string | null> {
  const all = await downloadsRepository.getAll();
  const match = all.find(
    (d) =>
      d.sourceId === sourceId &&
      d.mangaId === mangaId &&
      d.chapterId === chapterId &&
      d.status === "completed" &&
      d.localDir
  );
  return match?.localDir ?? null;
}
