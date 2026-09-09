import type { InkDexProvider } from "@/providers/InkDexProvider";
import { SandboxInkDexProvider } from "@/providers/sandbox/SandboxInkDexProvider";
import { useExtensionsStore } from "@/extensions/extensionStore";
import { useSettingsStore } from "@/state/settingsStore";
import { SourceIntent } from "@/domain/models";
import type { ContentRating, InstalledExtension, SourceInfo } from "@/domain/models";

/**
 * Central registry mapping sourceId -> InkDexProvider instance.
 *
 * Providers are rebuilt from the persisted extension store: whenever the
 * installed-extension list changes (hydrate at boot, install/uninstall
 * from the Sources screen) the registry syncs its provider map and notifies
 * subscribers. UI and Services never import a provider directly — they ask
 * SearchService / ReaderService / etc., which call through here.
 */
class ProviderRegistry {
  private providers = new Map<string, InkDexProvider>();
  private initialized = new Set<string>();
  /** id -> `installedAt` stamp of the extension a cached provider was
   *  built from, so reinstalls/updates are detected and rebuilt. */
  private providerStamp = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor() {
    useExtensionsStore.subscribe((state) => {
      void this.rebuild(state.installed);
    });
  }

  /** Notification hook for screens that cache `listSources()`. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Reconciles the provider map with the installed-extension list.
   * Providers are kept unless the extension was reinstalled/updated since
   * they were built (detected via `installedAt`), in which case the stale
   * provider is dropped and rebuilt. New bundles' `initialize()` runs only
   * on first use via `get()`.
   */
  async rebuild(installed: InstalledExtension[]): Promise<void> {
    const stillInstalled = new Set(installed.map((e) => e.id));

    for (const id of Array.from(this.providers.keys())) {
      if (!stillInstalled.has(id)) {
        this.providers.delete(id);
        this.initialized.delete(id);
        this.providerStamp.delete(id);
      }
    }

    for (const extension of installed) {
      const cachedStamp = this.providerStamp.get(extension.id);
      if (this.providers.has(extension.id) && cachedStamp === extension.installedAt) {
        continue;
      }
      try {
        const bundleSource = await useExtensionsStore
          .getState()
          .loadBundleSource(extension);
        this.providers.set(
          extension.id,
          new SandboxInkDexProvider(toSourceInfo(extension), bundleSource)
        );
        this.providerStamp.set(extension.id, extension.installedAt);
        // A rebuilt provider must be re-initialized against the new bundle,
        // not skipped as "already initialized" from the old one.
        this.initialized.delete(extension.id);
      } catch (err) {
        console.warn(`[providerRegistry] Failed to load ${extension.id}:`, err);
      }
    }

    this.notify();
  }

  listSources(): SourceInfo[] {
    return Array.from(this.providers.values()).map((provider) => provider.info);
  }

  /** First installed source, or undefined when nothing is installed. */
  get defaultSourceId(): string | undefined {
    return this.listSources()[0]?.id;
  }

  async get(sourceId: string): Promise<InkDexProvider> {
    const provider = this.providers.get(sourceId);
    if (!provider) {
      throw new Error(
        `Extension "${sourceId}" is not installed. Add it in Sources first.`
      );
    }
    if (!this.initialized.has(sourceId)) {
      await provider.initialize();
      this.initialized.add(sourceId);
    }
    return provider;
  }
}

function toSourceInfo(extension: InstalledExtension): SourceInfo {
  return {
    id: extension.id,
    name: extension.name,
    version: extension.version,
    iconUrl: extension.iconFile ?? undefined,
    language: extension.language,
    nsfw: toContentRating(extension.contentRating),
    usesCloudflare: extension.capabilities.includes(
      SourceIntent.CLOUDFLARE_BYPASS
    ),
    baseUrl: "",
  };
}

function toContentRating(rating: InstalledExtension["contentRating"]): ContentRating {
  switch (rating) {
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

/**
 * Boot sequence: hydrate persisted settings and the installed-extension
 * index, then reconcile the provider map. Called once at app start.
 */
export async function bootstrap(): Promise<void> {
  await useSettingsStore.getState().hydrate();
  await useExtensionsStore.getState().hydrate();
  await providerRegistry.rebuild(useExtensionsStore.getState().installed);
}

export const providerRegistry = new ProviderRegistry();