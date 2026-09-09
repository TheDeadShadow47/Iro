import React from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useExtensionsStore } from "@/extensions/extensionStore";
import { useSettingsStore, safeHost } from "@/state/settingsStore";
import { Surface, SectionLabel } from "@/components/ui/MD3";
import { Ripple } from "@/components/ui/Ripple";
import { useAppTheme } from "@/theme/useAppTheme";

function Row({
  icon,
  title,
  subtitle,
  onPress,
  danger,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const theme = useAppTheme();
  const tint = danger ? theme.error : theme.primary;
  return (
    <Ripple onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}>
        <Ionicons name={icon} size={20} color={tint} style={{ width: 30 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />
      </View>
    </Ripple>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <Surface level={1} style={{ overflow: "hidden", marginBottom: 18 }}>
      {children}
    </Surface>
  );
}

function Divider() {
  const theme = useAppTheme();
  return <View style={{ height: 1, backgroundColor: theme.outline, marginLeft: 46 }} />;
}

export default function MoreScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const installedCount = useExtensionsStore((s) => s.installed.length);
  const themeKey = useSettingsStore((s) => s.theme);
  const registryUrl = useSettingsStore((s) => s.registryUrl);
  const gridColumns = useSettingsStore((s) => s.gridColumns);
  const setGridColumns = useSettingsStore((s) => s.setGridColumns);
  const host = registryUrl ? safeHost(registryUrl) : undefined;

  const cycleColumns = () => {
    const next = gridColumns >= 4 ? 2 : gridColumns + 1;
    void setGridColumns(next);
  };

  const resetPrefs = () => {
    Alert.alert("Reset preferences", "Reset grid columns to default?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () => void setGridColumns(3),
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{
        padding: 16,
        paddingTop: insets.top + 12,
        paddingBottom: 40,
      }}
    >
      <Surface level={1} style={{ padding: 18, marginBottom: 18 }}>
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>Iro</Text>
        <Text style={{ color: theme.textMuted, marginTop: 6, fontSize: 13 }}>
          {installedCount} extension{installedCount === 1 ? "" : "s"} installed
          {registryUrl ? " · " + (host ?? "repository") : " · no repository"}
        </Text>
      </Surface>

      <SectionLabel>Appearance</SectionLabel>
      <Group>
        <Row
          icon="color-palette-outline"
          title="Appearance"
          subtitle={themeKey === "dark" ? "Ink (dark)" : "Paper (light)"}
          onPress={() => router.push("/settings/theme")}
        />
        <Divider />
        <Row
          icon="grid-outline"
          title="Grid columns"
          subtitle={`${gridColumns} columns`}
          onPress={cycleColumns}
        />
      </Group>

      <SectionLabel>Extensions</SectionLabel>
      <Group>
        <Row
          icon="apps-outline"
          title="Extensions"
          subtitle={`${installedCount} installed`}
          onPress={() => router.push("/sources")}
        />
      </Group>

      <SectionLabel>Reading</SectionLabel>
      <Group>
        <Row
          icon="book-outline"
          title="Reader"
          subtitle="Mode, background, display"
          onPress={() => router.push("/settings/reader")}
        />
      </Group>

      <SectionLabel>Data</SectionLabel>
      <Group>
        <Row
          icon="download-outline"
          title="Downloads"
          subtitle="Queue, progress, files"
          onPress={() => router.push("/(tabs)/downloads")}
        />
        <Divider />
        <Row
          icon="folder-open-outline"
          title="Storage"
          subtitle="Downloads & cache"
          onPress={() => router.push("/settings/storage")}
        />
        <Divider />
        <Row
          icon="save-outline"
          title="Backup & restore"
          subtitle="Export or import your library"
          onPress={() => router.push("/settings/backup")}
        />
      </Group>

      <SectionLabel>About</SectionLabel>
      <Group>
        <Row icon="information-circle-outline" title="About Iro" onPress={() => router.push("/settings/about")} />
        <Divider />
        <Row
          icon="refresh-outline"
          title="Reset grid columns"
          subtitle="Restore the default"
          danger
          onPress={resetPrefs}
        />
      </Group>
    </ScrollView>
  );
}
