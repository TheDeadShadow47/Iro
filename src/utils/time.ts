/** Compact "3h ago" style relative time, used across History/Updates rows. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export type DayGrouped<T> =
  | { type: "header"; id: string; label: string }
  | { type: "row"; id: string; row: T };

/** Groups a list into { header, row } entries by calendar day, in the same
 * order the input arrives (input should already be sorted newest-first). */
export function groupByDay<T>(items: T[], getIso: (item: T) => string): DayGrouped<T>[] {
  const out: DayGrouped<T>[] = [];
  let lastLabel: string | null = null;
  items.forEach((item, i) => {
    const iso = getIso(item);
    const label = dayLabel(iso);
    if (label !== lastLabel) {
      out.push({ type: "header", id: `h-${label}-${i}`, label });
      lastLabel = label;
    }
    out.push({ type: "row", id: `r-${i}`, row: item });
  });
  return out;
}
