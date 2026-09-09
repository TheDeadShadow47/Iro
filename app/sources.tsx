import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Text, View, Modal, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "@/state/settingsStore";
import { useExtensionsStore } from "@/extensions/extensionStore";
import { fetchRegistryIndex } from "@/extensions/registry";
import type { ExtensionManifest, InstalledExtension } from "@/domain/models";
import { withCloudflareRetry } from "@/utils/cloudflareRetry";
import { Button, Chip, EmptyState, Field } from "@/components/ui/MD3";
import { Ripple } from "@/components/ui/Ripple";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";

const REGISTRY_SOURCE_ID = "__registry";

type Tab = "installed" | "available";

/** Honya-style extension manager: a repository (registry URL) plus the
 * installed / available extension lists. Iro starts empty — there is no
 * hardcoded repository and no hardcoded extension catalogue. */
export default function ExtensionsScreen() {
  const theme = useAppTheme();
  const registryUrl = useSettingsStore((s) => s.registryUrl);
  const setRegistryUrl = useSettingsStore((s) => s.setRegistryUrl);
  const installed = useExtensionsStore((s) => s.installed);
  const pending = useExtensionsStore((s) => s.pending);
  const storeError = useExtensionsStore((s) => s.error);
  const clearError = useExtensionsStore((s) => s.clearError);
  const install = useExtensionsStore((s) => s.install);
  const uninstall = useExtensionsStore((s) => s.uninstall);

  const [tab, setTab] = useState<Tab>("installed");
  const [manifests, setManifests] = useState<ExtensionManifest[]>([]);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Repository dialog
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [savingRepo, setSavingRepo] = useState(false);

  const hasRegistry = !!registryUrl;

  const loadRegistry = useCallback(async (url: string) => {
    setLoadingIndex(true);
    setIndexError(null);
    try {
      const index = await withCloudflareRetry(REGISTRY_SOURCE_ID, () =>
        fetchRegistryIndex(url)
      );
      setManifests(index.sources);
    } catch (err: any) {
      setIndexError(err instanceof Error ? err.message : "Failed to load repository");
    } finally {
      setLoadingIndex(false);
    }
  }, []);

  useEffect(() => {
    if (hasRegistry) {
      void loadRegistry(registryUrl!);
    } else {
      setManifests([]);
      setIndexError(null);
    }
  }, [hasRegistry, registryUrl, loadRegistry]);

  const openAddDialog = useCallback(() => {
    setRepoInput(registryUrl ?? "");
    setRepoDialogOpen(true);
  }, [registryUrl]);

  const saveRepo = useCallback(async () => {
    const url = repoInput.trim();
    if (!url) return;
    setSavingRepo(true);
    try {
      await setRegistryUrl(url);
      setRepoDialogOpen(false);
    } catch (err: any) {
      Alert.alert("Invalid repository", err?.message ?? "That URL could not be used.");
    } finally {
      setSavingRepo(false);
    }
  }, [repoInput, setRegistryUrl]);

  const removeRepo = useCallback(() => {
    Alert.alert("Remove repository", "Remove this repository?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void setRegistryUrl(null);
        },
      },
    ]);
  }, [setRegistryUrl]);

  const handleInstall = useCallback(
    async (manifest: ExtensionManifest) => {
      try {
        await install(manifest);
      } catch (err: any) {
        Alert.alert("Install failed", err?.message ?? "Could not install extension");
      }
    },
    [install]
  );

  const handleUninstall = useCallback(
    (ext: InstalledExtension) => {
      Alert.alert("Remove extension", `Remove ${ext.name}?`, [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => void uninstall(ext.id) },
      ]);
    },
    [uninstall]
  );

  const installedById = useMemo(() => {
    const map = new Map<string, InstalledExtension>();
    for (const e of installed) map.set(e.id, e);
    return map;
  }, [installed]);

  const q = search.trim().toLowerCase();
  const available = useMemo(
    () =>
      manifests
        .filter((m) => !q || m.name.toLowerCase().includes(q) || m.language.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [manifests, q]
  );

  const installedList = useMemo(
    () => [...installed].sort((a, b) => a.name.localeCompare(b.name)),
    [installed]
  );

  let body: React.ReactNode;
  if (tab === "installed") {
    body = (
      <FlatList
        data={installedList}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 32, flexGrow: 1 }}
        renderItem={({ item }) => (
          <ExtensionRow
            name={item.name}
            language={item.language}
            version={item.version}
            iconFile={item.iconFile}
            busy={!!pending[item.id]}
            installed
            onUninstall={() => handleUninstall(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="apps-outline"
            title="No extensions installed"
            subtitle={
              hasRegistry
                ? "Open the Available tab to install a source."
                : "Add a repository first, then install a source."
            }
            action={
              hasRegistry ? (
                <Button label="See available" variant="tonal" onPress={() => setTab("available")} />
              ) : (
                <Button label="Add repository" onPress={openAddDialog} />
              )
            }
          />
        }
      />
    );
  } else if (!hasRegistry) {
    body = (
      <EmptyState
        icon="server-outline"
        title="No repository configured"
        subtitle="Add an InkDex repository URL to browse and install extensions."
        action={<Button label="Add repository" onPress={openAddDialog} />}
      />
    );
  } else if (loadingIndex) {
    body = (
      <View style={{ paddingVertical: 40, alignItems: "center" }}>
        <ActivityIndicator color={theme.primary} />
        <Text style={{ color: theme.textMuted, marginTop: 12, fontSize: 13 }}>Loading repository…</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={available}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingTop: 6, paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const installedVersion = installedById.get(item.id)?.version;
          const isInstalled = !!installedVersion;
          const updatable = isInstalled && installedVersion !== item.version;
          return (
            <ExtensionRow
              name={item.name}
              language={item.language}
              version={item.version}
              installedVersion={installedVersion}
              iconFile={null}
              busy={!!pending[item.id]}
              installed={isInstalled}
              updatable={updatable}
              onInstall={() => handleInstall(item)}
              onUninstall={
                isInstalled ? () => handleUninstall(installedById.get(item.id)!) : undefined
              }
            />
          );
        }}
        ListHeaderComponent={
          indexError ? (
            <View
              style={{
                backgroundColor: theme.surface1,
                borderRadius: RADIUS.md,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: theme.error, fontSize: 12.5, lineHeight: 17 }}>
                {indexError}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title={q ? "No matching extensions" : "No extensions in repository"}
            subtitle={
              q
                ? "Try a different search."
                : "This repository contains no extensions."
            }
          />
        }
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        {hasRegistry ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.surface1,
              borderRadius: RADIUS.md,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <Ionicons name="server-outline" size={16} color={theme.textMuted} />
            <Text numberOfLines={1} style={{ flex: 1, color: theme.text, fontSize: 12.5, marginLeft: 8 }}>
              {registryUrl}
            </Text>
            <Ripple borderless onPress={openAddDialog} accessibilityLabel="Edit repository">
              <View style={{ padding: 6 }}>
                <Ionicons name="create-outline" size={17} color={theme.text} />
              </View>
            </Ripple>
            <Ripple borderless onPress={removeRepo} accessibilityLabel="Remove repository">
              <View style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={17} color={theme.error} />
              </View>
            </Ripple>
          </View>
        ) : (
          <Button
            label="Add repository"
            icon={<Ionicons name="add" size={17} color={theme.onPrimary} />}
            onPress={openAddDialog}
          />
        )}

        <View style={{ flexDirection: "row" }}>
          <Chip
            label={`Installed (${installedList.length})`}
            selected={tab === "installed"}
            onPress={() => setTab("installed")}
            icon="checkmark-circle"
          />
          <Chip
            label={`Available (${available.length})`}
            selected={tab === "available"}
            onPress={() => setTab("available")}
            icon="download"
          />
        </View>

        {tab === "available" && hasRegistry && !loadingIndex ? (
          <Field value={search} onChangeText={setSearch} placeholder="Search extensions" />
        ) : null}

        {storeError ? (
          <Text style={{ color: theme.error, fontSize: 12, lineHeight: 17 }}>{storeError}</Text>
        ) : null}
      </View>

      {body}

      <RepoDialog
        visible={repoDialogOpen}
        value={repoInput}
        onChangeText={setRepoInput}
        saving={savingRepo}
        onDismiss={() => setRepoDialogOpen(false)}
        onSave={saveRepo}
        theme={theme}
      />
    </View>
  );
}

function ExtensionRow({
  name,
  language,
  version,
  installedVersion,
  iconFile,
  busy,
  installed = false,
  updatable = false,
  onInstall,
  onUninstall,
}: {
  name: string;
  language: string;
  version: string;
  installedVersion?: string;
  iconFile: string | null;
  busy?: boolean;
  installed?: boolean;
  updatable?: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ borderRadius: RADIUS.lg, overflow: "hidden", marginBottom: 8 }}>
      <Ripple onPress={installed ? undefined : onInstall}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            backgroundColor: theme.surface1,
            borderRadius: RADIUS.lg,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: RADIUS.md,
              backgroundColor: theme.surface3,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {iconFile ? (
              <Image source={{ uri: iconFile }} style={{ width: "100%", height: "100%" }} />
            ) : (
              <Text style={{ color: theme.textMuted, fontWeight: "800" }}>
                {name.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </View>

          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontWeight: "700", fontSize: 14.5 }}>
              {name}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
              {language} · v{version}
              {updatable ? `  (installed v${installedVersion})` : ""}
            </Text>
          </View>

          {busy ? (
            <ActivityIndicator color={theme.primary} />
          ) : installed ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {updatable ? (
                <Button label="Update" variant="tonal" onPress={onInstall} />
              ) : null}
              <Ripple borderless onPress={onUninstall} accessibilityLabel="Remove extension">
                <View style={{ padding: 8 }}>
                  <Ionicons name="trash-outline" size={19} color={theme.error} />
                </View>
              </Ripple>
            </View>
          ) : (
            <Button label="Install" onPress={onInstall} />
          )}
        </View>
      </Ripple>
    </View>
  );
}

function RepoDialog({
  visible,
  value,
  onChangeText,
  saving,
  onDismiss,
  onSave,
  theme,
}: {
  visible: boolean;
  value: string;
  onChangeText: (t: string) => void;
  saving: boolean;
  onDismiss: () => void;
  onSave: () => void;
  theme: any;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: "#000000a6", justifyContent: "center", padding: 24 }}>
        <View
          style={{
            backgroundColor: theme.surface2,
            borderRadius: RADIUS.xl,
            padding: 22,
            elevation: 12,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 19, fontWeight: "700", marginBottom: 6 }}>
            Repository URL
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
            Enter an InkDex extension repository (a versioning.json URL).
          </Text>
          <View style={{ borderRadius: RADIUS.md, overflow: "hidden" }}>
            <TextInput
              value={value}
              onChangeText={onChangeText}
              placeholder="https://…/versioning.json"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              autoFocus
              style={{
                backgroundColor: theme.surface,
                borderRadius: RADIUS.md,
                borderWidth: 1.5,
                borderColor: theme.outline,
                color: theme.text,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 14.5,
                minHeight: 80,
                textAlignVertical: "top",
              }}
            />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <Button label="Cancel" variant="text" onPress={onDismiss} />
            <Button label="Save" loading={saving} disabled={!value.trim()} onPress={onSave} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
