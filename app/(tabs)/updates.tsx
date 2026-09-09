import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { UpdateRow } from "@/components/UpdateRow";
import { EmptyState, IconButton, ListHeading, ProgressBar, ScreenHeader, SkeletonList } from "@/components/ui/MD3";
import { Ripple } from "@/components/ui/Ripple";
import { useUpdatesStore } from "@/state/updatesStore";
import { relativeTime, groupByDay } from "@/utils/time";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";
import type { UpdateEntry } from "@/domain/models";

function UpdateBanner() {
  const theme = useAppTheme();
  const progress = useUpdatesStore((s) => s.progress);
  const summary = useUpdatesStore((s) => s.summary);
  const runUpdate = useUpdatesStore((s) => s.runUpdate);

  if (progress.running) {
    const pct = progress.total ? progress.current / progress.total : 0;
    return (
      <View style={{ marginHorizontal: 16, marginBottom: 14, padding: 16, borderRadius: RADIUS.lg, backgroundColor: theme.surface1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15, marginLeft: 10 }}>
            Updating library
          </Text>
        </View>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>
          Checking {progress.current} of {progress.total}
        </Text>
        {progress.mangaTitle ? (
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 13.5, fontWeight: "600", marginBottom: 10 }}>
            {progress.mangaTitle}
          </Text>
        ) : null}
        <ProgressBar value={pct} />
      </View>
    );
  }

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14, padding: 16, borderRadius: RADIUS.lg, backgroundColor: theme.surface1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
          <Text style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>Update library</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 4 }}>
            {summary ? `Last checked ${relativeTime(summary.lastUpdateAt)}` : "Never checked"}
          </Text>
        </View>
        <View style={{ borderRadius: RADIUS.pill, overflow: "hidden" }}>
          <Ripple onPress={runUpdate}>
            <View
              style={{
                paddingHorizontal: 18,
                height: 40,
                borderRadius: RADIUS.pill,
                backgroundColor: theme.primary,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
              }}
            >
              <Ionicons name="refresh" size={16} color={theme.onPrimary} />
              <Text style={{ color: theme.onPrimary, fontWeight: "800", fontSize: 13, marginLeft: 6 }}>
                Update
              </Text>
            </View>
          </Ripple>
        </View>
      </View>

      {summary && (summary.checked > 0 || summary.failed.length > 0) ? (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderColor: theme.outline }}>
          <Text style={{ color: theme.text, fontWeight: "700", fontSize: 13 }}>
            Checked {summary.checked} · {summary.updatedTitles} updated · {summary.newChapters} new chapters
          </Text>
          {summary.failed.length ? (
            <Text style={{ color: theme.error, fontSize: 12, marginTop: 6 }}>
              {summary.failed.length} title{summary.failed.length === 1 ? "" : "s"} failed to check
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function UpdatesScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const entries = useUpdatesStore((s) => s.entries);
  const unreadCount = useUpdatesStore((s) => s.unreadCount);
  const loading = useUpdatesStore((s) => s.loading);
  const refresh = useUpdatesStore((s) => s.refresh);
  const markRead = useUpdatesStore((s) => s.markRead);
  const markAllRead = useUpdatesStore((s) => s.markAllRead);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const rows = useMemo(() => groupByDay(entries, (e) => e.firstSeenAt), [entries]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const openChapter = useCallback(
    (entry: UpdateEntry) => {
      if (!entry.isRead) void markRead(entry);
      router.push({
        pathname: "/reader/[chapterId]",
        params: {
          chapterId: entry.chapterId,
          sourceId: entry.sourceId,
          mangaId: entry.mangaId,
          chapterNumber: String(entry.chapterNumber),
        },
      });
    },
    [router, markRead]
  );

  const subtitle = entries.length
    ? `${entries.length} chapter${entries.length === 1 ? "" : "s"}${unreadCount ? ` · ${unreadCount} unread` : ""}`
    : "No new chapters";

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title="Updates"
        subtitle={subtitle}
        right={
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {unreadCount > 0 ? (
              <IconButton icon="checkmark-done-outline" onPress={markAllRead} accessibilityLabel="Mark all read" />
            ) : null}
            <IconButton
              icon="download-outline"
              onPress={() => router.push("/(tabs)/downloads")}
              accessibilityLabel="Downloads"
            />
          </View>
        }
      />
      {loading && entries.length === 0 ? (
        <SkeletonList count={6} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            item.type === "header" ? (
              <ListHeading label={item.label} />
            ) : (
              <UpdateRow entry={item.row} onPress={() => openChapter(item.row)} />
            )
          }
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          removeClippedSubviews
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
          }
          ListHeaderComponent={<UpdateBanner />}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="No updates yet"
              subtitle="Add titles to your library, then tap Update to check for new chapters."
            />
          }
        />
      )}
    </View>
  );
}
