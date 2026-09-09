/**
 * Image-quality normalization for comic page images.
 *
 * InkDex/Paperback extensions often return compressed or thumbnailed page
 * URLs even when the full-resolution original is available. This module
 * applies source-agnostic transformations to prefer the highest quality
 * image: MangaDex's `data-saver/` path segment is replaced with `data/`
 * (original, uncompressed). Any unrecognized URL is passed through unchanged.
 */

const MANGA_DEX_DATA_SAVER = /(\/data-saver\/)/i;

/**
 * Return the highest-quality page URL we can derive from what the extension
 * gave us. Pass-through by default; only known, safe transformations are
 * applied.
 */
export function normalizePageImageUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  try {
    if (MANGA_DEX_DATA_SAVER.test(rawUrl)) {
      // MangaDex proxy: `data-saver/` -> `data/` (original, uncompressed).
      return rawUrl.replace(MANGA_DEX_DATA_SAVER, "/data/");
    }
  } catch {
    // Never let malformed URLs break page loading.
  }
  return rawUrl;
}
