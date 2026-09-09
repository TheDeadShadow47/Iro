import { getDb } from "@/db/client";
import type { MangaDetails } from "@/domain/models";

/**
 * Local snapshot of full manga metadata (including chapters) so a library
 * item opens instantly from disk and refreshes remotely in the background,
 * rather than blocking on a network round-trip every time.
 */
export const mangaCacheRepository = {
  async get(sourceId: string, mangaId: string): Promise<MangaDetails | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ details_json: string }>(
      `SELECT details_json FROM manga_cache WHERE source_id = ? AND manga_id = ?`,
      [sourceId, mangaId]
    );
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.details_json);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.chapters)) {
        return parsed as MangaDetails;
      }
      return null;
    } catch {
      return null;
    }
  },

  async put(details: MangaDetails): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO manga_cache (source_id, manga_id, details_json, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(source_id, manga_id) DO UPDATE SET
         details_json = excluded.details_json,
         fetched_at = excluded.fetched_at`,
      [details.sourceId, details.mangaId, JSON.stringify(details), new Date().toISOString()]
    );
  },

  /** Remove a title's cached snapshot (e.g. when removed from the library). */
  async remove(sourceId: string, mangaId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `DELETE FROM manga_cache WHERE source_id = ? AND manga_id = ?`,
      [sourceId, mangaId]
    );
  },

  /** Prune snapshots for titles no longer in the library. */
  async pruneOrphans(): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `DELETE FROM manga_cache
       WHERE NOT EXISTS (
         SELECT 1 FROM library l
         WHERE l.source_id = manga_cache.source_id AND l.manga_id = manga_cache.manga_id
       )`
    );
  },
};
