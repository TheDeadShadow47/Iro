import type {
  ChapterInfo,
  MangaDetails,
  PageInfo,
  SearchFilters,
  SearchResultPage,
  SourceInfo,
} from "@/domain/models";

/**
 * InkDexProvider is the ONLY interface the Domain Services are allowed to
 * depend on. The single real implementation is SandboxInkDexProvider, which
 * evaluates a real InkDex/Paperback-style IIFE bundle downloaded from the
 * user-configured extension registry (see src/providers/sandbox +
 * src/extensions). No mock/dev provider ships in the app.
 *
 * UI SCREENS MUST NEVER IMPORT A PROVIDER DIRECTLY. Always go through
 * src/services/*.
 */
export interface InkDexProvider {
  readonly info: SourceInfo;

  /** Called once after the bundle is loaded / mock is constructed. */
  initialize(): Promise<void>;

  getPopular(page: number): Promise<SearchResultPage>;

  getLatestUpdates(page: number): Promise<SearchResultPage>;

  search(filters: SearchFilters, page: number): Promise<SearchResultPage>;

  getMangaDetails(mangaId: string): Promise<MangaDetails>;

  getChapters(mangaId: string): Promise<ChapterInfo[]>;

  /**
   * Returns raw page descriptors. Callers MUST route each `rawUrl` through
   * Application.scheduleRequest() (see src/providers/sandbox/network.ts)
   * before handing it to <Image>, since cookies/headers (and Cloudflare
   * clearance) are attached there, not here.
   */
  getPageList(chapterId: string): Promise<PageInfo[]>;
}

/**
 * Thrown by a SandboxInkDexProvider when the host site returns a Cloudflare
 * interstitial instead of real data. Caught by the network interceptor
 * pipeline, which triggers <CloudflareWebViewHost> to solve the challenge.
 */
export class CloudflareError extends Error {
  readonly type = "cloudflareError";
  constructor(
    public readonly sourceId: string,
    public readonly url: string
  ) {
    super(`Cloudflare challenge encountered for ${sourceId} at ${url}`);
    this.name = "CloudflareError";
  }
}

/**
 * Extension bundles ship their own `CloudflareError` class (from
 * @paperback/types), so `instanceof CloudflareError` can't see it. This
 * duck-types any such error and unwraps one level of `.override`/`.cause`
 * so `withCloudflareRetry` can recognize and solve challenges from both
 * the host and bundle-shipped error classes.
 */
export function findCloudflareChallenge(err: unknown): {
  sourceId?: string;
  url?: string;
  resolutionRequest?: { url: string };
} | null {
  const e = err as Record<string, unknown> | null | undefined;
  if (!e || typeof e !== "object") return null;
  if (
    e.type === "cloudflareError" ||
    e.name === "CloudflareError" ||
    (e.resolutionRequest != null && typeof e.resolutionRequest === "object")
  ) {
    return e as { sourceId?: string; url?: string; resolutionRequest?: { url: string } };
  }
  const cause = e.override ?? e.cause;
  if (cause && cause !== err && typeof cause === "object") {
    return findCloudflareChallenge(cause);
  }
  return null;
}

export function isCloudflareChallenge(err: unknown): err is {
  sourceId?: string;
  url?: string;
  resolutionRequest?: { url: string };
} {
  return findCloudflareChallenge(err) !== null;
}
