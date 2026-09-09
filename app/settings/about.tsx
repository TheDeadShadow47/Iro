import React from "react";
import { ScrollView, Text, View } from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsDivider, SettingsGroup, SettingsRow } from "@/components/SettingsRow";
import { useExtensionsStore } from "@/extensions/extensionStore";
import { useSettingsStore, safeHost } from "@/state/settingsStore";
import { useAppTheme } from "@/theme/useAppTheme";

export default function AboutSettingsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const registryUrl = useSettingsStore((s) => s.registryUrl);
  const installedCount = useExtensionsStore((s) => s.installed.length);
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const host = registryUrl ? safeHost(registryUrl) : undefined;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
    >
      <View style={{ alignItems: "center", paddingVertical: 28 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            backgroundColor: theme.primaryContainer,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: theme.onPrimaryContainer, fontSize: 34, fontWeight: "800" }}>I</Text>
        </View>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: "800", marginTop: 14 }}>Iro</Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>
          A manga reader for InkDex extension sources
        </Text>
      </View>

      <SettingsGroup>
        <SettingsRow icon="pricetag-outline" title="Version" subtitle={`v${version}`} />
        <SettingsDivider />
        <SettingsRow icon="server-outline" title="Source registry" subtitle={host ?? registryUrl ?? "Not configured"} />
        <SettingsDivider />
        <SettingsRow icon="extension-puzzle-outline" title="Installed sources" subtitle={`${installedCount}`} />
      </SettingsGroup>

      <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 4 }}>
        Iro uses Material 3 design tokens and fetches everything through
        InkDex extension providers.
      </Text>
    </ScrollView>
  );
}
