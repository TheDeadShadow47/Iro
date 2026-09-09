import { create } from "zustand";
import { updatesRepository } from "@/db/repositories/updatesRepository";
import { progressRepository } from "@/db/repositories/progressRepository";
import { libraryUpdateEngine } from "@/services/LibraryUpdateService";
import type {
  LibraryUpdateProgress,
  LibraryUpdateSummary,
  UpdateEntry,
} from "@/domain/models";

interface UpdatesState {
  entries: UpdateEntry[];
  unreadCount: number;
  loading: boolean;
  progress: LibraryUpdateProgress;
  summary: LibraryUpdateSummary | null;

  /** Reloads the feed from chapter_cache; cheap, safe to call on focus. */
  refresh: () => Promise<void>;
  /** Runs a full library check (network), then reloads the feed. */
  runUpdate: () => Promise<void>;
  markRead: (entry: UpdateEntry) => Promise<void>;
  markAllRead: () => Promise<void>;
}

let unsubscribeEngine: (() => void) | null = null;

export const useUpdatesStore = create<UpdatesState>((set, get) => {
  if (!unsubscribeEngine) {
    unsubscribeEngine = libraryUpdateEngine.subscribe(({ progress, summary }) => {
      set({ progress, ...(summary ? { summary } : {}) });
      if (summary) {
        void get().refresh();
      }
    });
  }

  return {
    entries: [],
    unreadCount: 0,
    loading: false,
    progress: { running: false, current: 0, total: 0 },
    summary: null,

    refresh: async () => {
      set({ loading: true });
      try {
        const [entries, unreadCount] = await Promise.all([
          updatesRepository.getFeed(),
          updatesRepository.countUnread(),
        ]);
        set({ entries, unreadCount, loading: false });
      } catch {
        set({ loading: false });
      }
    },

    runUpdate: async () => {
      if (libraryUpdateEngine.isRunning) return;
      try {
        await libraryUpdateEngine.run();
      } catch {
        // failures are already captured per-title in the returned summary;
        // a thrown error here just means "already running".
      }
    },

    markRead: async (entry) => {
      await progressRepository.markRead(entry.sourceId, entry.mangaId, entry.chapterId, 1);
      set((s) => ({
        entries: s.entries.map((e) =>
          e.sourceId === entry.sourceId &&
          e.mangaId === entry.mangaId &&
          e.chapterId === entry.chapterId
            ? { ...e, isRead: true }
            : e
        ),
        unreadCount: Math.max(0, s.unreadCount - (entry.isRead ? 0 : 1)),
      }));
    },

    markAllRead: async () => {
      const unread = get().entries.filter((e) => !e.isRead);
      await Promise.all(
        unread.map((e) => progressRepository.markRead(e.sourceId, e.mangaId, e.chapterId, 1))
      );
      set((s) => ({
        entries: s.entries.map((e) => ({ ...e, isRead: true })),
        unreadCount: 0,
      }));
    },
  };
});
