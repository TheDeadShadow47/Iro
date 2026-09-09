/**
 * Iro — Domain Models
 * These types are the contract between InkDexProvider implementations
 * (SandboxInkDexProvider backed by real extension bundles) and everything
 * above them (Services, UI). Nothing above the Service layer should ever
 * import a provider directly — only these shapes.
 */

export type ContentRating = "safe" | "suggestive" | "nsfw" | "unknown";

export type MangaStatus =
  | "ongoing"
  | "completed"
  | "hiatus"
  | "cancelled"
  | "unknown";

export interface SourceInfo {
  id: string; // stable source id, e.g. "inkdex.mockscans"
  name: string;
  version: string;
  iconUrl?: string;
  language: string; // ISO 639-1
  nsfw: ContentRating;
  usesCloudflare: boolean;
  baseUrl: string;
}

export interface MangaTile {
  sourceId: string;
  mangaId: string; // id within the source
  title: string;
  coverUrl: string;
  subtitle?: string;
}

export interface MangaDetails extends MangaTile {
  altTitles: string[];
  author?: string;
  artist?: string;
  description: string;
  genres: string[];
  status: MangaStatus;
  rating: ContentRating;
  chapters: ChapterInfo[];
}

export interface ChapterInfo {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterNumber: number;
  volume?: number;
  title: string;
  publishedAt: string; // ISO date
  scanlator?: string;
  language: string;
}

export interface PageInfo {
  index: number;
  /** Raw URL from the extension. Must be resolved through
   * Application.resolveImageUri() before use in <Image>. */
  rawUrl: string;
  headers?: Record<string, string>;
}

export interface SearchFilters {
  query?: string;
  genres?: string[];
  status?: MangaStatus;
  sortBy?: "relevance" | "latest" | "popularity" | "alphabetical";
}

export interface SearchResultPage {
  tiles: MangaTile[];
  hasNextPage: boolean;
  page: number;
}

// ---------- Persistence-layer models (SQLite rows) ----------

export interface LibraryEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  title: string;
  coverUrl: string;
  author?: string;
  status: MangaStatus;
  categoryId?: number;
  addedAt: string;
  lastFetchedAt?: string;
  /** 0..1 average reading progress across opened chapters (null when none). */
  progress?: number;
  /** True if at least one chapter of this title has a completed download. */
  downloaded?: boolean;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
}

export interface HistoryEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterNumber: number;
  readAt: string;
  lastPageIndex: number;
}

export interface ChapterProgress {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  lastPageIndex: number;
  pageCount: number;
  isRead: boolean;
  updatedAt: string;
}

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "error";

export interface DownloadEntry {
  id: number;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterTitle: string;
  chapterNumber: number;
  status: DownloadStatus;
  progressPages: number;
  totalPages: number;
  localDir?: string;
  errorMessage?: string;
  createdAt: string;
}

/** A chapter surfaced in the Updates feed: a chapter_cache row joined with
 * its library title/cover and read state. */
export interface UpdateEntry {
  sourceId: string;
  mangaId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  mangaTitle: string;
  coverUrl: string;
  firstSeenAt: string;
  isRead: boolean;
}

export interface LibraryUpdateFailure {
  mangaId: string;
  title: string;
  message: string;
}

export interface LibraryUpdateSummary {
  lastUpdateAt: string;
  checked: number;
  updatedTitles: number;
  newChapters: number;
  failed: LibraryUpdateFailure[];
}

export interface LibraryUpdateProgress {
  running: boolean;
  current: number;
  total: number;
  mangaTitle?: string;
}

// ---------- InkDex extension registry (persistence + registry JSON) ----------

export type RegistryContentRating = "SAFE" | "MATURE" | "ADULT";

export interface ExtensionBadge {
  label: string;
  textColor: string;
  backgroundColor: string;
}

export interface ExtensionDeveloper {
  name: string;
  website?: string;
  github?: string;
}

/** One `sources[]` entry in an InkDex `versioning.json` registry index. */
export interface ExtensionManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  icon: string; // relative file, e.g. "icon.png"
  language: string;
  contentRating: RegistryContentRating;
  badges: ExtensionBadge[];
  capabilities: number[];
  developers: ExtensionDeveloper[];
}

export interface RegistryIndex {
  buildTime: string;
  builtWith?: { toolchain?: string; types?: string };
  repository?: { name?: string; description?: string };
  sources: ExtensionManifest[];
}

/** An extension the user has installed; backed by files on disk. */
export interface InstalledExtension {
  id: string;
  name: string;
  description: string;
  version: string;
  language: string;
  contentRating: RegistryContentRating;
  capabilities: number[];
  iconFile: string | null; // absolute local uri of the cached icon
  bundleFile: string; // absolute local uri of the cached bundle.js
  installedAt: string;
}

/** Extension capability bit flags, matching remote `capabilities[]`. */
export const SourceIntent = {
  MANGA_CHAPTERS: 1,
  PROGRESS: 2,
  DISCOVER_SECTIONS: 4,
  MANAGED_COLLECTION: 8,
  CLOUDFLARE_BYPASS: 16,
  SETTINGS_FORM: 32,
  SEARCH_RESULTS: 64,
} as const;

export type SourceIntentFlag = number;

// ---------- Reader configuration ----------

export type ReaderMode = "paged-ltr" | "paged-rtl" | "webtoon";

export interface ReaderSettings {
  mode: ReaderMode;
  cropWhitespace: boolean;
  keepScreenOn: boolean;
  backgroundColor: "black" | "white" | "gray";
}
