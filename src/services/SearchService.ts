import type { MangaTile, SearchFilters, SearchResultPage, SourceInfo } from "@/domain/models";
import { providerRegistry } from "@/services/providerRegistry";
import { withCloudflareRetry } from "@/utils/cloudflareRetry";
import type { SourceError } from "@/utils/sourceErrors";
import { runProvider } from "@/utils/sourceErrors";

/**
 * SearchService — a thin layer over the provider registry. UI never touches a
 * provider directly; it always calls through here, which also owns the
 * Cloudflare-retry policy so screens don't have to know challenges exist.
 *
 * Every provider operation is wrapped by `runProvider`, which classifies the
 * failure into a typed SourceError category and emits structured diagnostics,
 * so screens can distinguish "no results" from "source failed".
 */

export interface GlobalSearchResultTile extends MangaTile {
  sourceName: string;
  /** Source's reliability status for this query, when it failed. */
  failed?: { sourceName: string; category: string; message: string };
}

export interface GlobalSearchError {
  sourceName: string;
  category: string;
  message: string;
}

export interface GlobalSearchResult {
  results: GlobalSearchResultTile[];
  errors: GlobalSearchError[];
}

export const SearchService = {
  listSources(): SourceInfo[] {
    return providerRegistry.listSources();
  },

  async getPopular(sourceId: string, page: number): Promise<SearchResultPage> {
    return withCloudflareRetry(sourceId, () =>
      runProvider({
        sourceId,
        operation: "getPopular",
        fn: () => providerRegistry.get(sourceId).then((p) => p.getPopular(page)),
      })
    );
  },

  async getLatestUpdates(sourceId: string, page: number): Promise<SearchResultPage> {
    return withCloudflareRetry(sourceId, () =>
      runProvider({
        sourceId,
        operation: "getLatestUpdates",
        fn: () => providerRegistry.get(sourceId).then((p) => p.getLatestUpdates(page)),
      })
    );
  },

  async search(
    sourceId: string,
    filters: SearchFilters,
    page: number
  ): Promise<SearchResultPage> {
    return withCloudflareRetry(sourceId, () =>
      runProvider({
        sourceId,
        operation: "search",
        fn: () => providerRegistry.get(sourceId).then((p) => p.search(filters, page)),
      })
    );
  },

  /**
   * Searches every installed source for a query and returns the flat result
   * set tagged with which source each hit came from, plus per-source failure
   * records (name + category + safe message), instead of an anonymous count.
   */
  async globalSearch(query: string): Promise<GlobalSearchResult> {
    const q = query.trim();
    if (!q) return { results: [], errors: [] };

    const sources = SearchService.listSources();
    const queries = sources.map(async (source) => {
      try {
        const page = await SearchService.search(source.id, { query: q }, 1);
        return { source, tiles: page.tiles };
      } catch (err) {
        const se = err as SourceError;
        return {
          source,
          failed: {
            sourceName: source.name,
            category: se?.category ?? "UNKNOWN_ERROR",
            message: se?.causeMessage ?? "This source encountered an error.",
          },
        };
      }
    });

    const settled = await Promise.all(queries);
    const errors: GlobalSearchError[] = [];
    const results: GlobalSearchResultTile[] = [];
    for (const item of settled) {
      if (!item) continue;
      if ("failed" in item && item.failed) {
        errors.push(item.failed);
        continue;
      }
      for (const tile of (item as { tiles: MangaTile[] }).tiles) {
        results.push({ ...tile, sourceName: item.source.name });
      }
    }
    return { results, errors };
  },
};

export { withCloudflareRetry };
