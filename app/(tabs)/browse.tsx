import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Image, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { SearchService } from "@/services/SearchService";
import type { GlobalSearchResultTile, GlobalSearchResult, GlobalSearchError } from "@/services/SearchService";
import { providerRegistry } from "@/services/providerRegistry";
import { useExtensionsStore } from "@/extensions/extensionStore";
import { Button, EmptyState, ScreenHeader, SearchBar, SectionLabel, SkeletonList } from "@/components/ui/MD3";
import { Ripple } from "@/components/ui/Ripple";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";
import type { SourceInfo } from "@/domain/models";

const DEBOUNCE_MS = 450;

/** One installed source in the Catalogs list — tapping opens that source's
 * own browse experience. Mirrors Honya's catalogs SourceRow. */
const SourceRow = memo(function SourceRow({
  source,
  onPress,
}: {
  source: SourceInfo;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Ripple onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          backgroundColor: theme.surface1,
          borderRadius: RADIUS.lg,
          marginBottom: 10,
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
          {source.iconUrl ? (
            <Image source={{ uri: source.iconUrl }} style={{ width: "100%", height: "100%" }} />
          ) : (
            <Text style={{ color: theme.textMuted, fontWeight: "800" }}>{source.name.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontWeight: "700", fontSize: 14.5 }}>
            {source.name}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {source.language} · v{source.version}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />
      </View>
    </Ripple>
  );
});

/** A single global-search hit, tagged with its source. */
const SearchResultRow = memo(function SearchResultRow({
  item,
  onPress,
}: {
  item: GlobalSearchResultTile;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Ripple onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 16 }}>
        <View style={{ width: 42, height: 60, borderRadius: RADIUS.sm, overflow: "hidden", backgroundColor: theme.surface2 }}>
          {item.coverUrl ? (
            <Image source={{ uri: item.coverUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
          ) : null}
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={2} style={{ color: theme.text, fontWeight: "700", fontSize: 14, lineHeight: 18 }}>
            {item.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 5 }}>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: RADIUS.sm,
                backgroundColor: theme.secondaryContainer,
              }}
            >
              <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "700" }}>{item.sourceName}</Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 8 }} />
      </View>
    </Ripple>
  );
});

/** Catalogs: installed sources + global search across them (Honya pattern).
 * The top level represents installed sources, not a dump of every title. */
export default function CatalogsScreen() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResultTile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchErrors, setSearchErrors] = useState<GlobalSearchError[]>([]);
  const requestRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => setSources(SearchService.listSources());
    refresh();
    const unsubStore = useExtensionsStore.subscribe(refresh);
    const unsubRegistry = providerRegistry.subscribe(refresh);
    return () => {
      unsubStore();
      unsubRegistry();
    };
  }, []);

  const runSearch = useCallback(async (q: string) => {
    const clean = q.trim();
    if (!clean) {
      requestRef.current += 1;
      setResults([]);
      setHasSearched(false);
      setIsSearching(false);
      setSearchErrors([]);
      return;
    }
    const req = ++requestRef.current;
    setIsSearching(true);
    try {
      const res: GlobalSearchResult = await SearchService.globalSearch(clean);
      if (req !== requestRef.current) return;
      setResults(res.results);
      setHasSearched(true);
      setSearchErrors(res.errors);
    } catch {
      if (req !== requestRef.current) return;
      setResults([]);
      setHasSearched(true);
      setSearchErrors([]);
    } finally {
      if (req === requestRef.current) setIsSearching(false);
    }
  }, []);

  const onChangeText = useCallback(
    (t: string) => {
      setQuery(t);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(t), DEBOUNCE_MS);
    },
    [runSearch]
  );

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const clearSearch = useCallback(() => {
    requestRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery("");
    setResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setSearchErrors([]);
  }, []);

  const openResult = useCallback(
    (item: GlobalSearchResultTile) => {
      router.push({
        pathname: "/manga/[id]",
        params: { id: item.mangaId, sourceId: item.sourceId },
      });
    },
    [router]
  );

  const openSource = useCallback(
    (source: SourceInfo) => {
      router.push(`/browse/${encodeURIComponent(source.id)}`);
    },
    [router]
  );

  const activeQuery = query.trim();

  let body: React.ReactNode;
  if (!sources.length) {
    body = (
      <EmptyState
        icon="apps-outline"
        title="No sources installed"
        subtitle="Install an extension source to start browsing. Your InkDex repository and extensions are managed in Sources."
        action={<Button label="Manage sources" onPress={() => router.push("/sources")} />}
      />
    );
  } else if (isSearching) {
    body = (
      <View style={{ flex: 1, paddingTop: 4 }}>
        <Text style={{ color: theme.textMuted, fontSize: 12.5, paddingHorizontal: 16, paddingBottom: 10 }}>
          Searching {sources.length} source{sources.length === 1 ? "" : "s"}…
        </Text>
        <SkeletonList count={6} />
      </View>
    );
  } else if (hasSearched) {
    body = (
      <FlatList
        data={results}
        keyExtractor={(item) => `${item.sourceId}-${item.mangaId}`}
        contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <SearchResultRow item={item} onPress={() => openResult(item)} />}
        ListHeaderComponent={
          searchErrors.length > 0 ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, gap: 4 }}>
              <Text style={{ color: theme.error, fontSize: 12, fontWeight: "600" }}>
                {searchErrors.length} source{searchErrors.length === 1 ? "" : "s"} did not respond
              </Text>
              {searchErrors.map((e) => (
                <Text key={e.sourceName} style={{ color: theme.textMuted, fontSize: 11 }}>
                  {e.sourceName}: {e.message}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={{ color: theme.textMuted, fontSize: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
              Results for "{activeQuery}"
            </Text>
          )
        }
        ListEmptyComponent={
          <EmptyState
            icon="search-outline"
            title={searchErrors.length === sources.length ? "Couldn't search these sources" : "No results"}
            subtitle={
              searchErrors.length === sources.length
                ? "Every source failed to respond. Check your connection, or try again."
                : `No installed source has “${activeQuery}”.`
            }
            action={
              <Button label="Search again" variant="tonal" onPress={() => runSearch(query)} />
            }
          />
        }
      />
    );
  } else {
    body = (
      <FlatList
        data={sources}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <SectionLabel>Installed sources</SectionLabel>
            <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
              Tap a source to browse it, or search across all sources above.
            </Text>
          </View>
        }
        renderItem={({ item }) => <SourceRow source={item} onPress={() => openSource(item)} />}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
      <ScreenHeader
        title="Catalogs"
        subtitle={
          sources.length
            ? `${sources.length} source${sources.length === 1 ? "" : "s"} installed`
            : "No sources installed"
        }
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 2, paddingBottom: 10 }}>
        <SearchBar
          value={query}
          onChangeText={onChangeText}
          onClear={clearSearch}
          onSubmit={() => runSearch(query)}
          placeholder={sources.length ? "Search across your sources…" : "Install a source to search"}
          autoFocus={false}
        />
      </View>
      {body}
    </View>
  );
}
