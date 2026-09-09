import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter, useNavigation } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { MigrateService } from "@/services/MigrateService";
import { MangaCard } from "@/components/MangaCard";
import { Button, Chip, EmptyState, Field } from "@/components/ui/MD3";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";
import type { MangaTile } from "@/domain/models";

const GAP = 12;
const PADDING = 16;

export default function MigrateScreen() {
  const params = useLocalSearchParams<{
    fromSourceId: string;
    fromMangaId: string;
    fromTitle: string;
  }>();
  const fromSourceId = decodeURIComponent(params.fromSourceId ?? "");
  const fromMangaId = decodeURIComponent(params.fromMangaId ?? "");
  const fromTitle = decodeURIComponent(params.fromTitle ?? "");
  const theme = useAppTheme();
  const router = useRouter();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();

  const sources = useMemo(() => MigrateService.listTargetSources(fromSourceId), [fromSourceId]);
  const [sourceId, setSourceId] = useState<string>(sources[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MangaTile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<MangaTile | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: "Migrate" });
  }, [navigation]);

  useEffect(() => {
    if (!sources.find((s) => s.id === sourceId)) setSourceId(sources[0]?.id ?? "");
  }, [sources, sourceId]);

  // Reset search state when the target source changes.
  useEffect(() => {
    setResults([]);
    setSelected(null);
    setError(null);
  }, [sourceId]);

  const search = useCallback(
    async (page = 1) => {
      if (!sourceId || !query.trim()) return;
      setLoading(true);
      setError(null);
      try {
        const { results: tiles } = await MigrateService.searchSource(sourceId, query.trim(), page);
        setResults(tiles);
      } catch (err: any) {
        setError(err instanceof Error ? err.message : "Failed to search source");
      } finally {
        setLoading(false);
      }
    },
    [sourceId, query]
  );

  const doMigrate = useCallback(async () => {
    if (!selected) return;
    setMigrating(true);
    setError(null);
    try {
      await MigrateService.migrate({
        fromSourceId,
        fromMangaId,
        fromTitle,
        target: selected,
      });
      setFinished(true);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Migration failed");
    } finally {
      setMigrating(false);
    }
  }, [selected, fromSourceId, fromMangaId, fromTitle]);

  if (finished && selected) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: theme.background }}>
        <Ionicons name="checkmark-circle" size={56} color={theme.primary} />
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", marginTop: 16, textAlign: "center" }}>
          Migrated to {selected.sourceId}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 8, textAlign: "center" }}>
          Reading progress and history were copied over where chapter numbers matched. Downloads were not transferred.
        </Text>
        <View style={{ marginTop: 24, alignSelf: "stretch" }}>
          <Button
            label="Open migrated title"
            onPress={() =>
              router.replace({
                pathname: "/manga/[id]",
                params: { id: selected.mangaId, sourceId: selected.sourceId },
              })
            }
          />
        </View>
      </View>
    );
  }

  const cardWidth = (width - PADDING * 2 - GAP * 2) / 3;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingHorizontal: PADDING, paddingTop: 12, gap: 10 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
          Moving “{fromTitle}” from{" "}
          <Text style={{ color: theme.primary }}>{sources.find((s) => s.id === fromSourceId)?.name ?? fromSourceId}</Text>
        </Text>

        {sources.length === 0 ? (
          <EmptyState icon="server-outline" title="No other sources" subtitle="Install another source in Sources to migrate to it." />
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {sources.map((s) => (
                <Chip
                  key={s.id}
                  label={s.name}
                  selected={sourceId === s.id}
                  onPress={() => setSourceId(s.id)}
                />
              ))}
            </View>

            <Field
              value={query}
              onChangeText={setQuery}
              placeholder="Find the same title on this source…"
              onSubmitEditing={() => search(1)}
            />
            <Button
              label="Search target source"
              icon={<Ionicons name="search" size={15} color={theme.onPrimary} />}
              onPress={() => search(1)}
            />
            {error ? <Text style={{ color: theme.error, fontSize: 12.5 }}>{error}</Text> : null}
          </>
        )}
      </View>

      {selected ? (
        <View
          style={{
            margin: PADDING,
            padding: 12,
            borderRadius: RADIUS.md,
            backgroundColor: theme.primaryContainer,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.onPrimaryContainer, fontSize: 13, fontWeight: "700" }} numberOfLines={2}>
            Selected: {selected.title}
          </Text>
          <Button
            label={migrating ? "Migrating…" : "Confirm migration"}
            disabled={migrating}
            onPress={doMigrate}
          />
          <Button label="Cancel" variant="text" disabled={migrating} onPress={() => setSelected(null)} />
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(item, index) => `${item.mangaId}-${index}`}
        numColumns={3}
        columnWrapperStyle={{ gap: GAP }}
        contentContainerStyle={{ padding: PADDING, gap: GAP, flexGrow: 1 }}
        renderItem={({ item }) => (
          <MangaCard
            tile={item}
            width={cardWidth}
            onPress={() => {
              setSelected(item);
              setError(null);
            }}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={theme.primary} style={{ marginTop: 40 }} />
          ) : (
            <EmptyState
              icon="search-outline"
              title="Search the target source"
              subtitle="Type a query above to find the matching title."
            />
          )
        }
      />
    </View>
  );
}
