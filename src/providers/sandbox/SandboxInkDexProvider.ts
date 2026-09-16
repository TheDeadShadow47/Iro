import type {
  ChapterInfo,
  ContentRating,
  MangaDetails,
  MangaStatus,
  MangaTile,
  PageInfo,
  SearchFilters,
  SearchResultPage,
  SourceInfo,
} from "@/domain/models";
import { Application } from "@/providers/sandbox/network";
import { sandboxAtob, sandboxBtoa, sandboxCryptoGlobals, sandboxMd5 } from "@/providers/sandbox/crypto";
import { sandboxURL, sandboxURLSearchParams } from "@/providers/sandbox/url";
import { toSafeIso } from "@/utils/dateTime";
import {
  cleanDescription,
  cleanFiniteNumber,
  cleanGenreTag,
  cleanOptionalText,
  cleanText,
  cleanToken,
  cleanUrl,
} from "@/utils/sanitize";
import { SourceError, SourceErrorCategory } from "@/utils/sourceErrors";

const DEFAULT_PAGE_SIZE = 24;

/**
 * Evaluates a real InkDex/Paperback-style IIFE bundle inside a locked-down
 * `new Function` context, then adapts the exported `Source` object to the
 * InkDexProvider interface used by every Service/UI in the app.
 *
 * Contracts (verified against the compiled MangaDex bundle):
 *  - The bundle assigns `var source = (function(exports){ ... })({})` and
 *    mutates that exports object, so evaluating it and returning `source`
 *    yields `{ <registryId>: instance, <registryId>Extension: class }`.
 *  - The instance exposes `initialize()`, `getDiscoverSections()`,
 *    `getDiscoverSectionItems(section, metadata)`,
 *    `getSearchResults(query, metadata, sortingOption)`,
 *    `getSortingOptions()`, `getMangaDetails(mangaId)`,
 *    `getChapters(sourceManga)`, `getChapterDetails(chapter)`.
 *  - All network goes through the injected `Application` runtime
 *    (src/providers/sandbox/network.ts).
 */
export class SandboxInkDexProvider {
  readonly info: SourceInfo;

  private sourceModule: any = null;
  private sections: any[] | null = null;
  private sortingOptions: any[] | null = null;
  private sourceMangaCache = new Map<string, any>();
  private chapterCache = new Map<string, any>();
  private pagingMetadata = new Map<string, any>();

  constructor(info: SourceInfo, private bundleSource: string) {
    this.info = info;
  }

  async initialize(): Promise<void> {
    // Every call that touches shared runtime state (interceptors, state,
    // secure state) is rebound here to carry this source's id, so that
    // when Global Search initializes and runs many providers concurrently,
    // one extension's interceptors/state can never bleed into another's
    // requests. Bundles keep calling these with their original (Paperback
    // -style) signatures — the sourceId is invisible to extension code.
    const sandboxApplication = {
      ...Application,
      scheduleRequest: (req: any) =>
        Application.scheduleRequest({ ...req, sourceId: this.info.id }),
      registerInterceptor: (
        id: string,
        requestInterceptor: any,
        responseInterceptor: any
      ) => Application.registerInterceptor(this.info.id, id, requestInterceptor, responseInterceptor),
      unregisterInterceptor: (id: string) =>
        Application.unregisterInterceptor(this.info.id, id),
      getState: (key: string) => Application.getState(this.info.id, key),
      setState: (value: unknown, key: string) =>
        Application.setState(this.info.id, value, key),
      getSecureState: (key: string) => Application.getSecureState(this.info.id, key),
      setSecureState: (value: unknown, key: string) =>
        Application.setSecureState(this.info.id, value, key),
    };

    const sandboxGlobals = {
      Application: sandboxApplication,
      atob: sandboxAtob,
      btoa: sandboxBtoa,
      md5: sandboxMd5,
      crypto: sandboxCryptoGlobals,
      URL: sandboxURL,
      URLSearchParams: sandboxURLSearchParams,
      console,
    };

    // Fix for "every source fails to parse" regression: passing each
    // sandbox global as a separate `new Function` parameter produced
    // engine-specific wrapper bugs (Hermes inserts different separators
    // between parameter strings and the body than V8/JSC). Collapsing
    // to a single `__sandbox__` parameter and destructuring inside a
    // body we fully control eliminates this class of bugs entirely.
    const preamble = [
      '"use strict";',
      `var ${Object.keys(sandboxGlobals).join(", ")};`,
      `({ ${Object.keys(sandboxGlobals).join(", ")} } = __sandbox__);`,
      ";",
    ].join("\n");
    const epilogue =
      '\n;\nreturn typeof source !== "undefined" ? source : undefined;';

    const factory = new Function(
      "__sandbox__",
      `${preamble}\n${this.bundleSource}${epilogue}`
    );

    let exportsObj: Record<string, unknown>;
    try {
      exportsObj = (factory(sandboxGlobals) ?? {}) as Record<string, unknown>;
    } catch (err) {
      const cause = err as Error;
      throw new SourceError({
        category: SourceErrorCategory.EXTENSION_ERROR,
        sourceId: this.info.id,
        operation: "initialize",
        message: `Source "${this.info.name}" failed to load: ${cause?.message ?? String(err)}`,
        cause: err,
      });
    }
    const instance = exportsObj[this.info.id];
    const extensionClass = exportsObj[`${this.info.id}Extension`];

    this.sourceModule =
      (typeof instance === "object" && instance !== null && instance
        ? instance
        : undefined) ??
      (typeof extensionClass === "function" ? new (extensionClass as any)() : undefined);

    if (!this.sourceModule) {
      const keys = Object.keys(exportsObj).join(", ");
      throw new Error(
        `Bundle did not export a source for "${this.info.id}" (found: ${keys || "none"})`
      );
    }

    if (typeof this.sourceModule.initialize === "function") {
      await this.sourceModule.initialize();
    }
  }

  // ---- Browse: popular / latest ----

  async getPopular(page: number): Promise<SearchResultPage> {
    const section = await this.resolveSection("popular");
    if (!section) return { tiles: [], hasNextPage: false, page };
    return this.fetchPage(
      `section:${section.id}`,
      page,
      (metadata) => this.sourceModule.getDiscoverSectionItems(section, metadata)
    );
  }

  async getLatestUpdates(page: number): Promise<SearchResultPage> {
    const section = await this.resolveSection("latest");
    if (!section) return { tiles: [], hasNextPage: false, page };
    return this.fetchPage(
      `section:${section.id}`,
      page,
      (metadata) => this.sourceModule.getDiscoverSectionItems(section, metadata)
    );
  }

  // ---- Search ----

  async search(filters: SearchFilters, page: number): Promise<SearchResultPage> {
    // Mirrors resolveSection()'s "no matching section -> empty page" pattern
    // above: a source that never implemented getSearchResults isn't a search
    // failure, it's a source with nothing to contribute. Global Search relies
    // on this — an unsupported source should silently drop out of the
    // aggregate instead of surfacing as a per-source error.
    if (!this.sourceModule || typeof this.sourceModule.getSearchResults !== "function") {
      return { tiles: [], hasNextPage: false, page };
    }
    const query = { title: filters.query ?? "", metadata: {} };
    const sortingOption = (await this.getSortingOptions())[0];
    const cacheKey = `search:${filters.query ?? ""}`;
    return this.fetchPage(cacheKey, page, (metadata) =>
      this.sourceModule.getSearchResults(query, metadata, sortingOption)
    );
  }

  // ---- Details / chapters / pages ----

  async getMangaDetails(mangaId: string): Promise<MangaDetails> {
    const sm = await this.sourceModule.getMangaDetails(mangaId);
    this.sourceMangaCache.set(mangaId, sm);
    const details = this.toDetails(sm, mangaId);
    details.chapters = await this.getChapters(mangaId);
    return details;
  }

  async getChapters(mangaId: string): Promise<ChapterInfo[]> {
    let sm = this.sourceMangaCache.get(mangaId);
    if (!sm) {
      sm = await this.sourceModule.getMangaDetails(mangaId);
      this.sourceMangaCache.set(mangaId, sm);
    }
    const chapters = await this.sourceModule.getChapters(sm);
    if (chapters !== undefined && chapters !== null && !Array.isArray(chapters)) {
      throw new SourceError({
        category: SourceErrorCategory.INVALID_RESPONSE,
        sourceId: this.info.id,
        operation: "getChapters",
        message: `Source "${this.info.name}" returned an invalid chapter list.`,
      });
    }
    const list = (Array.isArray(chapters) ? chapters : []) as any[];
    const mapped = list.map((chapter) => {
      const chapterId = chapter?.chapterId ?? chapter?.id;
      if (chapterId != null) {
        this.chapterCache.set(chapterId, chapter);
      }
      return this.toChapter(chapter, mangaId);
    });
    return mapped;
  }

  async getPageList(chapterId: string): Promise<PageInfo[]> {
    const chapter = this.chapterCache.get(chapterId);
    if (!chapter) {
      throw new Error(
        `Chapter "${chapterId}" was not loaded; request chapters for the manga before reading`
      );
    }
    const details = await this.sourceModule.getChapterDetails(chapter);
    if (
      details !== undefined &&
      details !== null &&
      !Array.isArray(details?.pages)
    ) {
      throw new SourceError({
        category: SourceErrorCategory.INVALID_RESPONSE,
        sourceId: this.info.id,
        operation: "getPageList",
        message: `Source "${this.info.name}" returned an invalid page list for this chapter.`,
      });
    }
    const pages = (Array.isArray(details?.pages) ? (details.pages as string[]) : []).filter(
      (url): url is string => typeof url === "string" && url.length > 0
    );
    return pages.map((url, index) => ({ index, rawUrl: url }));
  }

  // ---- Internals ----

  private async resolveSection(kind: "popular" | "latest"): Promise<any | null> {
    let sections: any[] = this.sections ?? [];
    if (!this.sections) {
      sections =
        typeof this.sourceModule.getDiscoverSections === "function"
          ? ((await this.sourceModule.getDiscoverSections()) ?? [])
          : [];
      this.sections = sections;
    }
    if (sections.length === 0) return null;

    const titleMatch = (section: any, pattern: RegExp) =>
      pattern.test(String(section?.id ?? "")) ||
      pattern.test(String(section?.title ?? ""));

    if (kind === "popular") {
      return (
        sections.find((s) => titleMatch(s, /popular|trending/i)) ??
        sections[0]
      );
    }
    return (
      sections.find((s) => titleMatch(s, /latest|update|recent/i)) ??
      sections[Math.min(1, sections.length - 1)] ??
      sections[0]
    );
  }

  private async getSortingOptions(): Promise<any[]> {
    let options: any[] = this.sortingOptions ?? [];
    if (!this.sortingOptions) {
      options =
        typeof this.sourceModule.getSortingOptions === "function"
          ? ((await this.sourceModule.getSortingOptions()) ?? [])
          : [];
      this.sortingOptions = options;
    }
    return options;
  }

  private async fetchPage(
    cacheKey: string,
    page: number,
    loader: (metadata: any) => Promise<any>
  ): Promise<SearchResultPage> {
    const metadata = page <= 1 ? undefined : this.pagingMetadata.get(cacheKey);
    const result = (await loader(metadata)) ?? undefined;

    // A defined-but-not-an-object response (or one whose `items` is present
    // but not an array) is a malformed extension response, NOT an empty
    // result. Surface it rather than silently showing "Nothing here yet".
    if (result === undefined || result === null) {
      // Extension returned nothing at all — treat as invalid, not empty,
      // because a healthy page always returns { items: [], metadata }.
      throw new SourceError({
        category: SourceErrorCategory.INVALID_RESPONSE,
        sourceId: this.info.id,
        operation: "getPopular",
        message: `Source "${this.info.name}" returned no page data.`,
        cause: new Error("fetchPage loader returned neither an object nor an array"),
      });
    }

    let items: any[];
    if (Array.isArray(result)) {
      items = result as any[];
    } else if (result && typeof result === "object" && "items" in result) {
      if (!Array.isArray(result.items)) {
        throw new SourceError({
          category: SourceErrorCategory.INVALID_RESPONSE,
          sourceId: this.info.id,
          operation: "getPopular",
          message: `Source "${this.info.name}" returned an invalid items list.`,
        });
      }
      items = result.items as any[];
    } else {
      throw new SourceError({
        category: SourceErrorCategory.INVALID_RESPONSE,
        sourceId: this.info.id,
        operation: "getPopular",
        message: `Source "${this.info.name}" returned an unexpected page shape.`,
      });
    }

    const hasNextPage =
      result && typeof result === "object"
        ? result.metadata !== undefined && result.metadata !== null
        : false;

    if (hasNextPage) {
      this.pagingMetadata.set(cacheKey, (result as { metadata: any }).metadata);
    } else {
      this.pagingMetadata.delete(cacheKey);
    }

    return {
      tiles: items.map((it) => this.toTile(it)),
      hasNextPage,
      page,
    };
  }

  private toTile(it: any): MangaTile {
    return {
      sourceId: this.info.id,
      mangaId: String(it?.mangaId),
      title: cleanText(it?.title) || "Untitled",
      coverUrl: cleanUrl(it?.imageUrl),
      subtitle: it?.subtitle ? cleanText(it.subtitle) : undefined,
    };
  }

  private toDetails(sm: any, mangaId: string): MangaDetails {
    const mi = sm?.mangaInfo ?? {};
    // Flatten all tag groups generically — cleanGenreTag filters out
    // non-genre notes/link groups that some sources include.
    const genres = Object.values(mi.tagGroups ?? {})
      .flatMap((group: any) =>
        Array.isArray(group?.tags) ? group.tags.map((tag: any) => cleanGenreTag(tag.title)) : []
      )
      .filter((g): g is string => Boolean(g));
    return {
      sourceId: this.info.id,
      mangaId: String(sm?.mangaId ?? mangaId),
      title: cleanText(mi.primaryTitle) || "Untitled",
      coverUrl: cleanUrl(mi.thumbnailUrl),
      altTitles: Array.isArray(mi.secondaryTitles)
        ? (mi.secondaryTitles as string[]).map((t) => cleanText(t))
        : [],
      author: cleanOptionalText(mi.author),
      artist: cleanOptionalText(mi.artist),
      description: cleanDescription(mi.synopsis),
      genres,
      status: toMangaStatus(mi.status),
      rating: toContentRating(mi.contentRating),
      chapters: [],
    };
  }

  private toChapter(chapter: any, mangaId: string): ChapterInfo {
    const number = parseChapterNumber(chapter);
    const rawTitle = cleanText(chapter?.title ?? chapter?.name);
    return {
      sourceId: this.info.id,
      mangaId,
      chapterId: String(chapter?.chapterId ?? chapter?.id ?? `${mangaId}:${number}`),
      chapterNumber: number,
      volume: cleanFiniteNumber(chapter?.volume),
      title: rawTitle || (number > 0 ? `Chapter ${number}` : "Chapter"),
      publishedAt: toSafeIso(chapter?.publishDate ?? chapter?.time),
      scanlator: cleanToken(chapter?.group ?? chapter?.version),
      language: cleanToken(chapter?.langCode) ?? this.info.language,
    };
  }
}

function parseChapterNumber(chapter: any): number {
  const raw = chapter?.chapNum ?? chapter?.chapterNumber ?? chapter?.count;
  const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function toMangaStatus(status?: string): MangaStatus {
  switch ((status ?? "").toLowerCase()) {
    case "ongoing":
    case "releasing":
    case "publishing":
      return "ongoing";
    case "completed":
      return "completed";
    case "hiatus":
    case "on_hiatus":
      return "hiatus";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "unknown";
  }
}

function toContentRating(rating?: string): ContentRating {
  switch ((rating ?? "").toUpperCase()) {
    case "SAFE":
      return "safe";
    case "MATURE":
      return "suggestive";
    case "ADULT":
      return "nsfw";
    default:
      return "unknown";
  }
}

export { DEFAULT_PAGE_SIZE };