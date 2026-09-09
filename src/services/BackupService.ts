import { getDb } from "@/db/client";
import { Directory, File, Paths } from "expo-file-system";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

/**
 * Backup/restore for everything EXCEPT downloaded chapter images.
 *
 * Included: library, categories, reading history, per-chapter progress,
 * the manga metadata snapshot cache (small JSON, not images), and the
 * persisted app settings file.
 *
 * Deliberately excluded:
 *  - `downloads` table + the actual downloaded page files. Chapter/page IDs
 *    are source-specific and can't be "restored" onto a fresh install
 *    meaningfully, and the user explicitly does not want a backup file
 *    bloated with potentially hundreds of megabytes of comic pages.
 *  - `chapter_cache` (the Updates-feed "have we seen this chapter" table).
 *    It's a derived cache the app rebuilds automatically from source data;
 *    restoring stale rows here could actually suppress legitimate "new
 *    chapter" notifications.
 *
 * The format is versioned so a future incompatible schema change can be
 * detected and rejected cleanly instead of silently corrupting the DB.
 */

const BACKUP_FORMAT_VERSION = 1;
const BACKUP_DIR = new Directory(Paths.document, "iro-backups");

export interface IroBackup {
  formatVersion: number;
  appVersion?: string;
  createdAt: string;
  categories: Record<string, unknown>[];
  library: Record<string, unknown>[];
  history: Record<string, unknown>[];
  chapterProgress: Record<string, unknown>[];
  mangaCache: Record<string, unknown>[];
  settingsJson: string | null;
}

export interface BackupSummary {
  categories: number;
  library: number;
  history: number;
  chapterProgress: number;
  mangaCache: number;
}

function summarize(backup: IroBackup): BackupSummary {
  return {
    categories: backup.categories.length,
    library: backup.library.length,
    history: backup.history.length,
    chapterProgress: backup.chapterProgress.length,
    mangaCache: backup.mangaCache.length,
  };
}

const SETTINGS_FILE = new File(new Directory(Paths.document, "iro"), "settings.json");

export const BackupService = {
  /** Build the in-memory backup object (no file I/O beyond reading settings.json). */
  async createBackup(): Promise<IroBackup> {
    const db = await getDb();
    const [categories, library, history, chapterProgress, mangaCache] = await Promise.all([
      db.getAllAsync<Record<string, unknown>>("SELECT * FROM categories"),
      db.getAllAsync<Record<string, unknown>>("SELECT * FROM library"),
      db.getAllAsync<Record<string, unknown>>("SELECT * FROM history"),
      db.getAllAsync<Record<string, unknown>>("SELECT * FROM chapter_progress"),
      db.getAllAsync<Record<string, unknown>>("SELECT * FROM manga_cache"),
    ]);

    let settingsJson: string | null = null;
    try {
      if (SETTINGS_FILE.exists) settingsJson = SETTINGS_FILE.textSync();
    } catch {
      settingsJson = null;
    }

    return {
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt: new Date().toISOString(),
      categories,
      library,
      history,
      chapterProgress,
      mangaCache,
      settingsJson,
    };
  },

  /**
   * Android: writes the backup directly into a user-chosen folder via
   * Storage Access Framework. Returns `granted: false` if the user cancels.
   * Other platforms should use `exportToShareableFile()` instead.
   */
  async exportToDirectory(
    directoryUri: string
  ): Promise<{ granted: true; uri: string; summary: BackupSummary } | { granted: false }> {
    if (Platform.OS !== "android") {
      throw new Error("exportToDirectory is only available on Android; use exportToShareableFile.");
    }
    const backup = await this.createBackup();
    const stamp = backup.createdAt.replace(/[:.]/g, "-");
    const fileUri = await LegacyFileSystem.StorageAccessFramework.createFileAsync(
      directoryUri,
      `iro-backup-${stamp}`,
      "application/json"
    );
    await LegacyFileSystem.StorageAccessFramework.writeAsStringAsync(
      fileUri,
      JSON.stringify(backup, null, 2)
    );
    return { granted: true, uri: fileUri, summary: summarize(backup) };
  },

  /**
   * Fallback export path: writes to the app's cache dir and returns the
   * file URI for expo-sharing to hand off via the OS share sheet.
   */
  async exportToShareableFile(): Promise<{ uri: string; summary: BackupSummary }> {
    const backup = await this.createBackup();
    if (!BACKUP_DIR.exists) BACKUP_DIR.create({ intermediates: true });
    const stamp = backup.createdAt.replace(/[:.]/g, "-");
    const file = new File(BACKUP_DIR, `iro-backup-${stamp}.json`);
    file.write(JSON.stringify(backup, null, 2), { encoding: "utf8" });
    return { uri: file.uri, summary: summarize(backup) };
  },

  /**
   * Reads a backup file given its URI. Uses the legacy `readAsStringAsync`
   * rather than the modern `File` class, since content:// URIs from the
   * system document picker aren't guaranteed to work with the `File` API.
   */
  async readBackupFile(uri: string): Promise<string> {
    return LegacyFileSystem.readAsStringAsync(uri);
  },

  /** Parse and validate a backup JSON string without writing anything. */
  parseBackup(json: string): IroBackup {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("This file isn't valid JSON — it doesn't look like an Iro backup.");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error("This file doesn't look like an Iro backup.");
    }
    const b = parsed as Partial<IroBackup>;
    if (typeof b.formatVersion !== "number") {
      throw new Error("This file doesn't look like an Iro backup (missing format version).");
    }
    if (b.formatVersion > BACKUP_FORMAT_VERSION) {
      throw new Error(
        `This backup was made with a newer version of Iro (format v${b.formatVersion}) than this app supports (v${BACKUP_FORMAT_VERSION}). Update Iro before restoring it.`
      );
    }
    // formatVersion < current: no migrations needed yet (v1 is the only
    // version so far) — once the format changes, per-version upgrade steps
    // belong here rather than a blanket rejection.
    for (const key of ["categories", "library", "history", "chapterProgress", "mangaCache"] as const) {
      if (!Array.isArray(b[key])) {
        throw new Error(`This backup is missing or has a corrupted "${key}" section.`);
      }
    }
    return b as IroBackup;
  },

  /**
   * Restore a backup, REPLACING current library/categories/history/progress/
   * manga-cache and settings. Runs inside a single transaction so a failure
   * partway through can't leave the DB half-restored.
   */
  async restoreBackup(backup: IroBackup): Promise<BackupSummary> {
    const db = await getDb();
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        DELETE FROM chapter_progress;
        DELETE FROM history;
        DELETE FROM library;
        DELETE FROM categories;
        DELETE FROM manga_cache;
      `);

      for (const row of backup.categories) {
        await db.runAsync(
          `INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)`,
          [row.id as number, String(row.name ?? ""), (row.sort_order as number) ?? 0]
        );
      }
      for (const row of backup.library) {
        await db.runAsync(
          `INSERT INTO library (id, source_id, manga_id, title, cover_url, author, status, category_id, added_at, last_fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id as number,
            String(row.source_id ?? ""),
            String(row.manga_id ?? ""),
            String(row.title ?? ""),
            String(row.cover_url ?? ""),
            (row.author as string | null) ?? null,
            String(row.status ?? "unknown"),
            (row.category_id as number | null) ?? null,
            String(row.added_at ?? new Date().toISOString()),
            (row.last_fetched_at as string | null) ?? null,
          ]
        );
      }
      for (const row of backup.history) {
        await db.runAsync(
          `INSERT INTO history (id, source_id, manga_id, chapter_id, chapter_number, read_at, last_page_index)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id as number,
            String(row.source_id ?? ""),
            String(row.manga_id ?? ""),
            String(row.chapter_id ?? ""),
            (row.chapter_number as number) ?? 0,
            String(row.read_at ?? new Date().toISOString()),
            (row.last_page_index as number) ?? 0,
          ]
        );
      }
      for (const row of backup.chapterProgress) {
        await db.runAsync(
          `INSERT INTO chapter_progress (source_id, manga_id, chapter_id, last_page_index, page_count, is_read, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            String(row.source_id ?? ""),
            String(row.manga_id ?? ""),
            String(row.chapter_id ?? ""),
            (row.last_page_index as number) ?? 0,
            (row.page_count as number) ?? 0,
            (row.is_read as number) ?? 0,
            String(row.updated_at ?? new Date().toISOString()),
          ]
        );
      }
      for (const row of backup.mangaCache) {
        await db.runAsync(
          `INSERT INTO manga_cache (source_id, manga_id, details_json, fetched_at) VALUES (?, ?, ?, ?)`,
          [
            String(row.source_id ?? ""),
            String(row.manga_id ?? ""),
            String(row.details_json ?? "{}"),
            String(row.fetched_at ?? new Date().toISOString()),
          ]
        );
      }
    });

    if (backup.settingsJson) {
      try {
        const dir = new Directory(Paths.document, "iro");
        if (!dir.exists) dir.create({ intermediates: true });
        SETTINGS_FILE.write(backup.settingsJson, { encoding: "utf8" });
      } catch {
        // Non-fatal — library/history restore already committed; settings
        // just fall back to whatever was on disk before.
      }
    }

    return summarize(backup);
  },
};
