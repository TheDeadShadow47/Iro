import { isCloudflareChallenge } from "@/providers/InkDexProvider";

/**
 * Typed error boundaries around provider operations so the app can tell
 * "genuinely no results" apart from "the source/network failed" — instead of
 * collapsing every failure into an empty "Nothing here yet".
 *
 * Category contract:
 *   NO_RESULTS        — the source legitimately returned no items (valid empty)
 *   NETWORK_ERROR     - fetch/network transport failure (offline, DNS, timeout, 5xx)
 *   EXTENSION_ERROR   - the extension's own code threw (parser/selector/runtime)
 *   INVALID_RESPONSE  - the extension returned data the runtime cannot map
 *   PARSING_ERROR     - an HTML/JSON parse step failed mid-pipeline
 *   IMAGE_ERROR       - a chapter/image resource failed to resolve/load
 *   CANCELLED         - the operation was aborted
 *   UNKNOWN_ERROR     - everything else (fallback)
 */

export const SourceErrorCategory = {
  NO_RESULTS: "NO_RESULTS",
  NETWORK_ERROR: "NETWORK_ERROR",
  EXTENSION_ERROR: "EXTENSION_ERROR",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  PARSING_ERROR: "PARSING_ERROR",
  IMAGE_ERROR: "IMAGE_ERROR",
  CANCELLED: "CANCELLED",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type SourceErrorCategory =
  (typeof SourceErrorCategory)[keyof typeof SourceErrorCategory];

export type SourceOperation =
  | "initialize"
  | "getPopular"
  | "getLatestUpdates"
  | "search"
  | "getMangaDetails"
  | "getChapters"
  | "getPageList"
  | "resolveImage"
  | "download";

export class SourceError extends Error {
  readonly category: SourceErrorCategory;
  readonly sourceId?: string;
  readonly operation?: SourceOperation;
  readonly override?: Error;

  constructor(params: {
    category: SourceErrorCategory;
    message: string;
    sourceId?: string;
    operation?: SourceOperation;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "SourceError";
    this.category = params.category;
    this.sourceId = params.sourceId;
    this.operation = params.operation;
    if (params.cause instanceof Error) {
      this.override = params.cause;
    } else if (params.cause != null) {
      this.override = new Error(String(params.cause));
    }
  }

  get causeMessage(): string {
    return this.override?.message ?? this.message;
  }
}

// ---- classification ------------------------------------------------------

/** Best-effort stable URL barring any authority/query (for safe diagnostics). */
function summarizeUrl(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");
  return value.replace(/[?#].*$/, "");
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (/abort/i.test(err.message ?? "") ||
      /AbortError/.test(err.name ?? "") ||
      err.name === "AbortError")
  );
}

/**
 * Messages indicating a JS programming bug (missing API, undefined
 * dereference) rather than a real network failure. Checked first so a
 * missing sandbox API isn't mislabeled as "Couldn't connect to this source".
 */
const PROGRAMMING_ERROR_PATTERN =
  /is not a function|is not a constructor|cannot read propert(y|ies) of (undefined|null)|is not defined|is not an object|undefined is not an object/i;

function looksNetworky(err: unknown, causeMsg: string): boolean {
  if (PROGRAMMING_ERROR_PATTERN.test(causeMsg)) return false;
  if (
    /failed to fetch|network request failed|timeout|timed out|could not connect|socket|ECONN|ETIMEDOUT|ENOTFOUND|getaddrinfo|offline|internet connection/i.test(
      causeMsg
    )
  ) {
    return true;
  }
  // A bare TypeError with no informative message text is what RN's fetch()
  // throws for a genuine transport failure on some engines/paths; only
  // trust this as a LAST resort, after the programming-error pattern above
  // has already had a chance to rule out a missing-API bug by its message.
  return err instanceof TypeError && !causeMsg;
}

/**
 * Maps any thrown value to a SourceErrorCategory. Order matters: the most
 * specific wins.
 */
export function classifyError(
  err: unknown,
  sourceId?: string,
  operation?: SourceOperation
): SourceError {
  const base = {
    sourceId,
    operation,
    cause: err,
  };
  const causeMsg = err instanceof Error ? err.message : String(err ?? "");

  if (isAbortError(err)) {
    return new SourceError({ ...base, category: SourceErrorCategory.CANCELLED, message: "Request was cancelled." });
  }
  if (isCloudflareChallenge(err)) {
    return new SourceError({ ...base, category: SourceErrorCategory.NETWORK_ERROR, message: "This source is protected by Cloudflare and couldn't be bypassed." });
  }
  // Already-classified SourceErrors are returned as-is to avoid
  // reclassification by downstream regexes (e.g. an EXTENSION_ERROR
  // whose message mentions "timeout" would incorrectly become NETWORK_ERROR).
  if (err instanceof SourceError) {
    return sourceId && operation && (!err.sourceId || !err.operation)
      ? new SourceError({
          category: err.category,
          message: err.message,
          sourceId: err.sourceId ?? sourceId,
          operation: err.operation ?? operation,
          cause: err.override ?? err,
        })
      : err;
  }
  if (looksNetworky(err, causeMsg)) {
    return new SourceError({ ...base, category: SourceErrorCategory.NETWORK_ERROR, message: "Couldn't connect to this source." });
  }
  if (PROGRAMMING_ERROR_PATTERN.test(causeMsg)) {
    // Missing sandbox API — points at Iro's runtime, not the source.
    // Kept as a distinct message from INVALID_RESPONSE for diagnosis.
    return new SourceError({
      ...base,
      category: SourceErrorCategory.EXTENSION_ERROR,
      message: "This source used a feature Iro doesn't support yet.",
    });
  }
  if (/invalid response|unexpected|malformed|did not export|invalid section|invalid sectionId/i.test(causeMsg)) {
    return new SourceError({ ...base, category: SourceErrorCategory.INVALID_RESPONSE, message: "This source returned invalid data." });
  }
  if (/failed to parse|couldn't parse|parse error|not well-formed|unexpected end of json|syntaxerror|unexpected token/i.test(causeMsg)) {
    return new SourceError({ ...base, category: SourceErrorCategory.PARSING_ERROR, message: "This source's data couldn't be parsed." });
  }
  return new SourceError({ ...base, category: SourceErrorCategory.EXTENSION_ERROR, message: "This source encountered an error." });
}

// ---- diagnostics ---------------------------------------------------------

const DevDiagnosticsEnabled =
  (globalThis as { __IRO_DEV_DIAGNOSTICS__?: boolean }).__IRO_DEV_DIAGNOSTICS__ ?? false;

/** Toggleable via `globalThis.__IRO_DEV_DIAGNOSTICS__ = true` in dev. */
export function isDevDiagnosticsEnabled(): boolean {
  return DevDiagnosticsEnabled;
}

/** Structured, non-sensitive log line around a provider boundary event. */
export function logProvider(input: {
  sourceId?: string;
  operation?: SourceOperation;
  requestUrl?: string;
  status?: number;
  count?: number;
  error?: unknown;
}): void {
  if (!isDevDiagnosticsEnabled() && !(__DEV__ && typeof __DEV__ !== "undefined" && __DEV__)) {
    return;
  }
  const parts = [`[InkDex] provider=${input.sourceId ?? "?"}`];
  if (input.operation) parts.push(`operation=${input.operation}`);
  if (input.requestUrl) parts.push(`request=${summarizeUrl(input.requestUrl)}`);
  if (input.status !== undefined) parts.push(`status=${input.status}`);
  if (input.count !== undefined) parts.push(`result=count ${input.count}`);
  if (input.error !== undefined) {
    if (input.error instanceof SourceError) {
      parts.push(`error=${input.error.category}: ${input.error.causeMessage}`);
    } else if (input.error instanceof Error) {
      parts.push(`error=${input.error.message}`);
    } else {
      parts.push(`error=${String(input.error)}`);
    }
  }
  (console as Console).warn(parts.join(" | "));
}

/**
 * Runs a provider operation inside the diagnostic + classification boundary,
 * returning a categorized SourceError on failure. Emits a structured warning
 * when diagnostics are enabled.
 */
export async function runProvider<T>(params: {
  sourceId: string;
  operation: SourceOperation;
  fn: () => Promise<T>;
  requestUrl?: string;
}): Promise<T> {
  const { sourceId, operation, fn, requestUrl } = params;
  try {
    const result = await fn();
    const count =
      result !== null &&
      typeof result === "object" &&
      "tiles" in result &&
      Array.isArray((result as { tiles?: unknown }).tiles)
        ? ((result as { tiles: unknown[] }).tiles as unknown[]).length
        : undefined;
    logProvider({ sourceId, operation, requestUrl, count });
    return result;
  } catch (raw) {
    const clustered = classifyError(raw, sourceId, operation);
    logProvider({
      sourceId,
      operation,
      requestUrl,
      error: clustered,
    });
    throw clustered;
  }
}
