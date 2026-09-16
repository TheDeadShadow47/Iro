import { create } from "zustand";
import { Directory, File, Paths } from "expo-file-system";
import { THEMES, type ThemeKey } from "@/theme/theme";

const SETTINGS_DIR = new Directory(Paths.document, "iro");
const SETTINGS_FILE = new File(SETTINGS_DIR, "settings.json");

/** Library screen's "Unread"/"Downloaded"/etc. filter — a user preference
 * for how they view their library, not transient UI state, so it's
 * persisted the same way gridColumns already is. */
export type LibraryFilterMode = "all" | "unread" | "downloaded";
export type LibrarySortMode = "title" | "recentlyAdded" | "recentlyUpdated" | "progress";

interface PersistedSettings {
  registryUrl: string | null;
  theme: ThemeKey;
  gridColumns: number;
  libraryFilter: LibraryFilterMode;
  librarySort: LibrarySortMode;
}

interface SettingsState {
  /** User-configured InkDex registry URL. `null` when none is configured. */
  registryUrl: string | null;
  theme: ThemeKey;
  /** Library grid columns (2..4), persisted. */
  gridColumns: number;
  /** Library screen's selected filter/sort, persisted across navigation
   *  and app restarts. */
  libraryFilter: LibraryFilterMode;
  librarySort: LibrarySortMode;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setRegistryUrl: (url: string | null) => Promise<void>;
  setTheme: (theme: ThemeKey) => Promise<void>;
  setGridColumns: (columns: number) => Promise<void>;
  setLibraryFilter: (filter: LibraryFilterMode) => Promise<void>;
  setLibrarySort: (sort: LibrarySortMode) => Promise<void>;
}

function normalizeColumns(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(4, Math.max(2, Math.round(n))) : 3;
}

/** Validates against the full current theme set — a stored theme key
 *  that doesn't match any known theme falls back to "dark". */
function normalizeTheme(value: unknown): ThemeKey {
  return typeof value === "string" && value in THEMES ? (value as ThemeKey) : "dark";
}

const LIBRARY_FILTER_MODES: LibraryFilterMode[] = ["all", "unread", "downloaded"];
const LIBRARY_SORT_MODES: LibrarySortMode[] = [
  "title",
  "recentlyAdded",
  "recentlyUpdated",
  "progress",
];

function normalizeLibraryFilter(value: unknown): LibraryFilterMode {
  return typeof value === "string" && (LIBRARY_FILTER_MODES as string[]).includes(value)
    ? (value as LibraryFilterMode)
    : "all";
}

function normalizeLibrarySort(value: unknown): LibrarySortMode {
  return typeof value === "string" && (LIBRARY_SORT_MODES as string[]).includes(value)
    ? (value as LibrarySortMode)
    : "title";
}

function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    new URL(value.trim());
    return true;
  } catch {
    return false;
  }
}

/**
 * A registry URL is user configuration. Missing or corrupt values resolve
 * to `null` (no registry) so the app never silently points at a hardcoded
 * repository.
 */
function normalizeRegistryUrl(value: unknown): string | null {
  return isValidUrl(value) ? value.trim() : null;
}

export function safeHost(url: string): string | undefined {
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

/** Returns the settings, rewriting the persisted file if a stored registry URL was corrupt. */
function readSettingsSync(): PersistedSettings {
  let needsRewrite = false;
  if (SETTINGS_FILE.exists) {
    try {
      const parsed = JSON.parse(SETTINGS_FILE.textSync()) as Partial<PersistedSettings>;
      const registryUrl = normalizeRegistryUrl(parsed.registryUrl);
      const theme = normalizeTheme(parsed.theme);
      const gridColumns = normalizeColumns(parsed.gridColumns);
      const libraryFilter = normalizeLibraryFilter(parsed.libraryFilter);
      const librarySort = normalizeLibrarySort(parsed.librarySort);
      if (parsed.registryUrl !== registryUrl) {
        needsRewrite = true;
      }
      const settings: PersistedSettings = {
        registryUrl,
        theme,
        gridColumns,
        libraryFilter,
        librarySort,
      };
      if (needsRewrite) {
        writeSettingsSync(settings);
      }
      return settings;
    } catch {
      // fall through to defaults
    }
  }
  return {
    registryUrl: null,
    theme: "dark",
    gridColumns: 3,
    libraryFilter: "all",
    librarySort: "title",
  };
}

function writeSettingsSync(settings: PersistedSettings) {
  if (!SETTINGS_DIR.exists) {
    SETTINGS_DIR.create({ intermediates: true, idempotent: true });
  }
  SETTINGS_FILE.write(JSON.stringify(settings, null, 2), { encoding: "utf8" });
}

function sync(settings: PersistedSettings) {
  writeSettingsSync(settings);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  registryUrl: null,
  theme: "dark",
  gridColumns: 3,
  libraryFilter: "all",
  librarySort: "title",
  hydrated: false,

  hydrate: async () => {
    const { registryUrl, theme, gridColumns, libraryFilter, librarySort } = readSettingsSync();
    set({ registryUrl, theme, gridColumns, libraryFilter, librarySort, hydrated: true });
  },

  setRegistryUrl: async (registryUrl) => {
    const safe = normalizeRegistryUrl(registryUrl);
    set({ registryUrl: safe });
    sync({
      registryUrl: safe,
      theme: get().theme,
      gridColumns: get().gridColumns,
      libraryFilter: get().libraryFilter,
      librarySort: get().librarySort,
    });
  },

  setTheme: async (theme) => {
    set({ theme });
    sync({
      registryUrl: get().registryUrl,
      theme,
      gridColumns: get().gridColumns,
      libraryFilter: get().libraryFilter,
      librarySort: get().librarySort,
    });
  },

  setGridColumns: async (gridColumns) => {
    const normalized = normalizeColumns(gridColumns);
    set({ gridColumns: normalized });
    sync({
      registryUrl: get().registryUrl,
      theme: get().theme,
      gridColumns: normalized,
      libraryFilter: get().libraryFilter,
      librarySort: get().librarySort,
    });
  },

  setLibraryFilter: async (filter) => {
    const normalized = normalizeLibraryFilter(filter);
    if (get().libraryFilter === normalized) return;
    set({ libraryFilter: normalized });
    sync({
      registryUrl: get().registryUrl,
      theme: get().theme,
      gridColumns: get().gridColumns,
      libraryFilter: normalized,
      librarySort: get().librarySort,
    });
  },

  setLibrarySort: async (sort) => {
    const normalized = normalizeLibrarySort(sort);
    if (get().librarySort === normalized) return;
    set({ librarySort: normalized });
    sync({
      registryUrl: get().registryUrl,
      theme: get().theme,
      gridColumns: get().gridColumns,
      libraryFilter: get().libraryFilter,
      librarySort: normalized,
    });
  },
}));
