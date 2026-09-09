import React from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsDivider, SettingsGroup, SettingsRow } from "@/components/SettingsRow";
import { SectionLabel } from "@/components/ui/MD3";
import { Ripple } from "@/components/ui/Ripple";
import { useReaderSettingsStore } from "@/state/readerSettingsStore";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";
import type { ReaderMode } from "@/domain/models";

const MODE_OPTIONS: { id: ReaderMode; label: string; hint: string }[] = [
  { id: "paged-rtl", label: "Right to left", hint: "Classic manga (pages start on the right)" },
  { id: "paged-ltr", label: "Left to right", hint: "Western comics order" },
  { id: "webtoon", label: "Webtoon", hint: "Continuous vertical scroll" },
];

const BG_OPTIONS: { id: "black" | "white" | "gray"; label: string; color: string }[] = [
  { id: "black", label: "Black", color: "#000000" },
  { id: "gray", label: "Gray", color: "#3a3d45" },
  { id: "white", label: "White", color: "#ffffff" },
];

export default function ReaderSettingsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const settings = useReaderSettingsStore();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
    >
      <SectionLabel style={{ marginTop: 2 }}>Reading mode</SectionLabel>
      <SettingsGroup>
        {MODE_OPTIONS.map((m, i) => (
          <View key={m.id}>
            {i > 0 ? <SettingsDivider /> : null}
            <Ripple onPress={() => settings.setMode(m.id)}>
              <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{m.label}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>{m.hint}</Text>
                </View>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: settings.mode === m.id ? theme.primary : theme.outline,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {settings.mode === m.id ? (
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: theme.primary }} />
                  ) : null}
                </View>
              </View>
            </Ripple>
          </View>
        ))}
      </SettingsGroup>

      <SectionLabel style={{ marginTop: 6 }}>Background</SectionLabel>
      <SettingsGroup>
        <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 16 }}>
          {BG_OPTIONS.map((bg) => {
            const active = settings.backgroundColor === bg.id;
            return (
              <Ripple key={bg.id} onPress={() => settings.setBackgroundColor(bg.id)}>
                <View style={{ alignItems: "center" }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: RADIUS.md,
                      backgroundColor: bg.color,
                      borderWidth: 2,
                      borderColor: active ? theme.primary : theme.outline,
                    }}
                  />
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 6, fontWeight: active ? "700" : "500" }}>
                    {bg.label}
                  </Text>
                </View>
              </Ripple>
            );
          })}
        </View>
      </SettingsGroup>

      <SectionLabel style={{ marginTop: 6 }}>Display</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon="moon-outline"
          title="Keep screen awake"
          subtitle="Prevent screen dimming while reading"
          right={<Switch value={settings.keepScreenOn} onValueChange={settings.toggleKeepScreenOn} />}
        />
        <SettingsDivider />
        <SettingsRow
          icon="crop-outline"
          title="Crop whitespace"
          subtitle="Trim empty margins on paged mode"
          right={<Switch value={settings.cropWhitespace} onValueChange={settings.toggleCropWhitespace} />}
        />
      </SettingsGroup>
    </ScrollView>
  );
}