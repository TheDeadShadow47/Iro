/**
 * URL / URLSearchParams globals injected into the InkDex extension sandbox.
 *
 * Real 0.9 InkDex/Paperback bundles construct `new URL(this.domain)` and call
 * `url.addPathComponent(...)` / `setQueryItem(...)` — but those are the
 * bundled @paperback/types `URL` class provided by the bundle itself. The
 * bundle ALSO needs the WHATWG `URL` global (e.g. cheerio's baseURI
 * resolution does `new URL(href, base).href`). React Native's Hermes runtime
 * exposes a WHATWG `URL` global, but to be deterministic across runtimes we
 * inject it explicitly into every sandbox.
 *
 * We forward to the host `URL` global when present (RN provides one) and fall
 * back to a minimal WHATWG-compatible implementation otherwise.
 */

type UrlLike = new (input: string, base?: string | UrlLike) => {
  href: string;
  protocol: string;
  hostname: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
  searchParams: URLSearchParams;
  toString(): string;
};

declare const globalThis: {
  URL?: UrlLike;
  URLSearchParams?: typeof URLSearchParams;
};

function hostURL(): UrlLike | undefined {
  try {
    // eslint-disable-next-line no-restricted-globals
    const u = (globalThis as any).URL;
    if (typeof u === "function") return u as UrlLike;
  } catch {
    /* no host URL */
  }
  return undefined;
}

function hostURLSearchParams(): typeof URLSearchParams | undefined {
  try {
    // eslint-disable-next-line no-restricted-globals
    const u = (globalThis as any).URLSearchParams;
    if (typeof u === "function") return u as typeof URLSearchParams;
  } catch {
    /* no host URLSearchParams */
  }
  return undefined;
}

// ---- minimal WHATWG-URL fallback (only used when host global is missing) ----

class FallbackURLSearchParams {
  private map = new Map<string, string[]>();

  constructor(init?: string | Record<string, string> | [string, string][]) {
    if (typeof init === "string") {
      const q = init.replace(/^\?/, "");
      for (const pair of q.split("&")) {
        if (!pair) continue;
        const [k, ...rest] = pair.split("=");
        const key = decodeURIComponent(k);
        const value = rest.length ? decodeURIComponent(rest.join("=")) : "";
        const arr = this.map.get(key) ?? [];
        arr.push(value);
        this.map.set(key, arr);
      }
    } else if (init) {
      for (const [k, v] of Object.entries(init)) {
        if (Array.isArray(v)) {
          this.map.set(k, v);
        } else if (typeof v === "string") {
          this.map.set(k, [v]);
        }
      }
    }
  }

  get(key: string): string | null {
    const arr = this.map.get(key);
    return arr && arr.length ? arr[0] : null;
  }

  getAll(key: string): string[] {
    return this.map.get(key) ?? [];
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  append(key: string, value: string): void {
    const arr = this.map.get(key) ?? [];
    arr.push(value);
    this.map.set(key, arr);
  }

  set(key: string, value: string): void {
    this.map.set(key, [value]);
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  toString(): string {
    const parts: string[] = [];
    for (const [k, arr] of this.map) {
      for (const v of arr) {
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
      }
    }
    return parts.join("&");
  }
}

class FallbackURL {
  href: string;
  protocol = "";
  hostname = "";
  host = "";
  pathname = "";
  search = "";
  hash = "";
  searchParams: URLSearchParams;

  constructor(input: string, base?: string | FallbackURL) {
    let baseStr = "";
    if (base) {
      baseStr = base instanceof FallbackURL ? base.href : String(base);
    }
    let url = String(input).trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && baseStr) {
      if (/^\/\//.test(url)) {
        const scheme = baseStr.match(/^([a-z][a-z0-9+.-]*:)/i)?.[1] ?? "https:";
        url = `${scheme}${url}`;
      } else if (url.startsWith("/")) {
        const baseOrigin = baseStr.match(/^[a-z][a-z0-9+.-]*:\/\/[^/?#]*/i)?.[0] ?? baseStr;
        url = `${baseOrigin}${url}`;
      } else {
        const basePath = baseStr.replace(/[?#].*$/, "").replace(/[^/]*$/, "");
        url = basePath + url;
      }
    }
    this.href = url;
    const m = url.match(/^([a-z][a-z0-9+.-]*:)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i);
    if (m) {
      if (m[1]) this.protocol = m[1];
      const host = m[2] ?? "";
      this.host = host;
      this.hostname = host.replace(/:\d+$/, "");
      this.pathname = m[3] ?? (this.host ? "/" : "");
      this.search = m[4] ? `?${m[4]}` : "";
      this.hash = m[5] ? `#${m[5]}` : "";
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      this.searchParams = new sandboxURLSearchParams(m[4] ?? "") as URLSearchParams;
    } else {
      this.searchParams = new FallbackURLSearchParams() as unknown as URLSearchParams;
    }
  }

  toString(): string {
    return this.href;
  }
}

const resolvedURL: UrlLike | undefined = hostURL();
const resolvedURLSearchParams: typeof URLSearchParams | undefined = hostURLSearchParams();

/**
 * WHATWG `URL` for the sandbox. Uses the host global when available
 * (React Native ships one), else the bundled fallback above.
 */
export const sandboxURL: UrlLike = resolvedURL ?? (FallbackURL as unknown as UrlLike);

export const sandboxURLSearchParams: typeof URLSearchParams =
  resolvedURLSearchParams ??
  (FallbackURLSearchParams as unknown as typeof URLSearchParams);
