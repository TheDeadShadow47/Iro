import { create } from "zustand";
import type { ReaderSettings } from "@/domain/models";

interface ReaderSettingsState extends ReaderSettings {
  setMode: (mode: ReaderSettings["mode"]) => void;
  toggleCropWhitespace: () => void;
  toggleKeepScreenOn: () => void;
  setBackgroundColor: (color: ReaderSettings["backgroundColor"]) => void;
}

export const useReaderSettingsStore = create<ReaderSettingsState>((set) => ({
  mode: "paged-rtl",
  cropWhitespace: false,
  keepScreenOn: true,
  backgroundColor: "black",
  setMode: (mode) => set({ mode }),
  toggleCropWhitespace: () =>
    set((s) => ({ cropWhitespace: !s.cropWhitespace })),
  toggleKeepScreenOn: () => set((s) => ({ keepScreenOn: !s.keepScreenOn })),
  setBackgroundColor: (backgroundColor) => set({ backgroundColor }),
}));
