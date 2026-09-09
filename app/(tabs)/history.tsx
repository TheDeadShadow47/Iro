import React, { useCallback, useState } from "react";
import { FlatList, RefreshControl, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HistoryRow, type HistoryRowItem } from "@/components/HistoryRow";
import { EmptyState, ScreenHeader, SkeletonList } from "@/components/ui/MD3";
import { historyRepository } from "@/db/repositories/historyRepository";
import { progressRepository } from "@/db/repositories/progressRepository";
import { downloadsRepository } from "@/db/repositories/downloadsRepository";
import { libraryRepository } from "@/db/repositories/libraryRepository";
import type { LibraryEntry } from "@/domain/models";
import { useAppTheme } from "@/theme/useAppTheme";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

export default function HistoryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<HistoryRowItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [history, library, downloads] = await Promise.all([
        historyRepository.getRecent(100),
        libraryRepository.getAll(),
        downloadsRepository.getAll(),
      ]);

      const libraryByKey = new Map<string, LibraryEntry>();
      for (const l of library) {
        libraryByKey.set(`${l.sourceId}:${l.mangaId}`, l);
      }

      const downloadedKeys = new Set(
        downloads
          .filter((d) => d.status === "completed")
          .map((d) => `${d.sourceId}:${d.mangaId}:${d.chapterId}`)
      );

      const list: HistoryRowItem[] = await Promise.all(
        history.map(async (h) => {
          const entry = libraryByKey.get(`${h.sourceId}:${h.mangaId}`);
          const progress = await progressRepository.get(
            h.sourceId,
            h.mangaId,
            h.chapterId
          );
          const finished = progress?.isRead ?? false;
          const ratio =
            progress && progress.pageCount > 0
              ? Math.min(1, (h.lastPageIndex + 1) / progress.pageCount)
              : 0;

          return {
            key: `${h.id}`,
            coverUrl: entry?.coverUrl,
            mangaTitle: entry?.title ?? h.mangaId,
            chapterLabel: `Chapter ${h.chapterNumber}`,
            progress: ratio,
            finished,
            relativeTime: relativeTime(h.readAt),
            downloaded: downloadedKeys.has(
              `${h.sourceId}:${h.mangaId}:${h.chapterId}`
            ),
            onPress: () =>
              router.push({
                pathname: "/reader/[chapterId]",
                params: {
                  chapterId: h.chapterId,
                  sourceId: h.sourceId,
                  mangaId: h.mangaId,
                  chapterNumber: String(h.chapterNumber),
                },
              }),
          };
        })
      );

      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title="History"
        subtitle={
          rows.length
            ? `${rows.length} ${rows.length === 1 ? "chapter" : "chapters"} read`
            : "Chapters you open"
        }
      />

      {loading && rows.length === 0 ? (
        <SkeletonList count={8} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          initialNumToRender={16}
          renderItem={({ item }) => <HistoryRow item={item} />}
          contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="time-outline"
              title="No reading history yet"
              subtitle="Chapters you open will show up here so you can jump back in."
              action={null}
            />
          }
        />
      )}
    </View>
  );
}