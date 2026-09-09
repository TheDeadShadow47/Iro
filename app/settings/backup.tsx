import React, { useState } from "react";
import { Alert, Platform, ScrollView, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { SettingsGroup, SettingsRow } from "@/components/SettingsRow";
import { SectionLabel } from "@/components/ui/MD3";
import { useAppTheme } from "@/theme/useAppTheme";
import { BackupService, type BackupSummary } from "@/services/BackupService";

function summaryLine(s: BackupSummary): string {
  return `${s.library} title${s.library === 1 ? "" : "s"} · ${s.categories} categor${s.categories === 1 ? "y" : "ies"} · ${s.history} history entries · ${s.chapterProgress} progress rows`;
}

export default function BackupSettingsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<"export" | "import" | null>(null);

  const onExport = async () => {
    setBusy("export");
    try {
      if (Platform.OS === "android") {
        // Android: real folder picker via Storage Access Framework.
        const permission = await LegacyFileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) {
          setBusy(null);
          return;
        }
        const result = await BackupService.exportToDirectory(permission.directoryUri);
        if (!result.granted) {
          setBusy(null);
          return;
        }
        Alert.alert("Backup saved", summaryLine(result.summary));
      } else {
        // Fallback to OS share sheet's own "Save to..." flow.
        const { uri, summary } = await BackupService.exportToShareableFile();
        const available = await Sharing.isAvailableAsync();
        if (available) {
          await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Save Iro backup" });
        } else {
          Alert.alert("Backup created", `Saved to app storage:\n${uri}\n\n${summaryLine(summary)}`);
        }
      }
    } catch (err: any) {
      Alert.alert("Backup failed", err?.message ?? "Unknown error");
    } finally {
      setBusy(null);
    }
  };

  const onImport = async () => {
    let picked: DocumentPicker.DocumentPickerResult;
    try {
      picked = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "*/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
    } catch (err: any) {
      Alert.alert("Couldn't open file picker", err?.message ?? "Unknown error");
      return;
    }
    if (picked.canceled || !picked.assets?.[0]) return;

    setBusy("import");
    try {
      const json = await BackupService.readBackupFile(picked.assets[0].uri);
      const backup = BackupService.parseBackup(json);
      const s = {
        categories: backup.categories.length,
        library: backup.library.length,
        history: backup.history.length,
        chapterProgress: backup.chapterProgress.length,
        mangaCache: backup.mangaCache.length,
      };
      setBusy(null);

      Alert.alert(
        "Restore this backup?",
        `This REPLACES your current library, categories, history, and reading progress with what's in this backup (from ${new Date(backup.createdAt).toLocaleString()}):\n\n${summaryLine(s)}\n\nThis can't be undone. Downloaded chapters on disk are not affected.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Restore",
            style: "destructive",
            onPress: async () => {
              setBusy("import");
              try {
                await BackupService.restoreBackup(backup);
                Alert.alert("Restored", "Your backup has been restored. Restart Iro to see everything refreshed.");
              } catch (err: any) {
                Alert.alert("Restore failed", err?.message ?? "Unknown error");
              } finally {
                setBusy(null);
              }
            },
          },
        ]
      );
    } catch (err: any) {
      setBusy(null);
      Alert.alert("Couldn't read backup", err?.message ?? "Unknown error");
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }}
    >
      <SectionLabel style={{ marginTop: 2 }}>Backup</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon="cloud-upload-outline"
          title="Export backup"
          subtitle={
            busy === "export"
              ? "Creating…"
              : Platform.OS === "android"
              ? "Choose a folder to save to"
              : "Library, categories, history, progress & settings"
          }
          onPress={busy ? undefined : onExport}
        />
      </SettingsGroup>

      <SectionLabel style={{ marginTop: 14 }}>Restore</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon="cloud-download-outline"
          title="Import backup"
          subtitle={busy === "import" ? "Working…" : "Choose a backup file to restore"}
          onPress={busy ? undefined : onImport}
        />
      </SettingsGroup>

      <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18, paddingHorizontal: 4, marginTop: 8 }}>
        Backups don't include downloaded chapter images — only your library, categories,
        reading history and progress, cached manga metadata, and app settings. Importing a
        backup replaces your current library, categories, history and progress; it doesn't
        touch files you've already downloaded.
      </Text>
    </ScrollView>
  );
}
