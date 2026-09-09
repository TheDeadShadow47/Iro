import { getDb } from "@/db/client";
import type { ChapterInfo, UpdateEntry } from "@/domain/models";

interface CacheRow {
  chapter_id: string;
}

interface FeedRow {
  source_id: string;
  manga_id: string;
  chapter_id: string;
  chapter_number: number;
  title: string;
  first_seen_at: string;
  manga_title: string;
  cover_url: string;
  is_read: number | null;
}

export const updatesRepository = {
  /** Chapter ids already cached for a title, used to diff an incoming list. */
  async getKnownChapterIds(sourceId: string, mangaId: string): Promise<Set<string>> {
    const db = await getDb();
    const rows = await db.getAllAsync<CacheRow>(
      `SELECT chapter_id FROM chapter_cache WHERE source_id = ? AND manga_id = ?`,
      [sourceId, mangaId]
    );
    return new Set(rows.map((r) => r.chapter_id));
  },

  /** Upserts the full incoming chapter list, stamping only genuinely new
   * rows with `firstSeenAt`. Returns how many were new. */
  async syncChapters(
    sourceId: string,
    mangaId: string,
    chapters: ChapterInfo[],
    knownIds: Set<string>
  ): Promise<number> {
    const db = await getDb();
    const now = new Date().toISOString();
    let newCount = 0;
    await db.withTransactionAsync(async () => {
      for (const chapter of chapters) {
        const isNew = !knownIds.has(chapter.chapterId);
        if (isNew) newCount += 1;
        await db.runAsync(
          `INSERT INTO chapter_cache
             (source_id, manga_id, chapter_id, chapter_number, title, published_at, first_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(source_id, manga_id, chapter_id) DO UPDATE SET
             chapter_number = excluded.chapter_number,
             title = excluded.title,
             published_at = excluded.published_at`,
          [
            sourceId,
            mangaId,
            chapter.chapterId,
            chapter.chapterNumber,
            chapter.title,
            chapter.publishedAt ?? null,
            now,
          ]
        );
      }
    });
    return newCount;
  },

  /** Feed of cached chapters for every library title, newest first, with
   * read state resolved from chapter_progress (absent row = unread). */
  async getFeed(limit = 300): Promise<UpdateEntry[]> {
    const db = await getDb();
    const rows = await db.getAllAsync<FeedRow>(
      `SELECT c.source_id, c.manga_id, c.chapter_id, c.chapter_number, c.title,
              c.first_seen_at, l.title AS manga_title, l.cover_url,
              p.is_read
       FROM chapter_cache c
       INNER JOIN library l ON l.source_id = c.source_id AND l.manga_id = c.manga_id
       LEFT JOIN chapter_progress p
         ON p.source_id = c.source_id AND p.manga_id = c.manga_id AND p.chapter_id = c.chapter_id
       ORDER BY c.first_seen_at DESC
       LIMIT ?`,
      [limit]
    );
    return rows.map((r) => ({
      sourceId: r.source_id,
      mangaId: r.manga_id,
      chapterId: r.chapter_id,
      chapterNumber: r.chapter_number,
      chapterTitle: r.title,
      mangaTitle: r.manga_title,
      coverUrl: r.cover_url,
      firstSeenAt: r.first_seen_at,
      isRead: !!r.is_read,
    }));
  },

  async countUnread(): Promise<number> {
    const db = await getDb();
    const row = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM chapter_cache c
       INNER JOIN library l ON l.source_id = c.source_id AND l.manga_id = c.manga_id
       LEFT JOIN chapter_progress p
         ON p.source_id = c.source_id AND p.manga_id = c.manga_id AND p.chapter_id = c.chapter_id
       WHERE p.is_read IS NULL OR p.is_read = 0`
    );
    return row?.count ?? 0;
  },

  /** Drops cached chapters for titles no longer in the library, keeping the
   * table from growing forever once a title is removed. */
  async pruneOrphans(): Promise<void> {
    const db = await getDb();
    await db.runAsync(
      `DELETE FROM chapter_cache
       WHERE NOT EXISTS (
         SELECT 1 FROM library l
         WHERE l.source_id = chapter_cache.source_id AND l.manga_id = chapter_cache.manga_id
       )`
    );
  },
};
