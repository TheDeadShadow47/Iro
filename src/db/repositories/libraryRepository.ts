import { getDb } from "@/db/client";
import type { LibraryEntry, MangaDetails } from "@/domain/models";

interface LibraryRow {
  id: number;
  source_id: string;
  manga_id: string;
  title: string;
  cover_url: string;
  author: string | null;
  status: string;
  category_id: number | null;
  added_at: string;
  last_fetched_at: string | null;
}

function rowToEntry(row: LibraryRow & { progress: number | null; downloaded: number | null }): LibraryEntry {
  return {
    id: row.id,
    sourceId: row.source_id,
    mangaId: row.manga_id,
    title: row.title,
    coverUrl: row.cover_url,
    author: row.author ?? undefined,
    status: row.status as LibraryEntry["status"],
    categoryId: row.category_id ?? undefined,
    addedAt: row.added_at,
    lastFetchedAt: row.last_fetched_at ?? undefined,
    progress: row.progress ?? undefined,
    downloaded: !!row.downloaded,
  };
}

const PROGRESS_SUBQUERY = `(SELECT AVG(
                  CASE
                    WHEN p.page_count > 0 THEN
                      MIN(CAST(p.last_page_index AS REAL) + 1, CAST(p.page_count AS REAL)) / CAST(p.page_count AS REAL)
                    ELSE 0
                  END)
          FROM chapter_progress p
          WHERE p.source_id = l.source_id AND p.manga_id = l.manga_id) AS progress`;

const DOWNLOADED_SUBQUERY = `EXISTS (
          SELECT 1 FROM downloads d
          WHERE d.source_id = l.source_id AND d.manga_id = l.manga_id AND d.status = 'completed'
        ) AS downloaded`;

export const libraryRepository = {
  async getAll(): Promise<LibraryEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<LibraryRow & { progress: number | null; downloaded: number | null }>(
      `SELECT l.*, ${PROGRESS_SUBQUERY}, ${DOWNLOADED_SUBQUERY}
       FROM library l
       ORDER BY l.title ASC`
    );
    return rows.map(rowToEntry);
  },

  async getByCategory(categoryId: number | null): Promise<LibraryEntry[]> {
    const db = await getDb();
    const select = `SELECT l.*, ${PROGRESS_SUBQUERY}, ${DOWNLOADED_SUBQUERY}
      FROM library l`;
    const rows: (LibraryRow & { progress: number | null; downloaded: number | null })[] =
      categoryId === null
        ? await db.getAllAsync(`${select} WHERE l.category_id IS NULL ORDER BY l.title ASC`)
        : await db.getAllAsync(`${select} WHERE l.category_id = ? ORDER BY l.title ASC`, [
            categoryId,
          ]);
    return rows.map(rowToEntry);
  },

  async isInLibrary(sourceId: string, mangaId: string): Promise<boolean> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM library WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
    return !!row;
  },

  async add(details: MangaDetails): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT OR IGNORE INTO library
        (source_id, manga_id, title, cover_url, author, status, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        details.sourceId,
        details.mangaId,
        details.title,
        details.coverUrl,
        details.author ?? null,
        details.status,
        new Date().toISOString(),
      ]
    );
  },

  async remove(sourceId: string, mangaId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "DELETE FROM library WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
  },

  /** Bulk removal for library selection mode — one transaction instead of
   * N sequential deletes. */
  async removeMany(keys: { sourceId: string; mangaId: string }[]): Promise<void> {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      for (const { sourceId, mangaId } of keys) {
        await db.runAsync(
          "DELETE FROM library WHERE source_id = ? AND manga_id = ?",
          [sourceId, mangaId]
        );
      }
    });
  },

  async setCategory(
    sourceId: string,
    mangaId: string,
    categoryId: number | null
  ): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "UPDATE library SET category_id = ? WHERE source_id = ? AND manga_id = ?",
      [categoryId, sourceId, mangaId]
    );
  },

  async touchFetchedAt(sourceId: string, mangaId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "UPDATE library SET last_fetched_at = ? WHERE source_id = ? AND manga_id = ?",
      [new Date().toISOString(), sourceId, mangaId]
    );
  },
};
