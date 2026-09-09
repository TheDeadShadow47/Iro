import { getDb } from "@/db/client";
import type { ChapterProgress } from "@/domain/models";

interface ProgressRow {
  source_id: string;
  manga_id: string;
  chapter_id: string;
  last_page_index: number;
  page_count: number;
  is_read: number;
  updated_at: string;
}

function rowToProgress(row: ProgressRow): ChapterProgress {
  return {
    sourceId: row.source_id,
    mangaId: row.manga_id,
    chapterId: row.chapter_id,
    lastPageIndex: row.last_page_index,
    pageCount: row.page_count,
    isRead: !!row.is_read,
    updatedAt: row.updated_at,
  };
}

export const progressRepository = {
  async get(
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<ChapterProgress | null> {
    const db = await getDb();
    const row = await db.getFirstAsync<ProgressRow>(
      "SELECT * FROM chapter_progress WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
      [sourceId, mangaId, chapterId]
    );
    return row ? rowToProgress(row) : null;
  },

  async getAllForManga(
    sourceId: string,
    mangaId: string
  ): Promise<ChapterProgress[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<ProgressRow>(
      "SELECT * FROM chapter_progress WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
    return rows.map(rowToProgress);
  },

  async upsert(
    sourceId: string,
    mangaId: string,
    chapterId: string,
    lastPageIndex: number,
    pageCount: number
  ): Promise<void> {
    const db = await getDb();
    const isRead = pageCount > 0 && lastPageIndex >= pageCount - 1 ? 1 : 0;
    await db.runAsync(
      `INSERT INTO chapter_progress
        (source_id, manga_id, chapter_id, last_page_index, page_count, is_read, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_id, manga_id, chapter_id) DO UPDATE SET
         last_page_index = excluded.last_page_index,
         page_count = excluded.page_count,
         is_read = excluded.is_read,
         updated_at = excluded.updated_at`,
      [
        sourceId,
        mangaId,
        chapterId,
        lastPageIndex,
        pageCount,
        isRead,
        new Date().toISOString(),
      ]
    );
  },

  async markRead(
    sourceId: string,
    mangaId: string,
    chapterId: string,
    pageCount: number
  ): Promise<void> {
    await this.upsert(sourceId, mangaId, chapterId, Math.max(pageCount - 1, 0), pageCount);
  },

  /** Resets a chapter back to unread and clears its saved position. */
  async markUnread(sourceId: string, mangaId: string, chapterId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO chapter_progress
        (source_id, manga_id, chapter_id, last_page_index, page_count, is_read, updated_at)
       VALUES (?, ?, ?, 0, 0, 0, ?)
       ON CONFLICT(source_id, manga_id, chapter_id) DO UPDATE SET
         is_read = 0,
         last_page_index = 0,
         updated_at = excluded.updated_at`,
      [sourceId, mangaId, chapterId, new Date().toISOString()]
    );
  },
};
