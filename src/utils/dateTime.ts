/**
 * Date parsing/normalization for chapter publication timestamps.
 *
 * InkDex/Paperback extensions report chapter `publishDate` as a Unix
 * timestamp that may be in SECONDS (the Paperback convention), and some
 * extensions give milliseconds or ISO strings. Feeding seconds into
 * `new Date()` (which expects ms) produces Jan 1970. Sources may also omit a
 * date entirely.
 *
 * Contract: these helpers NEVER fabricate a date. A missing/invalid value
 * yields an empty ISO string (`""`), which callers render as "Unknown" rather
 * than a fake epoch date, and `timestampMs` returns NaN so callers can sort
 * unknowns last.
 */

/**
 * Convert an unknown date value (seconds, ms, ISO string, Date, or nullish)
 * into an ISO string, or `""` when no valid date exists.
 */
export function toSafeIso(value: unknown): string {
  const ms = toTimestampMs(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

/**
 * Convert an unknown date value into milliseconds, or NaN when invalid.
 *
 * Rules:
 *  - Date instance      -> getTime()
 *  - string that parses -> parsed ms (ISO / RFC3339)
 *  - number             -> if it "looks like" seconds (< 1e12) multiply by 1000,
 *                          otherwise treat as milliseconds
 */
export function toTimestampMs(value: unknown): number {
  if (value == null) return NaN;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? NaN : t;
  }
  if (typeof value === "number") {
    return normalizeNumberDate(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return NaN;
    // Pure numeric string (seconds or ms).
    if (/^-?\d+$/.test(trimmed)) {
      return normalizeNumberDate(Number(trimmed));
    }
    const t = new Date(trimmed).getTime();
    return Number.isNaN(t) ? NaN : t;
  }
  return NaN;
}

function normalizeNumberDate(n: number): number {
  if (!Number.isFinite(n)) return NaN;
  // 0 (and any non-positive value) is never a real publish timestamp for a
  // chapter — it's the exact "Jan 1, 1970" sentinel this helper exists to
  // avoid, and some extensions send a bare `0`/`null->0` for "no date"
  // instead of omitting the field entirely (unlike MangaFire's bundle,
  // which guards with `e.createdAt ? ... : void 0`, not every source does).
  if (n <= 0) return NaN;
  // Unix seconds are in the ~1e9..1e10 range; treating them as ms is the
  // classic "Jan 1970" bug. A value this small that isn't a decimal fraction
  // of a millisecond is almost certainly seconds.
  const abs = Math.abs(n);
  if (abs < 1e12) return n * 1000;
  return n;
}

/** True when an ISO string carries a real (valid) date. */
export function hasValidDate(iso: string | undefined | null): boolean {
  if (!iso) return false;
  return Number.isFinite(toTimestampMs(iso));
}
