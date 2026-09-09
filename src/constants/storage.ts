/**
 * Canonical on-device directory names for Iro's storage.
 *
 * Renaming DOWNLOADS_DIR_NAME is safe for existing installs: chapters are
 * addressed by the absolute path stored per-row in `downloads.local_dir`,
 * not by re-deriving from this constant.
 */
export const EXTENSIONS_DIR_NAME = "iro-extensions";
export const DOWNLOADS_DIR_NAME = "iro-downloads";
