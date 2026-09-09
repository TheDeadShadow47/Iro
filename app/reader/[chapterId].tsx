import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ExpoKeepAwake from "expo-keep-awake";
import { Ionicons } from "@expo/vector-icons";
import { ReaderPagedView } from "@/components/ReaderPagedView";
import { ReaderWebtoonView } from "@/components/ReaderWebtoonView";
import { ReaderService } from "@/services/ReaderService";
import { DownloadService } from "@/services/DownloadService";
import { useReaderSettingsStore } from "@/state/readerSettingsStore";
import { useAppTheme } from "@/theme/useAppTheme";

type ResolvedPage = { uri: string; headers?: Record<string, string> };

const MODE_PILLS = [
  { id: "paged-rtl" as const, label: "RTL" },
  { id: "paged-ltr" as const, label: "LTR" },
  { id: "webtoon" as const, label: "Webtoon" },
];

const CONTROLS_AUTO_HIDE_MS = 3500;

export default function ReaderScreen() {
  const params = useLocalSearchParams<{
    chapterId: string;
    sourceId: string;
    mangaId: string;
    chapterNumber: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const settings = useReaderSettingsStore();
  const [pages, setPages] = useState<ResolvedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chapterNumber = Number(params.chapterNumber ?? 0);

  const hideControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible(false);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(hideControls, CONTROLS_AUTO_HIDE_MS);
  }, [hideControls]);

  const toggleControls = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setControlsVisible((v) => {
      const next = !v;
      if (next) {
        hideTimer.current = setTimeout(hideControls, CONTROLS_AUTO_HIDE_MS);
      }
      return next;
    });
  }, [hideControls]);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Deliberate single tap toggles the reader controls. Wrapping the scroll
  // view in a <Pressable> made scroll gestures get misread as taps (controls
  // flashing during scroll, and the scroll "sticking"). Using a dedicated
  // RNGH Tap gesture keeps the two fully independent: a tap without movement
  // toggles controls; any movement cancels the tap and the underlying
  // FlashList/FlatList scroll proceeds untouched.
  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDuration(250)
        .maxDistance(10)
        .onEnd((_e, success) => {
          if (success) runOnJS(toggleControls)();
        }),
    [toggleControls]
  );

  useEffect(() => {
    if (settings.keepScreenOn) {
      ExpoKeepAwake.activateKeepAwakeAsync("reader");
    }
    return () => {
      ExpoKeepAwake.deactivateKeepAwake("reader");
    };
  }, [settings.keepScreenOn]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const resolved = await ReaderService.getResolvedPages(
          params.sourceId,
          params.mangaId,
          params.chapterId
        );
        if (cancelled) return;
        setPages(resolved);

        const existingProgress = await ReaderService.getProgress(
          params.sourceId,
          params.mangaId,
          params.chapterId
        );
        setCurrentIndex(existingProgress?.lastPageIndex ?? 0);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to load chapter");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [params.sourceId, params.mangaId, params.chapterId]);

  useEffect(() => {
    if (pages.length === 0) return;
    if (!params.sourceId || !params.mangaId || !params.chapterId) return;
    ReaderService.reportPageViewed(
      params.sourceId,
      params.mangaId,
      params.chapterId,
      chapterNumber,
      currentIndex,
      pages.length
    );
  }, [currentIndex, pages.length]);

  const backgroundColor = useMemo(() => {
    switch (settings.backgroundColor) {
      case "white":
        return "#ffffff";
      case "gray":
        return "#3a3d45";
      default:
        return "#000000";
    }
  }, [settings.backgroundColor]);

  const dcDark = backgroundColor !== "#ffffff";

  const handleDownload = async () => {
    await DownloadService.enqueueChapter(
      {
        sourceId: params.sourceId,
        mangaId: params.mangaId,
        chapterId: params.chapterId,
        chapterNumber,
        title: `Chapter ${chapterNumber}`,
        publishedAt: new Date().toISOString(),
        language: "en",
      },
      pages.length
    );
    showControls();
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor }]}>
        <StatusBar style={dcDark ? "light" : "dark"} />
        <ActivityIndicator size="large" color="#888" />
        <Text style={{ color: "#aaa", marginTop: 14, fontSize: 13 }}>Loading chapter…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor }]}>
        <StatusBar style={dcDark ? "light" : "dark"} />
        <Ionicons name="alert-circle-outline" size={40} color="#ff8a9b" />
        <Text style={{ color: "#ff8a9b", marginTop: 14, paddingHorizontal: 32, textAlign: "center", fontSize: 13.5 }}>
          {error}
        </Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={{ color: "#111", fontWeight: "800", fontSize: 14 }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <StatusBar hidden={!controlsVisible} style={dcDark ? "light" : "dark"} />

      {/* Tap-to-toggle WRAPS the reader content instead of overlaying it as
          a separate absolute-fill sibling on top. An overlay sibling placed
          after (i.e. visually on top of) the FlashList/FlatList intercepts
          every touch — including scroll drags — before the scrollable ever
          sees them, which is what caused controls to flash mid-scroll and
          scrolling to feel "stuck": RNGH's tap recognizer held the touch
          stream until it decided the gesture had failed. Making the
          GestureDetector an ANCESTOR of the scrollable (not an occluding
          sibling) restores normal Android touch-dispatch cooperation: the
          descendant FlashList/FlatList can claim the gesture arena for any
          real pan/scroll, while our Tap gesture only fires for a genuine
          tap-without-movement. */}
      <GestureDetector gesture={tapGesture}>
        <View style={styles.container} collapsable={false}>
          {settings.mode === "webtoon" ? (
            <ReaderWebtoonView
              pages={pages}
              backgroundColor={backgroundColor}
              onPageChange={setCurrentIndex}
            />
          ) : (
            <ReaderPagedView
              pages={pages}
              initialIndex={currentIndex}
              rtl={settings.mode === "paged-rtl"}
              backgroundColor={backgroundColor}
              onPageChange={setCurrentIndex}
            />
          )}
        </View>
      </GestureDetector>

      {controlsVisible ? (
        <>
          <View
            style={[styles.topBar, { paddingTop: insets.top + 8 }]}
            pointerEvents="box-none"
          >
            <Pressable style={styles.iconBtn} onPress={() => router.back()} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </Pressable>
            <Text style={styles.topBarTitle} numberOfLines={1}>
              Chapter {chapterNumber} · {currentIndex + 1}/{pages.length}
            </Text>
            <Pressable style={styles.iconBtn} onPress={handleDownload} android_ripple={{ color: "rgba(255,255,255,0.2)" }}>
              <Ionicons name="download-outline" size={22} color="#fff" />
            </Pressable>
          </View>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
            {MODE_PILLS.map((mode) => (
              <Pressable
                key={mode.id}
                style={[
                  styles.modeBtn,
                  settings.mode === mode.id && { backgroundColor: theme.primary },
                ]}
                onPress={() => {
                  settings.setMode(mode.id);
                  showControls();
                }}
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    settings.mode === mode.id && { color: theme.onPrimary, fontWeight: "800" },
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  backBtn: {
    backgroundColor: "#eee",
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 24,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "rgba(10,10,12,0.85)",
  },
  topBarTitle: { color: "#fff", fontSize: 12.5, flex: 1, textAlign: "center", fontWeight: "600" },
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: "rgba(10,10,12,0.85)",
  },
  modeBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  modeBtnText: { color: "#ddd", fontSize: 13, fontWeight: "700" },
});
