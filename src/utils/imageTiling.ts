import { Directory, File, Paths } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { md5 } from "js-md5";

/**
 * Android's hardware-accelerated Canvas refuses to draw a bitmap over
 * ~25M pixels (~100MB ARGB_8888), and GPU textures are commonly capped
 * at ~4096px. A raw webtoon long-strip segment can legitimately be
 * 800x20000+, well past both ceilings. These budgets are deliberately
 * conservative (well under the crash ceiling and lowest texture cap) so
 * tiling kicks in with real margin.
 */
const SAFE_TOTAL_PIXEL_BUDGET = 16_000_000; // ~4096x4096
const MAX_SAFE_TILE_DIMENSION = 4096;

export interface TilingDecision {
  needsTiling: boolean;
  /** Height in source pixels of every tile except possibly the last. */
  tileHeightPx: number;
  tileCount: number;
}

/**
 * Decides whether a page's NATURAL (source-pixel) dimensions are safe to
 * decode as a single bitmap, or need splitting into vertical tiles first.
 * Pure/cheap — safe to call for every page once its natural size is known.
 */
export function planTiling(naturalWidth: number, naturalHeight: number): TilingDecision {
  const totalPixels = naturalWidth * naturalHeight;
  const needsTiling = totalPixels > SAFE_TOTAL_PIXEL_BUDGET || naturalHeight > MAX_SAFE_TILE_DIMENSION;
  if (!needsTiling) {
    return { needsTiling: false, tileHeightPx: naturalHeight, tileCount: 1 };
  }
  // Pick a tile height that keeps EVERY tile under both the per-dimension
  // cap and the total-pixel budget, so it's safe regardless of which limit
  // a given device actually enforces.
  const byPixelBudget = Math.floor(SAFE_TOTAL_PIXEL_BUDGET / Math.max(naturalWidth, 1));
  const tileHeightPx = Math.max(1, Math.min(MAX_SAFE_TILE_DIMENSION, byPixelBudget));
  const tileCount = Math.ceil(naturalHeight / tileHeightPx);
  return { needsTiling: true, tileHeightPx, tileCount };
}

export interface ImageTile {
  uri: string;
  /** Height of this tile in source pixels (last tile may be shorter). */
  heightPx: number;
}

const TILE_CACHE_DIR = new Directory(Paths.cache, "reader-tiles");

function cacheKeyFor(uri: string, naturalWidth: number, naturalHeight: number): string {
  return md5.hex(`${uri}|${naturalWidth}x${naturalHeight}`);
}

/**
 * Downloads the full image once and slices it into vertically-stacked
 * tiles, each safely under the native decode limits `planTiling` guards
 * against. Cache is keyed by URL + natural dimensions; idempotent on
 * re-open. Tiles are saved as JPEG at maximum quality (compress: 1) to
 * minimize re-encode loss — only runs for the rare oversized-page case.
 */
export async function getOrCreateTiles(
  uri: string,
  headers: Record<string, string> | undefined,
  naturalWidth: number,
  naturalHeight: number,
  plan: TilingDecision,
  forceRegenerate = false
): Promise<ImageTile[]> {
  const key = cacheKeyFor(uri, naturalWidth, naturalHeight);
  const tileDir = new Directory(TILE_CACHE_DIR, key);

  const expected: ImageTile[] = [];
  for (let i = 0; i < plan.tileCount; i++) {
    const h = Math.min(plan.tileHeightPx, naturalHeight - i * plan.tileHeightPx);
    expected.push({ uri: new File(tileDir, `${i}.jpg`).uri, heightPx: h });
  }

  if (!forceRegenerate && tileDir.exists && expected.every((t) => new File(t.uri).exists)) {
    return expected;
  }

  // Local files (downloaded chapters) can be cropped directly.
  // Remote pages must be materialized to a local file first —
  // expo-image-manipulator only operates on local/base64 sources.
  let localSourceUri = uri;
  let tempDownload: File | null = null;
  if (!uri.startsWith("file://")) {
    tempDownload = new File(Paths.cache, `reader-tiles-src-${key}.tmp`);
    await File.downloadFileAsync(uri, tempDownload, { headers, idempotent: true });
    localSourceUri = tempDownload.uri;
  }

  try {
    if (tileDir.exists) tileDir.delete();
    tileDir.create({ intermediates: true });

    for (let i = 0; i < plan.tileCount; i++) {
      const originY = i * plan.tileHeightPx;
      const height = Math.min(plan.tileHeightPx, naturalHeight - originY);
      const result = await manipulateAsync(
        localSourceUri,
        [{ crop: { originX: 0, originY, width: naturalWidth, height } }],
        { compress: 1, format: SaveFormat.JPEG }
      );
      const dest = new File(tileDir, `${i}.jpg`);
      await new File(result.uri).move(dest);
    }
  } finally {
    if (tempDownload?.exists) {
      try {
        tempDownload.delete();
      } catch {
        // best-effort cleanup of the scratch download
      }
    }
  }

  return expected;
}

/** Best-effort cleanup for a chapter's generated tiles — keeps the OS
 * cache dir from accumulating indefinitely. Safe to skip; the OS can
 * reclaim `Paths.cache` under pressure regardless. */
export function pruneTileCache(maxDirs = 20): void {
  try {
    if (!TILE_CACHE_DIR.exists) return;
    const dirs = TILE_CACHE_DIR.list().filter((e): e is Directory => e instanceof Directory);
    if (dirs.length <= maxDirs) return;
    // No per-dir mtime is readily available; drop the oldest-created half
    // by directory listing order, which is good enough for a soft cap.
    for (const d of dirs.slice(0, dirs.length - maxDirs)) {
      try {
        d.delete();
      } catch {
        // best-effort
      }
    }
  } catch {
    // best-effort — never let cache maintenance break reading
  }
}
