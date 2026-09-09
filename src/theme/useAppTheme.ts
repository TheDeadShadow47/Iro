import { THEMES, type IroTheme, type ThemeKey } from "@/theme/theme";
import { useSettingsStore } from "@/state/settingsStore";

/** Resolves the active theme from the persisted settings store. */
export function useAppTheme(): IroTheme {
  const key = useSettingsStore((s) => s.theme);
  return THEMES[key as ThemeKey] ?? THEMES.dark;
}

export function useThemeKey(): ThemeKey {
  return useSettingsStore((s) => s.theme);
}

/** Access the active theme outside render (services, imperative code). */
export function getActiveTheme(): IroTheme {
  return THEMES[useSettingsStore.getState().theme] ?? THEMES.dark;
}