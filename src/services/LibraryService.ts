import type { Category, LibraryEntry, MangaDetails } from "@/domain/models";
import { categoryRepository } from "@/db/repositories/categoryRepository";
import { libraryRepository } from "@/db/repositories/libraryRepository";
import { mangaCacheRepository } from "@/db/repositories/mangaCacheRepository";
import { providerRegistry } from "@/services/providerRegistry";
import { withCloudflareRetry } from "@/services/SearchService";
import { runProvider } from "@/utils/sourceErrors";

export const LibraryService = {
  async getLibrary(): Promise<LibraryEntry[]> {
    return libraryRepository.getAll();
  },

  async getCategories(): Promise<Category[]> {
    return categoryRepository.getAll();
  },

  async createCategory(name: string): Promise<number> {
    return categoryRepository.create(name);
  },

  /**
   * Remote fetch of full manga details + chapters. Used by explicit Refresh.
   * Updates the local snapshot cache when the title is in (or being added to)
   * the library.
   */
  async getMangaDetails(sourceId: string, mangaId: string): Promise<MangaDetails> {
    return withCloudflareRetry(sourceId, () =>
      runProvider({
        sourceId,
        operation: "getMangaDetails",
        fn: async () => {
          const provider = await providerRegistry.get(sourceId);
          const details = await provider.getMangaDetails(mangaId);
          await mangaCacheRepository.put(details);
          await libraryRepository.touchFetchedAt(sourceId, mangaId);
          return details;
        },
      })
    );
  },

  /**
   * Read the locally cached snapshot (fast, offline-safe). Returns null when
   * nothing is cached yet.
   */
  async getMangaDetailsCached(
    sourceId: string,
    mangaId: string
  ): Promise<MangaDetails | null> {
    return mangaCacheRepository.get(sourceId, mangaId);
  },

  async cacheManga(details: MangaDetails): Promise<void> {
    await mangaCacheRepository.put(details);
  },

  async isInLibrary(sourceId: string, mangaId: string): Promise<boolean> {
    return libraryRepository.isInLibrary(sourceId, mangaId);
  },

  async addToLibrary(details: MangaDetails): Promise<void> {
    await libraryRepository.add(details);
    await mangaCacheRepository.put(details);
  },

  async removeFromLibrary(sourceId: string, mangaId: string): Promise<void> {
    await libraryRepository.remove(sourceId, mangaId);
    await mangaCacheRepository.remove(sourceId, mangaId);
  },

  async removeManyFromLibrary(keys: { sourceId: string; mangaId: string }[]): Promise<void> {
    await libraryRepository.removeMany(keys);
    await mangaCacheRepository.pruneOrphans();
  },

  async setCategory(
    sourceId: string,
    mangaId: string,
    categoryId: number | null
  ): Promise<void> {
    return libraryRepository.setCategory(sourceId, mangaId, categoryId);
  },
};

