import React, { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { THEMES, RADIUS, DEFAULT_THEME_KEYS } from "@/theme/theme";
import { useSettingsStore } from "@/state/settingsStore";
import { useAppTheme } from "@/theme/useAppTheme";
import type { ThemeKey } from "@/theme/theme";
import { Ripple } from "@/components/ui/Ripple";
import { SectionLabel } from "@/components/ui/MD3";

const SWATCHES: (keyof (typeof THEMES)["dark"])[] = [
  "background",
  "surface",
  "surface1",
  "primary",
  "secondary",
];

export default function ThemeSettingsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const selected = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const pick = (key: ThemeKey) => {
    void setTheme(key);
  };

  // Iro's two official defaults pinned first, everything else after — the
  // theme library should read as "defaults, then more options" rather than
  // an unordered dump of thirteen entries.
  const otherKeys = useMemo(
    () => (Object.keys(THEMES) as ThemeKey[]).filter((k) => !DEFAULT_THEME_KEYS.includes(k)),
    []
  );

  const renderCard = (key: ThemeKey) => {
    const t = THEMES[key];
    const isSelected = selected === key;
    return (
      <View
        key={key}
        style={{
          borderRadius: RADIUS.lg,
          overflow: "hidden",
          borderWidth: 2,
          borderColor: isSelected ? theme.primary : theme.outline,
          backgroundColor: theme.surface1,
          marginBottom: 14,
        }}
      >
        <Ripple onPress={() => pick(key)}>
          <View style={{ padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 17, fontWeight: "800" }}>
                  {t.name}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>
                  {t.description}
                </Text>
              </View>
              {isSelected ? (
                <Text style={{ color: theme.primary, fontWeight: "800", fontSize: 15 }}>✓</Text>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              {SWATCHES.map((name) => (
                <View
                  key={name}
                  style={{
                    flex: 1,
                    aspectRatio: 1.6,
                    borderRadius: RADIUS.sm,
                    backgroundColor: t[name],
                    borderWidth: 1,
                    borderColor: t.outline,
                  }}
                />
              ))}
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 10 }}>
              {t.background} · {t.surface} · {t.primary}
            </Text>
          </View>
        </Ripple>
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
    >
      <SectionLabel style={{ marginTop: 2 }}>Iro defaults</SectionLabel>
      {DEFAULT_THEME_KEYS.map(renderCard)}

      <SectionLabel style={{ marginTop: 8 }}>More themes</SectionLabel>
      {otherKeys.map(renderCard)}
    </ScrollView>
  );
}