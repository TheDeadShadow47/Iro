import React, { useCallback, useEffect, useState } from "react";
import { Alert, RefreshControl, ScrollView, Text, View } from "react-native";
import { Directory, Paths } from "expo-file-system";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SettingsDivider, SettingsGroup, SettingsRow } from "@/components/SettingsRow";
import { SectionLabel } from "@/components/ui/MD3";
import { useAppTheme } from "@/theme/useAppTheme";
import { DOWNLOADS_DIR_NAME, EXTENSIONS_DIR_NAME } from "@/constants/storage";
import { DownloadService } from "@/services/DownloadService";

const EXTENSIONS_DIR = new Directory(Paths.document, EXTENSIONS_DIR_NAME);
const DOWNLOADS_DIR = new Directory(Paths.document, DOWNLOADS_DIR_NAME);
const DOCUMENT_DIR = Paths.document;

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

function walkSize(dir: Directory): { bytes: number; files: number } {
  if (!dir.exists) return { bytes: 0, files: 0 };
  let bytes = 0;
  let files = 0;
  for (const entry of dir.list()) {
    if (entry instanceof Directory) {
      const sub = walkSize(entry);
      bytes += sub.bytes;
      files += sub.files;
    } else {
      bytes += entry.size ?? 0;
      files += 1;
    }
  }
  return { bytes, files };
}

interface SizeRow {
  label: string;
  bytes: number;
  files: number;
}

export default function StorageSettingsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<SizeRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(() => {
    const documents = walkSize(DOCUMENT_DIR);
    const extensions = walkSize(EXTENSIONS_DIR);
    const downloads = walkSize(DOWNLOADS_DIR);
    setRows([
      // "App documents" already contains Extensions and Downloads,
      // so it's shown as the grand total (not summed with sub-rows).
      { label: "App documents", bytes: documents.bytes, files: documents.files },
      { label: "Extensions", bytes: extensions.bytes, files: extensions.files },
      { label: "Downloads", bytes: downloads.bytes, files: downloads.files },
    ]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const total = rows[0]?.bytes ?? 0;
  const totalFiles = rows[0]?.files ?? 0;

  const onRefresh = () => {
    setRefreshing(true);
    load();
    setRefreshing(false);
  };

  const onCleanOrphans = useCallback(async () => {
    setCleaning(true);
    try {
      const { removedDirs, freedBytes } = await DownloadService.pruneOrphanedFiles();
      load();
      Alert.alert(
        removedDirs > 0 ? "Cleaned up" : "Nothing to clean up",
        removedDirs > 0
          ? `Removed ${removedDirs} orphaned chapter folder${removedDirs === 1 ? "" : "s"}, freeing ${formatBytes(freedBytes)}.`
          : "No orphaned download files were found."
      );
    } catch (err: any) {
      Alert.alert("Couldn't clean up", err?.message ?? "Unknown error");
    } finally {
      setCleaning(false);
    }
  }, [load]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
      }
    >
      <SectionLabel style={{ marginTop: 2 }}>Usage</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon="hardware-chip-outline"
          title="Total on device"
          subtitle={total ? `${formatBytes(total)} across ${totalFiles} files` : "Calculating…"}
        />
      </SettingsGroup>

      <SectionLabel style={{ marginTop: 6 }}>Location</SectionLabel>
      <SettingsGroup>
        {rows.map((row, i) => (
          <View key={row.label}>
            {i > 0 ? <SettingsDivider /> : null}
            <SettingsRow
              icon="folder-outline"
              title={row.label}
              subtitle={row.bytes ? formatBytes(row.bytes) : "Empty"}
            />
          </View>
        ))}
      </SettingsGroup>

      <SectionLabel style={{ marginTop: 6 }}>Maintenance</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon="trash-outline"
          title="Clean up orphaned downloads"
          subtitle={cleaning ? "Cleaning…" : "Remove downloaded files with no matching library entry"}
          onPress={cleaning ? undefined : onCleanOrphans}
        />
      </SettingsGroup>

      <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 4 }}>
        Downloads live in app storage so comics are readable offline. Extensions
        ship their compiled bundle and cached icon here.
      </Text>
    </ScrollView>
  );
}