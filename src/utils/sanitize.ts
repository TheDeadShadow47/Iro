/**
 * Sanitization/normalization of metadata that flows out of provider layer
 * mappers into domain models (details, chapters, search tiles). The provider
 * layer is the single chokepoint through which ALL source data passes, so
 * normalizing here guarantees nothing raw ever reaches the DB, snapshot
 * cache, chapter cache, or UI.
 *
 * Contrast with date handling (src/utils/dateTime.ts), which has real
 * domain semantics. This module is purely defensive: strip control chars,
 * collapse whitespace, coerce numbers, and drop clearly-invalid cover URLs.
 */

/** Strips zero-width/control chars and collapses runs of whitespace. */
export function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b\u200c\u200d\u200e\u200f\u2060\ufeff]/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Clean a text field, returning undefined when empty (optional fields). */
export function cleanOptionalText(value: unknown): string | undefined {
  const cleaned = cleanText(value);
  return cleaned || undefined;
}

/** A finite number >= 0, or undefined when not a usable value. */
export function cleanNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * A finite number, allowing negatives where meaningful (e.g. chapter number
 * 0), or undefined when not usable.
 */
export function cleanFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : undefined;
}

const HAS_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i;

/**
 * A usable image/media URL must be absolute (start with a scheme) and not be
 * obvious garbage (e.g. "undefined", "null"). Returns "" when invalid so
 * callers fall back to a placeholder.
 */
export function cleanUrl(value: unknown): string {
  const v = cleanText(value);
  if (!v || v === "undefined" || v === "null") return "";
  if (!HAS_PROTOCOL.test(v)) return "";
  return v;
}

/** Clean a language/scanlator-ish short token: collapse and limit length. */
export function cleanToken(value: unknown, maxLength = 64): string | undefined {
  const v = cleanText(value).replace(/\s+/g, " ").trim();
  if (!v) return undefined;
  return v.length > maxLength ? v.slice(0, maxLength) : v;
}

/**
 * Clean a single genre/tag label.
 *
 * Some extensions expose "tag groups" that aren't genres at all — a
 * source-specific info/warning/notes group whose "tags" are actually full
 * sentences ("A Chinese character can mean either...") or stray links,
 * rather than short labels ("Action", "Isekai"). The provider layer
 * flattens every tag group it's given (generic, source-agnostic — it can't
 * know which group ids are "real" per source), so this is the chokepoint
 * that has to tell a genre apart from leaked prose.
 *
 * Heuristic, deliberately conservative so real genres are never dropped:
 * a real tag/genre label is short and doesn't read like a sentence or
 * contain a URL. Anything longer, or containing sentence punctuation or a
 * link, is almost certainly not a genre and is dropped rather than shown
 * to the user as one.
 */
export function cleanGenreTag(value: unknown): string | undefined {
  const v = cleanText(value);
  if (!v) return undefined;
  if (v.length > 40) return undefined; // genres are short labels, not prose
  if (/https?:\/\/|www\./i.test(v)) return undefined; // stray link
  if (/[.!?;:]$/.test(v)) return undefined; // sentence-ending punctuation
  if ((v.match(/\s/g)?.length ?? 0) > 5) return undefined; // too many words for a tag
  // A leading decimal number ("2.3 reincarnation", "2.0 long strip") is a
  // stray numeric score/version id that got concatenated with the label by
  // the source, not part of a real genre name — no real genre is named
  // "2.3 <anything>".
  if (/^-?\d+\.\d+\s/.test(v)) return undefined;
  return v;
}

/**
 * Clean a manga/chapter description (synopsis).
 *
 * Unlike `cleanGenreTag`, a description SHOULD be prose, so this only
 * strips lines that are clearly not part of the synopsis itself: bare
 * links, and common scanlator/translator editorial notes that sources
 * sometimes bake directly into the description text (rather than a
 * separate field). Line-based and conservative — never rewrites or
 * truncates the actual synopsis content.
 */
const NOTE_LINE_PATTERN =
  /^(tl;?\s*note|t\/?n|translator'?s?\s*note|editor'?s?\s*note|note)\s*[:\-]/i;
const LINK_ONLY_LINE = /^https?:\/\/\S+$|^www\.\S+$/i;

export function cleanDescription(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !LINK_ONLY_LINE.test(line) && !NOTE_LINE_PATTERN.test(line));
  return cleanText(lines.join("\n"));
}
