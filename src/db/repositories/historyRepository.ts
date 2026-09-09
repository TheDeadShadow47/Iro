import { getDb } from "@/db/client";
import type { HistoryEntry } from "@/domain/models";

interface HistoryRow {
  id: number;
  source_id: string;
  manga_id: string;
  chapter_id: string;
  chapter_number: number;
  read_at: string;
  last_page_index: number;
}

function rowToEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    sourceId: row.source_id,
    mangaId: row.manga_id,
    chapterId: row.chapter_id,
    chapterNumber: row.chapter_number,
    readAt: row.read_at,
    lastPageIndex: row.last_page_index,
  };
}

export const historyRepository = {
  async getRecent(limit = 50): Promise<HistoryEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<HistoryRow>(
      "SELECT * FROM history ORDER BY read_at DESC LIMIT ?",
      [limit]
    );
    return rows.map(rowToEntry);
  },

  async recordOpen(
    sourceId: string,
    mangaId: string,
    chapterId: string,
    chapterNumber: number,
    lastPageIndex: number
  ): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `INSERT INTO history (source_id, manga_id, chapter_id, chapter_number, read_at, last_page_index)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        sourceId,
        mangaId,
        chapterId,
        chapterNumber,
        new Date().toISOString(),
        lastPageIndex,
      ]
    );
  },

  async clearForManga(sourceId: string, mangaId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "DELETE FROM history WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
  },
};
