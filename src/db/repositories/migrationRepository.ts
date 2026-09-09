import { getDb } from "@/db/client";
import type { ChapterInfo } from "@/domain/models";

interface NumberedChapter {
  chapterId: string;
  chapterNumber: number;
}

/**
 * Re-points a library title from one source to another, preserving the added
 * timestamp, category, and other stored metadata. If the target (source, manga)
 * already exists, its row is updated in-place.
 */
export async function rekeyLibraryEntry(params: {
  oldSourceId: string;
  oldMangaId: string;
  newSourceId: string;
  newMangaId: string;
  title: string;
  coverUrl: string;
  author?: string;
  status?: string;
}): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{
      title: string;
      cover_url: string;
      author: string | null;
      status: string;
      category_id: number | null;
      added_at: string;
    }>(
      "SELECT title, cover_url, author, status, category_id, added_at FROM library WHERE source_id = ? AND manga_id = ?",
      [params.newSourceId, params.newMangaId]
    );

    const title = params.title || existing?.title || "Untitled";
    const cover = params.coverUrl || existing?.cover_url || "";
    const author = params.author !== undefined ? params.author : (existing?.author ?? undefined);
    const status = params.status || existing?.status || "unknown";
    const categoryId = existing?.category_id ?? null;
    const addedAt = existing?.added_at ?? new Date().toISOString();

    await db.runAsync(
      `INSERT INTO library
        (source_id, manga_id, title, cover_url, author, status, category_id, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id, manga_id) DO UPDATE SET
         title = excluded.title,
         cover_url = excluded.cover_url,
         author = excluded.author,
         status = excluded.status`,
      [params.newSourceId, params.newMangaId, title, cover, author ?? null, status, categoryId, addedAt]
    );

    await db.runAsync(
      "DELETE FROM library WHERE source_id = ? AND manga_id = ?",
      [params.oldSourceId, params.oldMangaId]
    );
  });
}

/**
 * Best-effort copy of chapter progress (read state) from old source to new,
 * matching chapters by chapter number between the two chapter lists. Uses a
 * small tolerance so float drift doesn't lose matches. Returns the number of
 * progress rows transferred.
 */
export async function copyProgressByChapter(params: {
  oldSourceId: string;
  oldMangaId: string;
  newSourceId: string;
  newMangaId: string;
  oldChapters: NumberedChapter[];
  newChapters: ChapterInfo[];
}): Promise<number> {
  const db = await getDb();
  const oldRows = await db.getAllAsync<{
    chapter_id: string;
    last_page_index: number;
    page_count: number;
    is_read: number;
  }>(
    "SELECT chapter_id, last_page_index, page_count, is_read FROM chapter_progress WHERE source_id = ? AND manga_id = ?",
    [params.oldSourceId, params.oldMangaId]
  );
  if (oldRows.length === 0 || params.newChapters.length === 0) return 0;

  const oldIdToNumber = new Map<string, number>();
  for (const c of params.oldChapters) oldIdToNumber.set(c.chapterId, c.chapterNumber);

  const targetByNumber = new Map<number, string>();
  for (const c of params.newChapters) {
    if (!targetByNumber.has(c.chapterNumber)) targetByNumber.set(c.chapterNumber, c.chapterId);
  }

  const E = 1e-6;
  let transferred = 0;
  await db.withTransactionAsync(async () => {
    for (const row of oldRows) {
      const num = oldIdToNumber.get(row.chapter_id);
      if (num === undefined) continue;
      const targetId = findNearest(targetByNumber, num, E);
      if (!targetId) continue;
      await db.runAsync(
        `INSERT INTO chapter_progress
          (source_id, manga_id, chapter_id, last_page_index, page_count, is_read, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source_id, manga_id, chapter_id) DO UPDATE SET
           last_page_index = excluded.last_page_index,
           page_count = excluded.page_count,
           is_read = excluded.is_read,
           updated_at = excluded.updated_at`,
        [params.newSourceId, params.newMangaId, targetId, row.last_page_index, row.page_count, row.is_read, new Date().toISOString()]
      );
      transferred++;
    }
  });
  return transferred;
}

/**
 * Copy history rows from old source to new by matching chapter number against
 * the new chapter list (nearest match within tolerance). Returns the number of
 * history rows transferred.
 */
export async function copyHistoryByChapter(params: {
  oldSourceId: string;
  oldMangaId: string;
  newSourceId: string;
  newMangaId: string;
  newChapters: ChapterInfo[];
}): Promise<number> {
  const db = await getDb();
  const oldRows = await db.getAllAsync<{
    chapter_number: number;
    read_at: string;
    last_page_index: number;
  }>(
    "SELECT chapter_number, read_at, last_page_index FROM history WHERE source_id = ? AND manga_id = ?",
    [params.oldSourceId, params.oldMangaId]
  );
  if (oldRows.length === 0 || params.newChapters.length === 0) return 0;

  const targetByNumber = new Map<number, string>();
  for (const c of params.newChapters) {
    if (!targetByNumber.has(c.chapterNumber)) targetByNumber.set(c.chapterNumber, c.chapterId);
  }

  const E = 1e-6;
  let transferred = 0;
  await db.withTransactionAsync(async () => {
    for (const row of oldRows) {
      const targetId = findNearest(targetByNumber, row.chapter_number, E);
      if (!targetId) continue;
      await db.runAsync(
        `INSERT INTO history (source_id, manga_id, chapter_id, chapter_number, read_at, last_page_index)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [params.newSourceId, params.newMangaId, targetId, row.chapter_number, row.read_at, row.last_page_index]
      );
      transferred++;
    }
  });
  return transferred;
}

/** Strip the old progress rows (called after successful copy). */
export async function clearSourceMangaRows(sourceId: string, mangaId: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      "DELETE FROM chapter_progress WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
    await db.runAsync(
      "DELETE FROM chapter_cache WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
    await db.runAsync(
      "DELETE FROM manga_cache WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
  });
}

function findNearest(map: Map<number, string>, value: number, tolerance: number): string | undefined {
  const exact = map.get(value);
  if (exact) return exact;
  for (const [num, id] of map) {
    if (Math.abs(num - value) <= tolerance) return id;
  }
  return undefined;
}
