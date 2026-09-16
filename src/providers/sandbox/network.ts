import { CloudflareError } from "@/providers/InkDexProvider";
import { webViewExecBridge, type WebViewExecRequest } from "@/components/WebViewExecHost";

/**
 * PaperBack-compatible `Application` runtime.
 *
 * InkDex/Paperback extension bundles are evaluated inside a `new Function`
 * sandbox and NEVER touch `fetch`/DOM. Everything goes through the injected
 * `Application` global. This module implements the subset of the runtime
 * that real bundles use (verified against the compiled MangaDex bundle):
 *
 *   - scheduleRequest(req)         -> Promise<[response, data: ArrayBuffer]>
 *   - arrayBufferToUTF8String(buf) -> string
 *   - registerInterceptor(id, reqFn, resFn) / unregisterInterceptor(id)
 *   - Selector(instance, methodName) / SelectorRegistry.selector(fn)
 *   - sleep(seconds)
 *   - getState(key) / setState(value, key)
 *   - getSecureState(key) / setSecureState(value, key)
 *   - base64Decode(value) / decodeHTMLEntities(value)
 *   - invalidateDiscoverSections() / formDidChange(id)
 *
 * This is the ONLY place cookies/headers are attached before a URL is
 * handed to <Image> or fetch, so Cloudflare clearance & auth cookies stay
 * centralized per source.
 */

// ---- request/response shapes -----------------------------------------

export interface ScheduledRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Cookie name -> value map from extension interceptors. */
  cookies?: Record<string, string>;
  /** String, bytes (web-compatible body), or JSON-serializable object. */
  body?: string | Uint8Array | ArrayBuffer;
  /** Added by the per-source sandbox wrapper; NOT part of the bundle API. */
  sourceId?: string;
}

export interface ScheduledCookie {
  name: string;
  value: string;
  expires?: Date;
  domain?: string;
  path?: string;
  secure?: boolean;
}

export interface ScheduledResponse {
  status: number;
  headers: Record<string, string>;
  finalUrl?: string;
  ok: boolean;
  /** Cookies parsed from `set-cookie` header(s). */
  cookies: ScheduledCookie[];
}

type RequestInterceptor = (
  request: ScheduledRequest
) => ScheduledRequest | Promise<ScheduledRequest>;

type ResponseInterceptor = (
  request: ScheduledRequest,
  response: ScheduledResponse,
  data: ArrayBuffer
) => ArrayBuffer | Promise<ArrayBuffer>;

// ---- utf8 ---------------------------------------------------------------

export function arrayBufferToUTF8String(buffer: ArrayBuffer | Uint8Array): string {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if ((b0 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if ((b0 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      out += utf16FromCodePoint(
        ((b0 & 0x0f) << 12) |
          ((bytes[i + 1] & 0x3f) << 6) |
          (bytes[i + 2] & 0x3f)
      );
      i += 3;
    } else if ((b0 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      out += utf16FromCodePoint(
        ((b0 & 0x07) << 18) |
          ((bytes[i + 1] & 0x3f) << 12) |
          ((bytes[i + 2] & 0x3f) << 6) |
          (bytes[i + 3] & 0x3f)
      );
      i += 4;
    } else {
      out += "\ufffd";
      i += 1;
    }
  }
  return out;
}

function utf16FromCodePoint(codePoint: number): string {
  if (codePoint <= 0xffff) return String.fromCharCode(codePoint);
  const c = codePoint - 0x10000;
  return String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
}

// ---- HTML entities -----------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "&apos": "'",
  nbsp: "\u00a0",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  hellip: "\u2026",
  mdash: "\u2014",
  ndash: "\u2013",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "\u2022",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
  cent: "\u00a2",
  deg: "\u00b0",
  plusmn: "\u00b1",
  times: "\u00d7",
  divide: "\u00f7",
};

/** Decodes `&amp;`, `&#39;`, `&#x27;`, etc. Used heavily by HTML sources. */
export function decodeHTMLEntities(input: string): string {
  if (!input || input.indexOf("&") === -1) return input;
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);?/g, (match, body) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const num = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isNaN(num) || num < 0) return match;
      try {
        return Array.from({ length: 1 }, () => num)
          .map((n) => String.fromCodePoint(n))
          .join("");
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body];
    return named !== undefined ? named : match;
  });
}

// ---- base64 ------------------------------------------------------------

/** Decodes a base64 string into a UTF-8 string. */
export function base64Decode(value: string): string {
  const binary = atobCompat(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return arrayBufferToUTF8String(bytes);
}

/**
 * Default User-Agent for extension bundles. InkDex/Paperback extensions
 * rely on a realistic browser-ish UA string for the host, and most HTTP
 * interceptors forward it on every request.
 */
export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

/** Splits a raw `Set-Cookie` header (single or multi-line) into cookies. */
export function parseSetCookie(raw: string | undefined): ScheduledCookie[] {  if (!raw) return [];
  return raw.split(/\n|,(?=\s*\w+=)/).reduce((acc: ScheduledCookie[], segment) => {
    const part = segment.trim();
    if (!part) return acc;
    const pairs = part.split(";").map((p) => p.trim());
    const [name, ...valueParts] = pairs[0]?.split("=") ?? [];
    if (!name) return acc;
    const cookie: ScheduledCookie = {
      name,
      value: valueParts.join("="),
    };
    for (const attr of pairs.slice(1)) {
      const [k, ...rest] = attr.split("=");
      const v = rest.join("=");
      switch (k.trim().toLowerCase()) {
        case "expires": {
          const t = new Date(v).getTime();
          if (!Number.isNaN(t)) cookie.expires = new Date(t);
          break;
        }
        case "max-age": {
          const n = Number(v);
          if (Number.isFinite(n)) cookie.expires = new Date(Date.now() + n * 1000);
          break;
        }
        case "domain":
          cookie.domain = v;
          break;
        case "path":
          cookie.path = v;
          break;
        case "secure":
          cookie.secure = true;
          break;
      }
    }
    acc.push(cookie);
    return acc;
  }, []);
}

function atobCompat(value: string): string {
  if (typeof atob === "function") return atob(value);
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  const clean = value.replace(/[\s=]+$/, "");
  let result = "";
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const idx = chars.indexOf(ch);
    if (idx === -1 || idx === 64) continue;
    buffer = (buffer << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      result += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return result;
}

// ---- runtime ------------------------------------------------------------

/** Parses a `Cookie` header value into a name->value map (last wins). */
function parseHeaderCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name) out[name] = part.slice(idx + 1).trim();
  }
  return out;
}

/** Best-effort hostname extraction from a URL string (no full URL parsing). */
function extractHost(url: string): string {
  const m = url.match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i);
  if (!m) return "";
  return m[1].replace(/:\d+$/, "").toLowerCase();
}

class Runtime {
  // Keyed sourceId -> id -> interceptor. Global Search initializes and runs
  // every installed provider concurrently, so interceptors/state MUST be
  // namespaced per source — a flat map here would let one source's
  // interceptor (or state slot) silently run against another source's
  // requests whenever more than one provider is active at once, which is
  // exactly what global search does (single-source browsing never exposed
  // this because only one provider was ever initialized at a time).
  private requestInterceptors = new Map<string, Map<string, RequestInterceptor>>();
  private responseInterceptors = new Map<string, Map<string, ResponseInterceptor>>();
  /** sourceId -> Cookie header value, set by CloudflareWebViewHost. */
  private cookieJar = new Map<string, string>();

  private state = new Map<string, Map<string, unknown>>();
  private secureState = new Map<string, Map<string, unknown>>();

  // ---- interceptors ----

  registerInterceptor(
    sourceId: string,
    id: string,
    requestInterceptor: RequestInterceptor,
    responseInterceptor: ResponseInterceptor
  ) {
    const reqMap = this.requestInterceptors.get(sourceId) ?? new Map();
    reqMap.set(id, requestInterceptor);
    this.requestInterceptors.set(sourceId, reqMap);

    const resMap = this.responseInterceptors.get(sourceId) ?? new Map();
    resMap.set(id, responseInterceptor);
    this.responseInterceptors.set(sourceId, resMap);
  }

  unregisterInterceptor(sourceId: string, id: string) {
    this.requestInterceptors.get(sourceId)?.delete(id);
    this.responseInterceptors.get(sourceId)?.delete(id);
  }

  // ---- cookies ----

  setClearanceCookie(sourceId: string, cookieHeader: string) {
    this.cookieJar.set(sourceId, cookieHeader);
  }

  getClearanceCookie(sourceId: string): string | undefined {
    return this.cookieJar.get(sourceId);
  }

  // ---- state ----

  getState<T = unknown>(sourceId: string, key: string): T | undefined {
    return this.state.get(sourceId)?.get(key) as T | undefined;
  }

  setState<T = unknown>(sourceId: string, value: T, key: string) {
    const m = this.state.get(sourceId) ?? new Map();
    m.set(key, value);
    this.state.set(sourceId, m);
  }

  getSecureState<T = unknown>(sourceId: string, key: string): T | undefined {
    return this.secureState.get(sourceId)?.get(key) as T | undefined;
  }

  setSecureState<T = unknown>(sourceId: string, value: T, key: string) {
    const m = this.secureState.get(sourceId) ?? new Map();
    m.set(key, value);
    this.secureState.set(sourceId, m);
  }

  // ---- misc bundle APIs ----

  sleep(seconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /** Binds `instance.methodName` for callbacks. */
  Selector(instance: any, methodName: string) {
    const target = instance ?? {};
    return (...args: unknown[]) => target[methodName](...args);
  }

  SelectorRegistry = {
    selector: <T>(fn: T): T => fn,
  };

  invalidateDiscoverSections() {
    // Host UI refreshes discover sections from the registry; nothing to do.
  }

  formDidChange(_id: string) {
    // Settings-form change notification; nothing to do in this host yet.
  }

  /**
   * Runs `request.inject` against `request.source.html` inside a hidden
   * WebView, for computations extensions can't do in the sandbox (no DOM,
   * no canvas). Most commonly evaluating a verification token a page's
   * inline script computes into a `window.*` global.
   */
  executeInWebView(request: WebViewExecRequest): Promise<{ result: unknown }> {
    return webViewExecBridge.execute(request);
  }

  base64Decode = base64Decode;
  decodeHTMLEntities = decodeHTMLEntities;
  arrayBufferToUTF8String = arrayBufferToUTF8String;
  getDefaultUserAgent = (): string => DEFAULT_USER_AGENT;

  // ---- request pipeline ----

  /** Bundle-facing entry point. Returns [response, rawData]. */
  async scheduleRequest(
    req: ScheduledRequest
  ): Promise<[ScheduledResponse, ArrayBuffer]> {
    let finalReq: ScheduledRequest = req;

    const cookie = finalReq.sourceId
      ? this.cookieJar.get(finalReq.sourceId)
      : undefined;
    if (cookie) {
      finalReq = {
        ...finalReq,
        headers: { ...finalReq.headers, Cookie: cookie },
      };
    }

    // Only this request's own source's interceptors run against it — see
    // the note on requestInterceptors above for why this must be scoped.
    const sid = finalReq.sourceId ?? "";
    const reqInterceptors = this.requestInterceptors.get(sid);
    if (reqInterceptors) {
      for (const interceptor of reqInterceptors.values()) {
        finalReq = (await interceptor(finalReq)) ?? finalReq;
      }
    }

    const [resp, data] = await this.execute(finalReq);

    let finalData = data;
    const resInterceptors = this.responseInterceptors.get(sid);
    if (resInterceptors) {
      for (const interceptor of resInterceptors.values()) {
        finalData = await interceptor(finalReq, resp, finalData);
      }
    }

    if (resp.status === 503 && this.looksLikeCloudflare(resp, finalData)) {
      const sourceId = finalReq.sourceId ?? "unknown";
      throw new CloudflareError(sourceId, finalReq.url);
    }

    // Persist any session/auth cookies the response sets, keyed per source.
    const setCookieHeader = resp.headers["set-cookie"];
    const parsedCookies = parseSetCookie(setCookieHeader);
    if (parsedCookies.length > 0 && finalReq.sourceId) {
      const current = this.cookieJar.get(finalReq.sourceId);
      const merged = current
        ? `${current}, ${parsedCookies.map((c) => `${c.name}=${c.value}`).join(", ")}`
        : parsedCookies.map((c) => `${c.name}=${c.value}`).join(", ");
      this.cookieJar.set(finalReq.sourceId, merged);
    }

    return [{ ...resp, cookies: parsedCookies }, finalData];
  }

  /**
   * Resolve a raw image URL into a `{ uri, headers }` pair safe for
   * <Image>. Attaches Cloudflare clearance + auth cookies for the source.
   */
  async resolveImageUri(
    sourceId: string,
    rawUrl: string,
    headers?: Record<string, string>
  ): Promise<{ uri: string; headers?: Record<string, string> }> {
    const finalHeaders = { ...(headers ?? {}) };

    // CF clearance / auth cookie for this source.
    const clearance = this.cookieJar.get(sourceId);
    if (clearance) finalHeaders["Cookie"] = clearance;

    // Session cookies from the extension's CookieStorageInterceptor
    // (stored under "cookie_store_cookies" application state key, scoped to
    // this source so concurrent global search doesn't leak one source's
    // cookies into another's image requests).
    const storeCookies = this.state.get(sourceId)?.get("cookie_store_cookies") as
      | { name: string; value: string; domain?: string; path?: string; expires?: Date }[]
      | undefined;
    if (Array.isArray(storeCookies) && storeCookies.length > 0) {
      const merged = parseHeaderCookies(finalHeaders["Cookie"] ?? finalHeaders["cookie"]);
      for (const c of storeCookies) {
        if (!c.expires || c.expires.getTime() > Date.now()) {
          const domain = (c.domain ?? "").replace(/^www\./i, "").toLowerCase();
          const host = extractHost(rawUrl);
          if (!domain || !host || host === domain || host.endsWith(`.${domain}`)) {
            merged[c.name] = c.value;
          }
        }
      }
      if (Object.keys(merged).length > 0) {
        finalHeaders["Cookie"] = Object.entries(merged)
          .map(([n, v]) => `${n}=${v}`)
          .join("; ");
      }
    }

    return { uri: rawUrl, headers: finalHeaders };
  }

  // ---- internals ----

  private looksLikeCloudflare(
    resp: ScheduledResponse,
    data: ArrayBuffer
  ): boolean {
    const server = (resp.headers["server"] ?? "").toLowerCase();
    if (server.includes("cloudflare")) return true;
    if (data.byteLength === 0) return false;
    const head = arrayBufferToUTF8String(data.slice(0, Math.min(4096, data.byteLength)));
    return /just a moment|challenge-platform|cf-browser-verification/i.test(head);
  }

  private async execute(
    req: ScheduledRequest
  ): Promise<[ScheduledResponse, ArrayBuffer]> {
    const headers: Record<string, string> = { ...(req.headers ?? {}) };

    // Merge request.cookies into the Cookie header, deduped by name.
    if (req.cookies && Object.keys(req.cookies).length > 0) {
      const headerCookies = parseHeaderCookies(headers["Cookie"] ?? headers["cookie"]);
      for (const [name, value] of Object.entries(req.cookies)) {
        headerCookies[name] = value;
      }
      headers["cookie"] = Object.entries(headerCookies)
        .map(([n, v]) => `${n}=${v}`)
        .join("; ");
    }

    const resp = await fetch(req.url, {
      method: req.method ?? "GET",
      headers,
      body:
        typeof req.body === "string" ||
        req.body instanceof Uint8Array ||
        req.body instanceof ArrayBuffer
          ? (req.body as any)
          : undefined,
    });

    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((value, key) => {
      respHeaders[key.toLowerCase()] = value;
    });

    return [
      {
        status: resp.status,
        headers: respHeaders,
        finalUrl: resp.url,
        ok: resp.ok,
        cookies: parseSetCookie(respHeaders["set-cookie"]),
      },
      await resp.arrayBuffer(),
    ];
  }
}

const runtime = new Runtime();

/**
 * Public `Application` surface. Arrow wrappers over the shared `runtime`
 * so the object can be safely spread into a sandbox context without
 * losing `this`. The per-source sandbox overrides `scheduleRequest` to
 * inject its own sourceId for the cookie jar.
 */
export const Application = {
  scheduleRequest: (req: ScheduledRequest) => runtime.scheduleRequest(req),
  arrayBufferToUTF8String: (buffer: ArrayBuffer | Uint8Array) =>
    arrayBufferToUTF8String(buffer),
  decodeHTMLEntities: (input: string) => decodeHTMLEntities(input),
  base64Decode: (value: string) => base64Decode(value),
  getDefaultUserAgent: () => DEFAULT_USER_AGENT,
  // sourceId-scoped so concurrent (global search) execution across
  // multiple providers can't cross-contaminate; the per-source sandbox
  // wrapper in SandboxInkDexProvider injects the sourceId, keeping the
  // bundle-facing signature (no sourceId argument) unchanged for extensions.
  registerInterceptor: (
    sourceId: string,
    id: string,
    requestInterceptor: RequestInterceptor,
    responseInterceptor: ResponseInterceptor
  ) => runtime.registerInterceptor(sourceId, id, requestInterceptor, responseInterceptor),
  unregisterInterceptor: (sourceId: string, id: string) =>
    runtime.unregisterInterceptor(sourceId, id),
  Selector: (instance: any, methodName: string) =>
    runtime.Selector(instance, methodName),
  getState: <T = unknown>(sourceId: string, key: string) => runtime.getState<T>(sourceId, key),
  setState: <T = unknown>(sourceId: string, value: T, key: string) =>
    runtime.setState(sourceId, value, key),
  getSecureState: <T = unknown>(sourceId: string, key: string) =>
    runtime.getSecureState<T>(sourceId, key),
  setSecureState: <T = unknown>(sourceId: string, value: T, key: string) =>
    runtime.setSecureState(sourceId, value, key),
  sleep: (seconds: number) => runtime.sleep(seconds),
  invalidateDiscoverSections: () => runtime.invalidateDiscoverSections(),
  formDidChange: (id: string) => runtime.formDidChange(id),
  executeInWebView: (request: WebViewExecRequest) => runtime.executeInWebView(request),
  SelectorRegistry: runtime.SelectorRegistry,
  // Internal (used by services/WebView host, not by bundles):
  setClearanceCookie: (sourceId: string, cookieHeader: string) =>
    runtime.setClearanceCookie(sourceId, cookieHeader),
  getClearanceCookie: (sourceId: string) =>
    runtime.getClearanceCookie(sourceId),
  resolveImageUri: (
    sourceId: string,
    rawUrl: string,
    headers?: Record<string, string>
  ) => runtime.resolveImageUri(sourceId, rawUrl, headers),
} as const;

export type { RequestInterceptor, ResponseInterceptor };