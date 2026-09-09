import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SearchService } from "@/services/SearchService";
import { MangaCard } from "@/components/MangaCard";
import { Button, Chip, EmptyState, Field } from "@/components/ui/MD3";
import { useAppTheme } from "@/theme/useAppTheme";
import type { MangaTile } from "@/domain/models";

const GAP = 12;
const PADDING = 16;

type Mode = "popular" | "latest" | "search";

/** Source-specific browse: everything one installed InkDex source exposes —
 * popular, latest, and source-local search. Opened from the Catalogs screen
 * by tapping a source. Mirrors Honya's browse/[pluginId] screen. */
export default function BrowseSourceScreen() {
  const { sourceId } = useLocalSearchParams<{ sourceId: string }>();
  const id = decodeURIComponent(sourceId ?? "");
  const theme = useAppTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<Mode>("popular");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<MangaTile[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sources = useMemo(() => SearchService.listSources(), []);
  useEffect(() => {
    const name = sources.find((s) => s.id === id)?.name;
    navigation.setOptions({ title: name ?? "Browse" });
  }, [id, navigation, sources]);

  const load = useCallback(
    async (targetPage: number, replace: boolean) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        let result;
        if (mode === "search" && query.trim()) {
          result = await SearchService.search(id, { query: query.trim() }, targetPage);
        } else if (mode === "latest") {
          result = await SearchService.getLatestUpdates(id, targetPage);
        } else {
          result = await SearchService.getPopular(id, targetPage);
        }
        setItems((prev) => (replace ? result.tiles : [...prev, ...result.tiles]));
        setPage(targetPage);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Failed to load titles");
        if (replace) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [id, mode, query]
  );

  useEffect(() => {
    if (id && mode !== "search") load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);
  const cardWidth = (width - PADDING * 2 - GAP * 2) / 3;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: PADDING, paddingTop: 12, gap: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          <Chip label="Popular" selected={mode === "popular"} onPress={() => setMode("popular")} icon="flame-outline" />
          <Chip label="Latest" selected={mode === "latest"} onPress={() => setMode("latest")} icon="time-outline" />
          <Chip label="Search" selected={mode === "search"} onPress={() => setMode("search")} icon="search-outline" />
        </View>
        {mode === "search" ? (
          <>
            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Search this source…"
              onSubmitEditing={() => load(1, true)}
            />
            <Button
              label="Search"
              icon={<Ionicons name="search" size={15} color={theme.onPrimary} />}
              onPress={() => load(1, true)}
            />
          </>
        ) : null}
        {error ? <Text style={{ color: theme.error, fontSize: 12.5 }}>{error}</Text> : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.mangaId}-${index}`}
        numColumns={3}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: PADDING, gap: GAP, flexGrow: 1 }}
        renderItem={({ item }) => (
          <MangaCard
            tile={item}
            width={cardWidth}
            onPress={() =>
              router.push({
                pathname: "/manga/[id]",
                params: { id: item.mangaId, sourceId: item.sourceId },
              })
            }
          />
        )}
        onEndReachedThreshold={0.6}
        onEndReached={() => !loading && mode !== "search" && load(page + 1, false)}
        ListFooterComponent={
          loading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 16 }} /> : null
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="browsers-outline"
              title={error ? "Couldn't load" : "Nothing here yet"}
              subtitle={error ? error : "Pull up again in a bit or try another tab."}
            />
          )
        }
      />
    </View>
  );
}
