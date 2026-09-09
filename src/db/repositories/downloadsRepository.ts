import { getDb } from "@/db/client";
import type { DownloadEntry, DownloadStatus } from "@/domain/models";

interface DownloadRow {
  id: number;
  source_id: string;
  manga_id: string;
  chapter_id: string;
  chapter_title: string;
  chapter_number: number;
  status: string;
  progress_pages: number;
  total_pages: number;
  local_dir: string | null;
  error_message: string | null;
  created_at: string;
}

function rowToEntry(row: DownloadRow): DownloadEntry {
  return {
    id: row.id,
    sourceId: row.source_id,
    mangaId: row.manga_id,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    chapterNumber: row.chapter_number,
    status: row.status as DownloadStatus,
    progressPages: row.progress_pages,
    totalPages: row.total_pages,
    localDir: row.local_dir ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}

export const downloadsRepository = {
  async getAll(): Promise<DownloadEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<DownloadRow>(
      "SELECT * FROM downloads ORDER BY created_at DESC"
    );
    return rows.map(rowToEntry);
  },

  async getForManga(sourceId: string, mangaId: string): Promise<DownloadEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<DownloadRow>(
      "SELECT * FROM downloads WHERE source_id = ? AND manga_id = ?",
      [sourceId, mangaId]
    );
    return rows.map(rowToEntry);
  },

  async enqueue(
    sourceId: string,
    mangaId: string,
    chapterId: string,
    chapterTitle: string,
    chapterNumber: number,
    totalPages: number
  ): Promise<number> {
    const db = await getDb();
    const result = await db.runAsync(
      `INSERT INTO downloads
        (source_id, manga_id, chapter_id, chapter_title, chapter_number, status, progress_pages, total_pages, created_at)
       VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?)
       ON CONFLICT(source_id, manga_id, chapter_id) DO UPDATE SET status = 'queued', chapter_number = excluded.chapter_number`,
      [sourceId, mangaId, chapterId, chapterTitle, chapterNumber, totalPages, new Date().toISOString()]
    );
    return result.lastInsertRowId;
  },

  async updateProgress(id: number, progressPages: number): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "UPDATE downloads SET status = 'downloading', progress_pages = ? WHERE id = ?",
      [progressPages, id]
    );
  },

  async setTotalPages(id: number, totalPages: number): Promise<void> {
    const db = await getDb();
    await db.runAsync("UPDATE downloads SET total_pages = ? WHERE id = ?", [totalPages, id]);
  },

  async complete(id: number, localDir: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "UPDATE downloads SET status = 'completed', local_dir = ? WHERE id = ?",
      [localDir, id]
    );
  },

  async fail(id: number, message: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "UPDATE downloads SET status = 'error', error_message = ? WHERE id = ?",
      [message, id]
    );
  },

  async remove(id: number): Promise<void> {
    const db = await getDb();
    await db.runAsync("DELETE FROM downloads WHERE id = ?", [id]);
  },

  async removeByChapter(sourceId: string, mangaId: string, chapterId: string): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      "DELETE FROM downloads WHERE source_id = ? AND manga_id = ? AND chapter_id = ?",
      [sourceId, mangaId, chapterId]
    );
  },
};
