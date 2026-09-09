import type { MangaDetails, MangaTile, SourceInfo } from "@/domain/models";
import { providerRegistry } from "@/services/providerRegistry";
import { LibraryService } from "@/services/LibraryService";
import { withCloudflareRetry } from "@/services/SearchService";
import { runProvider } from "@/utils/sourceErrors";
import {
  clearSourceMangaRows,
  copyHistoryByChapter,
  copyProgressByChapter,
  rekeyLibraryEntry,
} from "@/db/repositories/migrationRepository";

export interface MigrateSummary {
  transferredProgress: number;
  transferredHistory: number;
  targetTitle: string;
  targetCoverUrl: string;
  targetAuthor?: string;
  targetStatus: MangaDetails["status"];
}

/**
 * Manga migration: re-point a library title to the same title on another
 * source, preserving category + added timestamp, best-effort transferring
 * reading progress and history by matching chapter numbers, and pruning
 * the old title's cached data. Downloads are NOT transferred.
 */
export const MigrateService = {
  /** Every installed source except the one the title is currently on. */
  listTargetSources(fromSourceId: string): SourceInfo[] {
    return providerRegistry
      .listSources()
      .filter((s) => s.id !== fromSourceId);
  },

  /** Search the given source for a replacement match. */
  async searchSource(
    sourceId: string,
    query: string,
    page: number
  ): Promise<{ results: MangaTile[]; hasNextPage: boolean }> {
    const provider = await providerRegistry.get(sourceId);
    const result = await runProvider({
      sourceId,
      operation: "search",
      fn: () => provider.search({ query }, page),
    });
    return { results: result.tiles, hasNextPage: result.hasNextPage };
  },

  /**
   * Execute the migration. `target` is the MangaTile the user picked from the
   * target source's search results.
   */
  async migrate(params: {
    fromSourceId: string;
    fromMangaId: string;
    fromTitle: string;
    target: MangaTile;
  }): Promise<MigrateSummary> {
    const { fromSourceId, fromMangaId, target } = params;

    const targetDetails = await withCloudflareRetry(
      target.sourceId,
      () =>
        runProvider({
          sourceId: target.sourceId,
          operation: "getMangaDetails",
          fn: async () => {
            const provider = await providerRegistry.get(target.sourceId);
            return provider.getMangaDetails(target.mangaId);
          },
        })
    );

    const oldDetails = await this.loadOldDetails(fromSourceId, fromMangaId);
    const oldChapters = oldDetails?.chapters ?? [];

    await rekeyLibraryEntry({
      oldSourceId: fromSourceId,
      oldMangaId: fromMangaId,
      newSourceId: targetDetails.sourceId,
      newMangaId: targetDetails.mangaId,
      title: targetDetails.title,
      coverUrl: targetDetails.coverUrl,
      author: targetDetails.author,
      status: targetDetails.status,
    });

    const transferredProgress = await copyProgressByChapter({
      oldSourceId: fromSourceId,
      oldMangaId: fromMangaId,
      newSourceId: targetDetails.sourceId,
      newMangaId: targetDetails.mangaId,
      oldChapters,
      newChapters: targetDetails.chapters,
    });

    const transferredHistory = await copyHistoryByChapter({
      oldSourceId: fromSourceId,
      oldMangaId: fromMangaId,
      newSourceId: targetDetails.sourceId,
      newMangaId: targetDetails.mangaId,
      newChapters: targetDetails.chapters,
    });

    // Prune the old title's cached data now that progress/history are copied.
    await clearSourceMangaRows(fromSourceId, fromMangaId);

    return {
      transferredProgress,
      transferredHistory,
      targetTitle: targetDetails.title,
      targetCoverUrl: targetDetails.coverUrl,
      targetAuthor: targetDetails.author,
      targetStatus: targetDetails.status,
    };
  },

  /** Load old chapter list (for number matching) from cache, else remotely. */
  async loadOldDetails(
    sourceId: string,
    mangaId: string
  ): Promise<MangaDetails | null> {
    const cached = await LibraryService.getMangaDetailsCached(sourceId, mangaId);
    if (cached) return cached;
    try {
      return await LibraryService.getMangaDetails(sourceId, mangaId);
    } catch {
      // Chapter numbers are a best-effort matching aid; proceed without them
      // (matches by number simply won't resolve for progress rows).
      return null;
    }
  },
};
