import type { MangaTile, SearchFilters, SearchResultPage, SourceInfo } from "@/domain/models";
import { providerRegistry } from "@/services/providerRegistry";
import { DEFAULT_PAGE_SIZE } from "@/providers/sandbox/SandboxInkDexProvider";
import { withCloudflareRetry } from "@/utils/cloudflareRetry";
import type { SourceError } from "@/utils/sourceErrors";
import { runProvider } from "@/utils/sourceErrors";

/**
 * Global Search fans out to every installed provider. `SandboxInkDexProvider
 * .initialize()` evaluates an extension's whole bundle via `new Function`,
 * which is synchronous, uninterruptible JS-thread work — running that for
 * every installed source in one `Promise.all` (as this used to) executes all
 * of them back-to-back in a single synchronous burst before the event loop
 * gets a turn, which is what made typing/input feel frozen with many
 * extensions installed. `GLOBAL_SEARCH_CONCURRENCY` bounds how many of those
 * bursts can be in flight at once, and `mapWithConcurrency` inserts a real
 * macrotask yield between pickups so RN can process pending input/frames.
 */
const GLOBAL_SEARCH_CONCURRENCY = 4;
/** A single source shouldn't be able to hang the whole aggregate — if it
 * hasn't answered in this long, treat it like any other failed source and
 * let the rest of the results through. */
const GLOBAL_SEARCH_TIMEOUT_MS = 20_000;

class SearchTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new SearchTimeoutError("Timed out waiting for a response"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/** Runs `fn` over `items` with at most `limit` in flight at a time. Between
 * every pickup each worker yields to the event loop (a real `setTimeout`
 * macrotask, not just a microtask) so heavy synchronous work started by
 * `fn` can't monopolize the JS thread across the whole batch. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
      // Give the JS thread a real breather before grabbing the next item —
      // this is what keeps the search input responsive while many sources
      // are still being searched.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

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

    // Concurrency-limited (not one big Promise.all across every installed
    // source) so we never launch more than a handful of heavy provider
    // initializations/searches in the same JS-thread burst — see the note
    // above mapWithConcurrency. Each source still runs fully independently:
    // a throw/timeout here only affects that source's own entry.
    const settled = await mapWithConcurrency(sources, GLOBAL_SEARCH_CONCURRENCY, async (source) => {
      try {
        const page = await withTimeout(
          SearchService.search(source.id, { query: q }, 1),
          GLOBAL_SEARCH_TIMEOUT_MS
        );
        // A single source shouldn't be able to flood the aggregate (and the
        // result list) with hundreds/thousands of tiles — this is page 1
        // only, capped to the same page size the provider layer itself uses.
        return { source, tiles: page.tiles.slice(0, DEFAULT_PAGE_SIZE) };
      } catch (err) {
        if (err instanceof SearchTimeoutError) {
          return {
            source,
            failed: {
              sourceName: source.name,
              category: "TIMEOUT",
              message: "This source took too long to respond.",
            },
          };
        }
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
