import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cover } from "@/components/ui/Cover";
import { EmptyState, IconButton, ProgressBar, ScreenHeader } from "@/components/ui/MD3";
import { Ripple } from "@/components/ui/Ripple";
import { DownloadService } from "@/services/DownloadService";
import { libraryRepository } from "@/db/repositories/libraryRepository";
import type { DownloadEntry, LibraryEntry } from "@/domain/models";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";

const STATUS_LABEL: Record<DownloadEntry["status"], string> = {
  queued: "Queued",
  downloading: "Downloading",
  paused: "Paused",
  completed: "Downloaded",
  error: "Failed",
};

interface Row {
  entry: DownloadEntry;
  coverUrl?: string;
  mangaTitle: string;
}

export default function DownloadsScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [downloads, library] = await Promise.all([
        DownloadService.getAll(),
        libraryRepository.getAll(),
      ]);
      const libraryByKey = new Map<string, LibraryEntry>();
      for (const l of library) {
        libraryByKey.set(`${l.sourceId}:${l.mangaId}`, l);
      }
      setRows(
        downloads.map((entry) => {
          const entryLib = libraryByKey.get(`${entry.sourceId}:${entry.mangaId}`);
          return {
            entry,
            coverUrl: entryLib?.coverUrl,
            mangaTitle: entryLib?.title ?? entry.mangaId,
          };
        })
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    const unsub = DownloadService.subscribe(() => refresh());
    return () => {
      unsub();
    };
  }, [refresh]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title="Downloads"
        subtitle={
          rows.length
            ? `${rows.filter((r) => r.entry.status === "completed").length} of ${rows.length} complete`
            : "Offline chapters"
        }
      />

      {loading && rows.length === 0 ? null : (
        <FlatList
          data={rows}
          keyExtractor={(row) => String(row.entry.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="download-outline"
              title="No downloads yet"
              subtitle="Open a chapter and download it for offline reading."
              action={null}
            />
          }
          renderItem={({ item }) => {
            const { entry, coverUrl, mangaTitle } = item;
            const status = entry.status;
            const pct =
              entry.totalPages > 0
                ? Math.round((entry.progressPages / entry.totalPages) * 100) / 100
                : 0;
            const isDone = status === "completed";
            const isErr = status === "error";

            return (
              <Ripple
                onPress={
                  isDone
                    ? () =>
                        router.push({
                          pathname: "/reader/[chapterId]",
                          params: {
                            chapterId: entry.chapterId,
                            sourceId: entry.sourceId,
                            mangaId: entry.mangaId,
                            chapterNumber: String(entry.chapterNumber),
                          },
                        })
                    : undefined
                }
              >
                <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Cover uri={coverUrl} title={mangaTitle} width={50} height={72} radius={RADIUS.md} />
                  <View style={{ flex: 1, minWidth: 0, marginLeft: 14 }}>
                    <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14.5, fontWeight: "700" }}>
                      {mangaTitle}
                    </Text>
                    <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>
                      {entry.chapterTitle}
                    </Text>
                    <View style={{ marginTop: 10, marginRight: 4 }}>
                      <ProgressBar value={pct} height={3} fill={isErr ? theme.error : undefined} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{ color: isErr ? theme.error : theme.textMuted, fontSize: 11.5, fontWeight: "600", marginTop: 6 }}
                    >
                      {STATUS_LABEL[status]}
                      {status !== "error" && entry.totalPages > 0
                        ? ` · ${entry.progressPages}/${entry.totalPages} pages`
                        : entry.errorMessage
                        ? ` · ${entry.errorMessage}`
                        : ""}
                    </Text>
                  </View>
                  <IconButton
                    icon="trash-outline"
                    color={theme.error}
                    onPress={() => DownloadService.remove(entry.id).then(refresh)}
                    accessibilityLabel="Remove download"
                  />
                </View>
              </Ripple>
            );
          }}
        />
      )}
    </View>
  );
}