import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button, Chip, IconButton, SectionLabel } from "@/components/ui/MD3";
import { Cover } from "@/components/ui/Cover";
import { Ripple } from "@/components/ui/Ripple";
import { ChapterRow } from "@/components/ChapterRow";
import { SelectionBar } from "@/components/SelectionBar";
import { ChapterManageSheet, type ChapterSortKey, type ChapterDisplay } from "@/components/ChapterManageSheet";
import { LibraryService } from "@/services/LibraryService";
import { DownloadService } from "@/services/DownloadService";
import { progressRepository } from "@/db/repositories/progressRepository";
import { providerRegistry } from "@/services/providerRegistry";
import type { ChapterInfo, ChapterProgress, DownloadEntry, MangaDetails } from "@/domain/models";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS, TOUCH, alpha, isThemeDark } from "@/theme/theme";
import { toTimestampMs } from "@/utils/dateTime";

export default function MangaDetailsScreen() {
  const { id, sourceId } = useLocalSearchParams<{ id: string; sourceId: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const [details, setDetails] = useState<MangaDetails | null>(null);
  const [inLibrary, setInLibrary] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, ChapterProgress>>({});
  const [downloadMap, setDownloadMap] = useState<Record<string, DownloadEntry>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Non-blocking message shown when a background refresh fails while cached
   *  data is already on screen (so the failure is never silently swallowed). */
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [manageVisible, setManageVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [filters, setFilters] = useState({ downloaded: false, unread: false });
  const [sortKey, setSortKey] = useState<ChapterSortKey>("newest");
  const [display, setDisplay] = useState<ChapterDisplay>({ sourceTitle: true, chapterNumber: false });

  const loadDownloads = useCallback(async () => {
    if (!id || !sourceId) return;
    const downloads = await DownloadService.getForManga(sourceId, id);
    setDownloadMap(Object.fromEntries(downloads.map((d) => [d.chapterId, d])));
  }, [id, sourceId]);

  // Capture non-manga local state (library membership, progress, downloads).
  // These are cheap DB reads and never block on the network.
  const loadLocal = useCallback(async () => {
    if (!id || !sourceId) return;
    const [isFav, progresses] = await Promise.all([
      LibraryService.isInLibrary(sourceId, id),
      progressRepository.getAllForManga(sourceId, id),
    ]);
    setInLibrary(isFav);
    setProgressMap(Object.fromEntries(progresses.map((p) => [p.chapterId, p])));
    await loadDownloads();
  }, [id, sourceId, loadDownloads]);

  /** Remote refresh of details + chapters + local state. Puts the result in
   * the local snapshot cache so subsequent opens are instant.
   *
   * `background: true` means cached data is already rendered — a failure
   * here must NEVER replace that content with the full-screen error state;
   * it only surfaces the non-blocking `refreshNotice` banner. Without this
   * distinction, a background refresh failure (temporary network blip,
   * source down) would blow away a title the user already has open. */
  const refresh = useCallback(
    async (background = false): Promise<boolean> => {
      if (!id || !sourceId) return false;
      setRefreshing(true);
      try {
        const d = await LibraryService.getMangaDetails(sourceId, id);
        setDetails(d);
        await loadLocal();
        setError(null);
        setRefreshNotice(null);
        return true;
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : "Failed to load title";
        if (!background) setError(msg);
        setRefreshNotice(msg);
        return false;
      } finally {
        setRefreshing(false);
      }
    },
    [id, sourceId, loadLocal]
  );

  /** Initial open: render cached/local data immediately, then refresh
   * remotely in the background so the user is never blocked on the network. */
  const load = useCallback(async () => {
    if (!id || !sourceId) return;
    setLoading(true);
    setError(null);
    setRefreshNotice(null);
    try {
      const cached = await LibraryService.getMangaDetailsCached(sourceId, id);
      await loadLocal();
      if (cached) {
        // Render cached data immediately; refresh keeps it fresh in background.
        setDetails(cached);
        setLoading(false);
        refresh(true);
      } else {
        // Nothing cached — loadLocal already set progress/state, so the screen
        // renders the shell while the network fetch populates details.
        await refresh(false);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Failed to load title");
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, sourceId, loadLocal]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = DownloadService.subscribe(() => loadDownloads());
    return unsub;
  }, [loadDownloads]);

  const toggleLibrary = async () => {
    if (!details) return;
    if (inLibrary) {
      await LibraryService.removeFromLibrary(details.sourceId, details.mangaId);
    } else {
      await LibraryService.addToLibrary(details);
    }
    setInLibrary(!inLibrary);
  };

  const goToMigrate = useCallback(() => {
    if (id && sourceId && details) {
      router.push({
        pathname: "/migrate",
        params: { fromSourceId: sourceId, fromMangaId: id, fromTitle: details.title },
      });
    }
  }, [id, sourceId, details, router]);

  const sourceName = useMemo(
    () => providerRegistry.listSources().find((s) => s.id === (sourceId ?? ""))?.name ?? sourceId ?? "",
    [sourceId]
  );

  const openChapter = (chapter: ChapterInfo) => {
    router.push({
      pathname: "/reader/[chapterId]",
      params: {
        chapterId: chapter.chapterId,
        sourceId: chapter.sourceId,
        mangaId: chapter.mangaId,
        chapterNumber: String(chapter.chapterNumber),
        totalChapters: String(details?.chapters.length ?? 0),
      },
    });
  };

  // ---------- selection ----------

  const toggleSelected = useCallback((chapterId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      if (next.size === 0) setSelecting(false);
      return next;
    });
  }, []);

  const handleRowPress = useCallback(
    (chapter: ChapterInfo) => {
      if (selecting) toggleSelected(chapter.chapterId);
      else openChapter(chapter);
    },
    [selecting, toggleSelected]
  );

  const handleRowLongPress = useCallback(
    (chapter: ChapterInfo) => {
      setSelecting(true);
      toggleSelected(chapter.chapterId);
    },
    [toggleSelected]
  );

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    if (!details) return;
    setSelecting(true);
    setSelectedIds(new Set(details.chapters.map((c) => c.chapterId)));
  }, [details]);

  const selectAllExcept = useCallback(() => {
    if (!details) return;
    setSelectedIds((prev) => {
      const next = new Set(details.chapters.map((c) => c.chapterId).filter((id) => !prev.has(id)));
      if (next.size === 0) setSelecting(false);
      return next;
    });
  }, [details]);

  const canSelectBetween = selectedIds.size === 2;

  const selectBetween = useCallback(() => {
    if (!details || selectedIds.size !== 2) return;
    const ids = Array.from(selectedIds);
    const indices = details.chapters
      .map((c, i) => (ids.includes(c.chapterId) ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    const [start, end] = indices;
    const range = details.chapters.slice(start, end + 1).map((c) => c.chapterId);
    setSelectedIds(new Set(range));
  }, [details, selectedIds]);

  const selectedChapters = useMemo(
    () => details?.chapters.filter((c) => selectedIds.has(c.chapterId)) ?? [],
    [details, selectedIds]
  );

  /** Chapter tracks/next-unread progress for "Resume reading" — kept a
   * separate concern from `visibleChapters` (which applies filters/sort
   * for display) since resume always reasons over the FULL chapter list
   * regardless of what the user is currently filtering/sorting by. */
  const resumeTarget = useMemo<ChapterInfo | null>(() => {
    if (!details) return null;
    const chapters = details.chapters; // newest-first, matching the source's own order
    let inProgress: ChapterInfo | null = null;
    let inProgressUpdatedAt = "";
    for (const c of chapters) {
      const p = progressMap[c.chapterId];
      if (p && !p.isRead && p.lastPageIndex > 0) {
        if (!inProgress || p.updatedAt > inProgressUpdatedAt) {
          inProgress = c;
          inProgressUpdatedAt = p.updatedAt;
        }
      }
    }
    if (inProgress) return inProgress;

    const oldestFirst = [...chapters].reverse();
    let lastReadIndex = -1;
    oldestFirst.forEach((c, i) => {
      if (progressMap[c.chapterId]?.isRead) lastReadIndex = i;
    });
    if (lastReadIndex >= 0 && lastReadIndex + 1 < oldestFirst.length) {
      return oldestFirst[lastReadIndex + 1];
    }
    return null;
  }, [details, progressMap]);

  const primaryChapter = resumeTarget ?? details?.chapters[details.chapters.length - 1] ?? null;
  const primaryLabel = resumeTarget ? "Resume reading" : "Start reading";

  const visibleChapters = useMemo(() => {
    if (!details) return [];
    let list = details.chapters;
    if (filters.downloaded) list = list.filter((c) => downloadMap[c.chapterId]?.status === "completed" || downloadMap[c.chapterId]?.status === "downloading");
    if (filters.unread) {
      list = list.filter((c) => {
        const p = progressMap[c.chapterId];
        return !p || (!p.isRead && p.lastPageIndex <= 0);
      });
    }
    const sorted = [...list];
    switch (sortKey) {
      case "numberAsc":
        sorted.sort((a, b) => a.chapterNumber - b.chapterNumber);
        break;
      case "numberDesc":
        sorted.sort((a, b) => b.chapterNumber - a.chapterNumber);
        break;
      case "oldest":
        sorted.sort((a, b) => toTimestampMs(a.publishedAt) - toTimestampMs(b.publishedAt));
        break;
      case "newest":
      default:
        sorted.sort((a, b) => toTimestampMs(b.publishedAt) - toTimestampMs(a.publishedAt));
        break;
    }
    return sorted;
  }, [details, filters, sortKey, downloadMap, progressMap]);

  const handleFilterChange = useCallback((key: string, value: boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSortChange = useCallback((key: ChapterSortKey) => setSortKey(key), []);

  const handleDisplayChange = useCallback((key: keyof ChapterDisplay, value: boolean) => {
    setDisplay((prev) => ({ ...prev, [key]: value }));
  }, []);

  const manageDirty = filters.downloaded || filters.unread || sortKey !== "newest";
  const resetManage = useCallback(() => {
    setFilters({ downloaded: false, unread: false });
    setSortKey("newest");
  }, []);

  const bulkDownload = useCallback(async () => {
    if (!selectedChapters.length) return;
    await DownloadService.enqueueChapters(selectedChapters);
    exitSelection();
  }, [selectedChapters, exitSelection]);

  const bulkRemoveDownload = useCallback(async () => {
    if (!sourceId || !id) return;
    await Promise.all(
      selectedChapters.map((c) => DownloadService.removeByChapter(sourceId, id, c.chapterId))
    );
    exitSelection();
  }, [sourceId, id, selectedChapters, exitSelection]);

  const bulkMarkRead = useCallback(async () => {
    if (!sourceId || !id) return;
    await Promise.all(
      selectedChapters.map((c) => progressRepository.markRead(sourceId, id, c.chapterId, 1))
    );
    const progresses = await progressRepository.getAllForManga(sourceId, id);
    setProgressMap(Object.fromEntries(progresses.map((p) => [p.chapterId, p])));
    exitSelection();
  }, [sourceId, id, selectedChapters, exitSelection]);

  const bulkMarkUnread = useCallback(async () => {
    if (!sourceId || !id) return;
    await Promise.all(
      selectedChapters.map((c) => progressRepository.markUnread(sourceId, id, c.chapterId))
    );
    const progresses = await progressRepository.getAllForManga(sourceId, id);
    setProgressMap(Object.fromEntries(progresses.map((p) => [p.chapterId, p])));
    exitSelection();
  }, [sourceId, id, selectedChapters, exitSelection]);

  if (loading) {
    return <View style={[styles.center, { backgroundColor: theme.background }]} />;
  }

  if (error || !details) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700", marginBottom: 8 }}>
          Couldn't load this title
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", paddingHorizontal: 32 }}>
          {error ?? "Unknown error"}
        </Text>
        <Button label="Try again" variant="tonal" onPress={load} style={{ marginTop: 16 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {selecting ? (
        <SelectionBar
          count={selectedIds.size}
          total={details.chapters.length}
          topInset={insets.top}
          onClose={exitSelection}
          onSelectAll={selectAll}
          onSelectAllExcept={selectAllExcept}
          onSelectBetween={selectBetween}
          canSelectBetween={canSelectBetween}
          onDownload={bulkDownload}
          onRemoveDownload={bulkRemoveDownload}
          onMarkRead={bulkMarkRead}
          onMarkUnread={bulkMarkUnread}
        />
      ) : null}

      <FlatList
        style={[styles.container, { backgroundColor: theme.background }]}
        data={visibleChapters}
        keyExtractor={(chapter) => chapter.chapterId}
        extraData={{ progressMap, downloadMap, selecting, selectedIds, refreshNotice }}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <View>
            <View style={{ height: insets.top + 8 }} />
            {refreshNotice ? (
              <View
                style={{
                  marginHorizontal: 16,
                  marginBottom: 8,
                  padding: 10,
                  borderRadius: RADIUS.md,
                  backgroundColor: theme.surface2,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text style={{ color: theme.error, fontSize: 12.5, flex: 1 }}>
                  Couldn't refresh this title: {refreshNotice}
                </Text>
                <Button label="Retry" variant="tonal" onPress={() => refresh(true)} />
              </View>
            ) : null}
            {/* Hero panel: larger cover integrated into a tinted backdrop
                rather than a small standalone thumbnail. The tint is a
                flat, cheap alpha-blended color derived from the theme
                (not per-image color extraction or a blur view) — stays
                fast on Android and never needs the cover to finish
                decoding before the panel can paint. */}
            <View
              style={{
                backgroundColor: alpha(theme.primary, isThemeDark(theme) ? 0.14 : 0.08),
                paddingHorizontal: 16,
                paddingTop: 4,
                paddingBottom: 18,
                borderBottomLeftRadius: RADIUS.xl,
                borderBottomRightRadius: RADIUS.xl,
              }}
            >
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View
                  style={{
                    width: 128,
                    height: 192,
                    borderRadius: RADIUS.lg,
                    overflow: "hidden",
                    backgroundColor: theme.surface2,
                    elevation: 4,
                  }}
                >
                  <Cover uri={details.coverUrl} title={details.title} width={128} height={192} radius={RADIUS.lg} />
                </View>
                <View style={{ flex: 1, minWidth: 0, justifyContent: "flex-end", paddingBottom: 2 }}>
                  <Text
                    style={{ color: theme.text, fontSize: 23, fontWeight: "800", letterSpacing: -0.3, lineHeight: 27 }}
                  >
                    {details.title}
                  </Text>
                  {details.altTitles.length > 0 ? (
                    <Text numberOfLines={2} style={{ color: theme.textMuted, fontSize: 12, marginTop: 5, lineHeight: 16 }}>
                      {details.altTitles.join(" • ")}
                    </Text>
                  ) : null}

                  {details.author || details.artist ? (
                    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 6 }}>
                      <Ionicons name="person-outline" size={13} color={theme.textMuted} />
                      <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12.5, fontWeight: "600", flex: 1 }}>
                        {[details.author, details.artist && details.artist !== details.author ? details.artist : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 6 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 9,
                        paddingVertical: 4,
                        borderRadius: RADIUS.pill,
                        backgroundColor: theme.surface2,
                      }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: details.status === "ongoing" ? theme.primary : theme.textMuted,
                        }}
                      />
                      <Text style={{ color: theme.text, fontSize: 11.5, fontWeight: "700", textTransform: "capitalize" }}>
                        {details.status}
                      </Text>
                    </View>
                    {sourceName ? (
                      <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 11, fontWeight: "600", flexShrink: 1 }}>
                        {sourceName}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Library heart + secondary actions, directly accessible —
                  Migrate/Refresh no longer live inside an overflow sheet. */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 }}>
                <View style={{ borderRadius: RADIUS.pill, overflow: "hidden" }}>
                  <Ripple
                    onPress={toggleLibrary}
                    borderless
                    accessibilityLabel={inLibrary ? "Remove from library" : "Add to library"}
                  >
                    <View
                      style={{
                        width: TOUCH,
                        height: TOUCH,
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: RADIUS.pill,
                        backgroundColor: inLibrary ? alpha(theme.primary, 0.16) : theme.surface2,
                      }}
                    >
                      <Ionicons
                        name={inLibrary ? "heart" : "heart-outline"}
                        size={22}
                        color={inLibrary ? theme.primary : theme.text}
                      />
                    </View>
                  </Ripple>
                </View>
                <Button
                  label="Migrate"
                  icon={<Ionicons name="swap-horizontal-outline" size={16} color={theme.onSecondaryContainer} />}
                  variant="tonal"
                  onPress={goToMigrate}
                  style={{ flex: 1 }}
                />
                <Button
                  label={refreshing ? "Refreshing…" : "Refresh"}
                  icon={<Ionicons name="refresh-outline" size={16} color={theme.onSecondaryContainer} />}
                  variant="tonal"
                  onPress={() => refresh(true)}
                  disabled={refreshing}
                  style={{ flex: 1 }}
                />
              </View>

              <View style={{ marginTop: 14 }}>
                <Button
                  label={primaryLabel}
                  onPress={() => primaryChapter && openChapter(primaryChapter)}
                  disabled={!primaryChapter}
                />
              </View>
            </View>

            {details.genres.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingTop: 14 }}>
                {details.genres.map((g) => (
                  <Chip key={g} label={g} />
                ))}
              </View>
            ) : null}

            {details.description ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <SectionLabel>About</SectionLabel>
                <Text
                  numberOfLines={descExpanded ? undefined : 5}
                  style={{ color: theme.text, fontSize: 14.5, lineHeight: 22, marginTop: 8 }}
                >
                  {details.description}
                </Text>
                <Ripple onPress={() => setDescExpanded((v) => !v)}>
                  <Text style={{ color: theme.primary, fontSize: 12.5, fontWeight: "700", marginTop: 6, paddingVertical: 4 }}>
                    {descExpanded ? "Show less" : "Show more"}
                  </Text>
                </Ripple>
              </View>
            ) : null}

            <View
              style={{
                paddingHorizontal: 16,
                marginTop: 20,
                marginBottom: 6,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <SectionLabel>
                {visibleChapters.length === details.chapters.length
                  ? `${details.chapters.length} chapters`
                  : `${visibleChapters.length} of ${details.chapters.length} chapters`}
              </SectionLabel>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                <IconButton
                  icon="options-outline"
                  size={18}
                  accessibilityLabel="Manage chapters"
                  onPress={() => setManageVisible(true)}
                />
              </View>
            </View>
          </View>
        }
        renderItem={({ item: chapter }) => {
          const progress = progressMap[chapter.chapterId];
          const ratio =
            progress && progress.pageCount > 0
              ? (progress.lastPageIndex + 1) / progress.pageCount
              : progress?.isRead
              ? 1
              : 0;
          const download = downloadMap[chapter.chapterId];
          return (
            <ChapterRow
              key={chapter.chapterId}
              chapter={chapter}
              progress={ratio}
              metadata={
                display.sourceTitle && chapter.scanlator
                  ? chapter.scanlator
                  : display.chapterNumber
                  ? String(chapter.chapterNumber)
                  : chapter.scanlator
              }
              onPress={() => handleRowPress(chapter)}
              onLongPress={() => handleRowLongPress(chapter)}
              selecting={selecting}
              selected={selectedIds.has(chapter.chapterId)}
              downloadStatus={download?.status}
              onDownload={() => DownloadService.enqueueChapter(chapter)}
              onRemoveDownload={() =>
                sourceId && id && DownloadService.removeByChapter(sourceId, id, chapter.chapterId)
              }
            />
          );
        }}
      />

      <ChapterManageSheet
        visible={manageVisible}
        onDismiss={() => setManageVisible(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        sortKey={sortKey}
        onSortChange={handleSortChange}
        display={display}
        onDisplayChange={handleDisplayChange}
        onReset={resetManage}
        canReset={manageDirty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});