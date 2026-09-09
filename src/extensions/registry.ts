import type { RegistryIndex } from "@/domain/models";

/**
 * Iro starts empty: there is NO default extension registry. The user must
 * explicitly configure their own InkDex registry URL. The download-base
 * helpers below only ever operate on a URL the user has already supplied.
 */

/**
 * Given a registry `versioning.json` URL, returns the base URL that bundles
 * and static assets live under. The aggregator publishes `{id}/index.js` and
 * `{id}/static/{icon}` next to `versioning.json`.
 */
export function deriveRegistryBase(registryUrl: string): string {
  let url = registryUrl.trim().replace(/\/+$/, "");
  if (url.endsWith("/versioning.json")) {
    url = url.slice(0, -"/versioning.json".length);
  }
  return url;
}

export function bundleUrl(registryBase: string, id: string): string {
  return `${registryBase}/${encodeURIComponent(id)}/index.js`;
}

export function extensionIconUrl(
  registryBase: string,
  id: string,
  iconFile: string
): string {
  const icon = iconFile.split("/").pop() ?? iconFile; // manifest field may be "static/icon.png"
  return `${registryBase}/${encodeURIComponent(id)}/static/${icon}`;
}

/** Fetches and parses a registry's versioning.json. */
export async function fetchRegistryIndex(
  registryUrl: string,
  headers?: Record<string, string>
): Promise<RegistryIndex> {
  const res = await fetch(registryUrl, { headers });
  if (!res.ok) {
    throw new Error(`Registry responded with HTTP ${res.status}`);
  }
  const json = (await res.json()) as RegistryIndex;
  if (!Array.isArray(json?.sources)) {
    throw new Error("Registry JSON did not contain a sources[] list");
  }
  return json;
}