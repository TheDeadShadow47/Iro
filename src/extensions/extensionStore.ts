import { create } from "zustand";
import { Directory, File, Paths } from "expo-file-system";
import type {
  ExtensionManifest,
  InstalledExtension,
} from "@/domain/models";
import {
  bundleUrl,
  deriveRegistryBase,
  extensionIconUrl,
} from "@/extensions/registry";
import { useSettingsStore } from "@/state/settingsStore";
import { EXTENSIONS_DIR_NAME } from "@/constants/storage";

/**
 * Installed extensions are real files on disk so they survive restarts:
 *
 *   document/iro-extensions/
 *     installed.json            // InstalledExtension[] records
 *     <id>/index.js             // compiled bundle
 *     <id>/<icon basename>      // cached icon (optional)
 */

const ROOT_DIR = new Directory(Paths.document, EXTENSIONS_DIR_NAME);
const INDEX_FILE = new File(ROOT_DIR, "installed.json");

function readInstalledSync(): InstalledExtension[] {
  if (INDEX_FILE.exists) {
    try {
      const parsed = JSON.parse(INDEX_FILE.textSync());
      if (Array.isArray(parsed)) return parsed as InstalledExtension[];
    } catch {
      // corrupted index — treat as empty
    }
  }
  return [];
}

function writeInstalledSync(installed: InstalledExtension[]) {
  if (!ROOT_DIR.exists) {
    ROOT_DIR.create({ intermediates: true, idempotent: true });
  }
  INDEX_FILE.write(JSON.stringify(installed, null, 2), { encoding: "utf8" });
}

function extDir(id: string): Directory {
  return new Directory(ROOT_DIR, id);
}

export class ExtensionInstallError extends Error {
  constructor(message: string, public readonly extensionId: string) {
    super(message);
    this.name = "ExtensionInstallError";
  }
}

interface ExtensionsState {
  /** Persisted InstalledExtension records, ordered by installedAt desc. */
  installed: InstalledExtension[];
  /** id -> pending operation label while async work is underway. */
  pending: Record<string, string | undefined>;
  error: string | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  install: (manifest: ExtensionManifest) => Promise<InstalledExtension>;
  uninstall: (id: string) => Promise<void>;
  clearError: () => void;
  loadBundleSource: (extension: InstalledExtension) => Promise<string>;
}

function toInstalledRecord(
  manifest: ExtensionManifest,
  bundleFile: string,
  iconFile: string | null
): InstalledExtension {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    version: manifest.version,
    language: manifest.language,
    contentRating: manifest.contentRating,
    capabilities: manifest.capabilities,
    iconFile,
    bundleFile,
    installedAt: new Date().toISOString(),
  };
}

export const useExtensionsStore = create<ExtensionsState>((set, get) => ({
  installed: [],
  pending: {},
  error: null,
  hydrated: false,

  hydrate: async () => {
    set({ installed: readInstalledSync(), hydrated: true });
  },

  install: async (manifest) => {
    const id = manifest.id;
    if (get().pending[id]) {
      throw new ExtensionInstallError(`Already ${get().pending[id]}`, id);
    }
    set((s) => ({
      pending: { ...s.pending, [id]: "installing" },
      error: null,
    }));

    try {
      const registryUrl = useSettingsStore.getState().registryUrl;
      if (!registryUrl) {
        throw new Error("No extension repository configured. Add a repository first.");
      }
      const base = deriveRegistryBase(registryUrl);
      const dir = extDir(id);
      if (!dir.exists) {
        dir.create({ intermediates: true, idempotent: true });
      }

      const bundleFile = new File(dir, "index.js");
      const bundleDownloaded = await File.downloadFileAsync(
        bundleUrl(base, id),
        bundleFile,
        { idempotent: true }
      );

      let iconFile: string | null = null;
      if (manifest.icon) {
        const iconName = manifest.icon.split("/").pop() ?? "icon.png";
        const iconTarget = new File(dir, iconName);
        try {
          await File.downloadFileAsync(
            extensionIconUrl(base, id, manifest.icon),
            iconTarget,
            { idempotent: true }
          );
          iconFile = iconTarget.uri;
        } catch {
          iconFile = null; // icon is cosmetic; continue without it
        }
      }

      const record = toInstalledRecord(
        manifest,
        bundleDownloaded.uri,
        iconFile
      );

      const installed = readInstalledSync();
      const next = [
        record,
        ...installed.filter((e) => e.id !== record.id),
      ];
      writeInstalledSync(next);
      set((s) => ({
        installed: next,
        pending: { ...s.pending, [id]: undefined },
      }));

      return record;
    } catch (err: any) {
      set((s) => ({
        pending: { ...s.pending, [id]: undefined },
        error: (err as Error)?.message ?? "Failed to install extension",
      }));
      throw new ExtensionInstallError(
        (err as Error)?.message ?? "Failed to install extension",
        id
      );
    }
  },

  uninstall: async (id) => {
    if (get().pending[id]) {
      throw new ExtensionInstallError(`Already ${get().pending[id]}`, id);
    }
    set((s) => ({
      pending: { ...s.pending, [id]: "uninstalling" },
      error: null,
    }));
    try {
      const dir = extDir(id);
      if (dir.exists) {
        dir.delete();
      }
      const next = readInstalledSync().filter((e) => e.id !== id);
      writeInstalledSync(next);
      set((s) => ({
        installed: next,
        pending: { ...s.pending, [id]: undefined },
      }));
    } catch (err: any) {
      set((s) => ({
        pending: { ...s.pending, [id]: undefined },
        error: (err as Error)?.message ?? "Failed to uninstall extension",
      }));
      throw new ExtensionInstallError(
        (err as Error)?.message ?? "Failed to uninstall extension",
        id
      );
    }
  },

  clearError: () => set({ error: null }),

  loadBundleSource: async (extension) => {
    const file = new File(extension.bundleFile);
    if (!file.exists) {
      throw new Error(
        `Bundle file missing for ${extension.id}; reinstall the extension`
      );
    }
    return file.text();
  },
}));