import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { MangaCard } from "@/components/MangaCard";
import { ContinueReading } from "@/components/ContinueReading";
import {
  Button,
  Chip,
  EmptyState,
  Field,
  IconButton,
  ScreenHeader,
} from "@/components/ui/MD3";
import { Ripple } from "@/components/ui/Ripple";
import { LibraryService } from "@/services/LibraryService";
import { historyRepository } from "@/db/repositories/historyRepository";
import { progressRepository } from "@/db/repositories/progressRepository";
import { useSettingsStore } from "@/state/settingsStore";
import type { LibraryEntry } from "@/domain/models";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS, TOUCH } from "@/theme/theme";

const GAP = 12;
const PADDING = 16;

type FilterMode = "all" | "unread" | "downloaded";
type SortMode = "title" | "recentlyAdded" | "recentlyUpdated" | "progress";

const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: "all", label: "All" },
  { mode: "unread", label: "Unread" },
  { mode: "downloaded", label: "Downloaded" },
];

const SORTS: { mode: SortMode; label: string }[] = [
  { mode: "title", label: "Title" },
  { mode: "recentlyAdded", label: "Recently added" },
  { mode: "recentlyUpdated", label: "Recently updated" },
  { mode: "progress", label: "Progress" },
];

interface ResumeEntry {
  coverUrl?: string;
  title: string;
  chapterLabel: string;
  progress: number;
  onPress: () => void;
}

export default function LibraryScreen() {
  const theme = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const columns = useSettingsStore((s) => s.gridColumns);
  const setGridColumns = useSettingsStore((s) => s.setGridColumns);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("title");
  const [resume, setResume] = useState<ResumeEntry | null>(null);

  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const keyOf = (e: LibraryEntry) => `${e.sourceId}-${e.mangaId}`;

  const load = useCallback(async () => {
    try {
      const [data, history] = await Promise.all([
        LibraryService.getLibrary(),
        historyRepository.getRecent(1),
      ]);
      setEntries(data);
      if (history.length > 0) {
        const h = history[0];
        const library = data.find((e) => e.sourceId === h.sourceId && e.mangaId === h.mangaId);
        const prog = await progressRepository.get(h.sourceId, h.mangaId, h.chapterId);
        setResume(
          library
            ? {
                coverUrl: library.coverUrl,
                title: library.title,
                chapterLabel:
                  `Chapter ${h.chapterNumber}` +
                  (prog && prog.pageCount > 0 ? ` · page ${h.lastPageIndex + 1}/${prog.pageCount}` : ""),
                progress: prog && prog.pageCount > 0 ? (h.lastPageIndex + 1) / prog.pageCount : 0,
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
              }
            : null
        );
      } else {
        setResume(null);
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = q ? entries.filter((e) => e.title.toLowerCase().includes(q)) : entries.slice();

    if (filter === "unread") out = out.filter((e) => (e.progress ?? 0) < 1);
    else if (filter === "downloaded") out = out.filter((e) => e.downloaded);

    out.sort((a, b) => {
      switch (sort) {
        case "recentlyAdded":
          return b.addedAt.localeCompare(a.addedAt);
        case "recentlyUpdated":
          return (b.lastFetchedAt ?? "").localeCompare(a.lastFetchedAt ?? "");
        case "progress":
          return (a.progress ?? 0) - (b.progress ?? 0);
        default:
          return a.title.localeCompare(b.title);
      }
    });
    return out;
  }, [entries, query, filter, sort]);

  const cardWidth = (width - PADDING * 2 - GAP * (columns - 1)) / columns;

  const toggleSearch = useCallback(() => {
    setSearchOpen((open) => {
      if (open) setQuery("");
      return !open;
    });
  }, []);

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) setSelecting(false);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelectedKeys(new Set());
  }, []);

  const removeSelected = useCallback(async () => {
    const keys = entries
      .filter((e) => selectedKeys.has(keyOf(e)))
      .map((e) => ({ sourceId: e.sourceId, mangaId: e.mangaId }));
    if (!keys.length) return;
    await LibraryService.removeManyFromLibrary(keys);
    exitSelection();
    load();
  }, [entries, selectedKeys, exitSelection, load]);

  const subtitle = entries.length ? `${entries.length} series` : "No series yet";

  if (!loading && entries.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
        <ScreenHeader title="Library" subtitle={subtitle} />
        <EmptyState
          icon="library-outline"
          title="Your library is empty"
          subtitle="Add a comic from Browse to start building your library."
          action={
            <Button label="Find comics" onPress={() => router.push("/(tabs)/browse")} />
          }
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
        {selecting ? (
          <View style={{ paddingHorizontal: 6, flexDirection: "row", alignItems: "center", paddingBottom: 6 }}>
            <IconButton icon="close" onPress={exitSelection} accessibilityLabel="Exit selection" />
            <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, flex: 1, marginLeft: 6 }}>
              {selectedKeys.size} selected
            </Text>
            <IconButton
              icon="checkmark-done-outline"
              onPress={() => setSelectedKeys(new Set(data.map(keyOf)))}
              accessibilityLabel="Select all"
            />
            <View style={{ borderRadius: RADIUS.pill, overflow: "hidden" }}>
              <Ripple onPress={removeSelected} accessibilityLabel="Remove from library">
                <View
                  style={{
                    height: TOUCH,
                    paddingHorizontal: 14,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name="trash-outline" size={18} color={theme.error} />
                  <Text style={{ color: theme.error, fontWeight: "700", fontSize: 13, marginLeft: 6 }}>
                    Remove
                  </Text>
                </View>
              </Ripple>
            </View>
          </View>
        ) : (
          <ScreenHeader
            title="Library"
            subtitle={subtitle}
            right={
              <View style={{ flexDirection: "row" }}>
                <IconButton
                  icon={searchOpen ? "close" : "search"}
                  color={theme.text}
                  onPress={toggleSearch}
                  accessibilityLabel="Search library"
                />
                <IconButton
                  icon="options-outline"
                  color={optionsOpen ? theme.primary : theme.text}
                  onPress={() => setOptionsOpen((v) => !v)}
                  accessibilityLabel="Sort and filter"
                />
                <IconButton
                  icon="grid-outline"
                  color={theme.text}
                  onPress={() => setGridColumns(columns >= 4 ? 2 : columns + 1)}
                  accessibilityLabel="Change grid columns"
                />
              </View>
            }
          />
        )}

        {searchOpen ? (
          <View style={{ paddingHorizontal: PADDING, paddingBottom: 12 }}>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Search your library…"
              autoFocus
            />
          </View>
        ) : null}

        {optionsOpen && !selecting ? (
          <View style={{ paddingHorizontal: PADDING, paddingBottom: 4 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {FILTERS.map((f) => (
                <Chip key={f.mode} label={f.label} selected={filter === f.mode} onPress={() => setFilter(f.mode)} />
              ))}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {SORTS.map((s) => (
                <Chip
                  key={s.mode}
                  icon="swap-vertical-outline"
                  label={s.label}
                  selected={sort === s.mode}
                  onPress={() => setSort(s.mode)}
                />
              ))}
            </View>
          </View>
        ) : null}

        <FlatList
          data={data}
          key={`cols-${columns}`}
          keyExtractor={(item) => keyOf(item)}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
          contentContainerStyle={{
            paddingHorizontal: PADDING,
            paddingBottom: 32,
            gap: GAP,
            flexGrow: 1,
          }}
          renderItem={({ item }) => {
            const key = keyOf(item);
            return (
              <MangaCard
                tile={{
                  sourceId: item.sourceId,
                  mangaId: item.mangaId,
                  title: item.title,
                  coverUrl: item.coverUrl,
                  subtitle: item.author,
                }}
                width={cardWidth}
                progress={item.progress ?? 0}
                caption={item.author ?? ""}
                downloaded={item.downloaded}
                selecting={selecting}
                selected={selectedKeys.has(key)}
                onPress={() =>
                  selecting
                    ? toggleSelected(key)
                    : router.push({
                        pathname: "/manga/[id]",
                        params: { id: item.mangaId, sourceId: item.sourceId },
                      })
                }
                onLongPress={() => {
                  setSelecting(true);
                  toggleSelected(key);
                }}
              />
            );
          }}
          ListHeaderComponent={
            // Explicit props rather than `{...resume}` — resume.key is a
            // domain identifier (last-read chapter), not a React
            // reconciliation key, and this is a single conditionally
            // rendered element (not a list item), so no React `key` is
            // needed here at all. Spreading an object that happens to
            // contain a `key` field straight into JSX props is a known
            // React foot-gun: newer React treats a `key` arriving via
            // spread specially and can warn/throw on it, which is exactly
            // what was crashing this screen.
            !searchOpen && !selecting && !optionsOpen && resume ? (
              <ContinueReading
                coverUrl={resume.coverUrl}
                title={resume.title}
                chapterLabel={resume.chapterLabel}
                progress={resume.progress}
                onPress={resume.onPress}
              />
            ) : null
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                icon={entries.length ? "search-outline" : "library-outline"}
                title={entries.length ? "No matches" : "Your library is empty"}
                subtitle={
                  entries.length
                    ? "Try a different search or filter."
                    : "Add a comic from Browse to start building your library."
                }
                action={
                  entries.length ? null : (
                    <Button label="Find comics" onPress={() => router.push("/(tabs)/browse")} />
                  )
                }
              />
            )
          }
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={load}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        />
      </View>
  );
}