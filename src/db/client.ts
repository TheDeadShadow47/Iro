import * as SQLite from "expo-sqlite";

const DB_NAME = "honya_comics.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover_url TEXT NOT NULL,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  category_id INTEGER,
  added_at TEXT NOT NULL,
  last_fetched_at TEXT,
  UNIQUE(source_id, manga_id),
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_number REAL NOT NULL,
  read_at TEXT NOT NULL,
  last_page_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_history_manga ON history(source_id, manga_id);

CREATE TABLE IF NOT EXISTS chapter_progress (
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  last_page_index INTEGER NOT NULL DEFAULT 0,
  page_count INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source_id, manga_id, chapter_id)
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_title TEXT NOT NULL,
  chapter_number REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  progress_pages INTEGER NOT NULL DEFAULT 0,
  total_pages INTEGER NOT NULL DEFAULT 0,
  local_dir TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(source_id, manga_id, chapter_id)
);

-- Snapshot of every chapter a source has ever reported for a library title.
-- Diffing an incoming chapter list against this table is how the Updates
-- feed detects "new" chapters without needing a separate events log.
CREATE TABLE IF NOT EXISTS chapter_cache (
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  chapter_number REAL NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  published_at TEXT,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (source_id, manga_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_chapter_cache_seen ON chapter_cache(first_seen_at DESC);

-- Full manga metadata (including chapters) snapshot, so opening a library
-- item can render instantly from disk and refresh remotely in the background
-- instead of blocking on a network round-trip.
CREATE TABLE IF NOT EXISTS manga_cache (
  source_id TEXT NOT NULL,
  manga_id TEXT NOT NULL,
  details_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (source_id, manga_id)
);
`;

/**
 * Additive migrations for columns introduced after the initial CREATE
 * TABLE. Each statement swallows "duplicate column" failures, so this
 * stays a no-op on fresh installs and already-migrated databases.
 */
const MIGRATIONS_SQL: string[] = [
  `ALTER TABLE downloads ADD COLUMN chapter_number REAL NOT NULL DEFAULT 0;`,
];

async function runMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  for (const statement of MIGRATIONS_SQL) {
    try {
      await db.execAsync(statement);
    } catch {
      // Column already exists — table was created by SCHEMA_SQL above, or a
      // previous launch already applied this migration.
    }
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync(SCHEMA_SQL);
      await runMigrations(db);
      return db;
    })();
  }
  return dbPromise;
}

/** Test-only / dev-menu helper to nuke local state. */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM downloads;
    DELETE FROM chapter_progress;
    DELETE FROM history;
    DELETE FROM library;
    DELETE FROM categories;
  `);
}
