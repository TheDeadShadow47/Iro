import React, { memo, useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image as RNImage, Pressable, StyleSheet, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { getOrCreateTiles, planTiling, type ImageTile } from "@/utils/imageTiling";

interface ResolvedPage {
  uri: string;
  headers?: Record<string, string>;
}

interface Props {
  page: ResolvedPage;
  width: number;
  /** In webtoon mode (default): a best-guess initial height from a previous
   * measurement, used only until the fresh measurement below resolves —
   * the final container height always adapts to the image's real aspect
   * ratio. In `fixedContainer` mode (paged reader): this IS the container
   * height, always — the viewport is a fixed screen size the image must
   * letterbox within via `contentFit`, never resize to match. */
  height?: number;
  /** Paged mode: the container is a fixed viewport (`width`x`height`, the
   * screen size) that never changes size regardless of the image's own
   * aspect ratio — `contentFit="contain"` letterboxes within it, matching
   * how a fixed-page reader is supposed to behave. Webtoon mode must NOT
   * set this: there the container height IS derived from the image's
   * natural aspect ratio (continuous-scroll long-strip rendering). */
  fixedContainer?: boolean;
  aspectRatio?: number;
  backgroundColor?: string;
  resizeMode?: "contain" | "cover" | "fill" | "none" | "scale-down";
  /** Reports the page's natural height (scaled to `width`) once known.
   * Not called in `fixedContainer` mode (the container never needs it). */
  onLoad?: (naturalHeight: number) => void;
}

type DisplayTile = ImageTile & { displayHeight: number };

type Stage =
  | { kind: "measuring" }
  | { kind: "measure-failed" }
  | { kind: "single"; height: number; width: number }
  | { kind: "tiled"; tiles: DisplayTile[]; totalHeight: number; totalWidth: number };

/**
 * Comic page image. Two problems this solves, confirmed against real
 * Android behavior:
 *
 * 1. BLUR: RN/native image views decode a bitmap sized to the view bounds
 *    at first layout, not the image's true resolution. Mounting the real
 *    image inside a guessed placeholder means the initial decode targets
 *    wrong bounds, then the container resizes but the already-decoded
 *    low-res bitmap just stretches. Fixed by measuring real dimensions
 *    FIRST and not mounting the image until the correct size is known.
 *
 * 2. CRASH on long-strips: Android's Canvas refuses to draw bitmaps over
 *    ~25M pixels, and GPU textures are commonly capped at ~4096px. A raw
 *    webtoon segment can be 800x20000+. Fixed by slicing into safe
 *    vertical tiles via expo-image-manipulator (see utils/imageTiling.ts).
 *
 * Uses expo-image rather than RN core Image for a more predictable
 * decode/cache pipeline, but the measure-before-mount architecture
 * applies regardless — expo-image also resizes its decode to the given
 * container bounds.
 */
export const ReaderPageImage = memo(function ReaderPageImage({
  page,
  width,
  height: knownHeight,
  fixedContainer = false,
  aspectRatio,
  backgroundColor = "#000",
  resizeMode = "contain",
  onLoad,
}: Props) {
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "measuring" });

  const onError = useCallback(() => setFailed(true), []);
  const retry = useCallback(() => {
    setFailed(false);
    setLoaded(false);
    setStage({ kind: "measuring" });
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStage({ kind: "measuring" });
    setLoaded(false);

    async function resolve(naturalW: number, naturalH: number) {
      // Fixed viewport (paged mode): scale to CONTAIN within the box on
      // whichever axis is tighter, same math `contentFit="contain"` does
      // internally — needed here too because tiles (below) can't rely on
      // contentFit themselves. Webtoon mode: always fill the width exactly,
      // height follows (that's what makes it a continuous vertical strip).
      const scale =
        fixedContainer && knownHeight
          ? Math.min(width / naturalW, knownHeight / naturalH)
          : width / naturalW;
      const displayHeight = naturalH * scale;
      const displayWidth = naturalW * scale;
      if (!fixedContainer) onLoad?.(displayHeight);

      const plan = planTiling(naturalW, naturalH);
      if (!plan.needsTiling) {
        if (!cancelled) setStage({ kind: "single", height: displayHeight, width: displayWidth });
        return;
      }
      try {
        const tiles = await getOrCreateTiles(
          page.uri,
          page.headers,
          naturalW,
          naturalH,
          plan,
          retryKey > 0
        );
        if (cancelled) return;
        setStage({
          kind: "tiled",
          tiles: tiles.map((t) => ({ ...t, displayHeight: t.heightPx * scale })),
          totalHeight: displayHeight,
          totalWidth: displayWidth,
        });
      } catch {
        // Tiling failed (disk full, manipulator error, etc.) — fall back to
        // a single-image render rather than leaving the page blank. Only
        // reachable for the rare oversized-page case; the risk of the
        // original blur/crash symptom returning here is an accepted,
        // narrow edge case rather than blocking the page entirely.
        if (!cancelled) setStage({ kind: "single", height: displayHeight, width: displayWidth });
      }
    }

    const onSize = (w: number, h: number) => {
      if (cancelled || !w || !h) return;
      resolve(w, h);
    };
    const onFail = () => {
      if (!cancelled) setStage({ kind: "measure-failed" });
    };

    if (page.headers && Object.keys(page.headers).length > 0) {
      RNImage.getSizeWithHeaders(page.uri, page.headers, onSize, onFail);
    } else {
      RNImage.getSize(page.uri, onSize, onFail);
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.uri, width, fixedContainer, knownHeight, retryKey]);

  // Fixed mode: the OUTER container never changes size — it's the screen
  // viewport, always. Webtoon mode: the container adapts to the image's
  // real aspect ratio once known (falling back to a guess/placeholder
  // until measurement resolves).
  const fallbackHeight = knownHeight ?? (aspectRatio ? width / aspectRatio : width * 1.4);
  const containerHeight = fixedContainer
    ? knownHeight ?? fallbackHeight
    : stage.kind === "single"
    ? stage.height
    : stage.kind === "tiled"
    ? stage.totalHeight
    : fallbackHeight;
  const containerStyle = { width, height: containerHeight };

  if (failed) {
    return (
      <View style={[containerStyle, styles.failed, { backgroundColor }]}>
        <Text style={styles.failedText}>This page failed to load</Text>
        <Pressable style={styles.retryBtn} onPress={retry}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[containerStyle, styles.center, { backgroundColor }]}>
      {!loaded && stage.kind !== "tiled" ? (
        <View style={[StyleSheet.absoluteFill, styles.placeholder, { backgroundColor }]}>
          <ActivityIndicator color="#777" />
        </View>
      ) : null}

      {stage.kind === "single" || stage.kind === "measure-failed" ? (
        <ExpoImage
          key={`${page.uri}-${retryKey}`}
          source={{ uri: page.uri, headers: page.headers }}
          style={[containerStyle, loaded ? undefined : styles.hidden]}
          contentFit={resizeMode}
          transition={null}
          cachePolicy="disk"
          onLoad={(e) => {
            setLoaded(true);
            // Only source of truth if the size-probe never resolved
            // (measure-failed path) — otherwise the "single" stage's
            // height was already computed from a successful measurement.
            if (stage.kind === "measure-failed" && e.source.width && e.source.height && !fixedContainer) {
              onLoad?.((e.source.height / e.source.width) * width);
            }
          }}
          onError={onError}
        />
      ) : null}

      {stage.kind === "tiled" ? (
        // Wrapped in its own box sized to the SCALED (not raw container)
        // width/height and centered in the outer container (a no-op in
        // webtoon mode, where the stack width always equals the full
        // container width by construction — only matters for
        // `fixedContainer`/paged mode, where a "contain" scale can leave
        // the stack narrower or shorter than the fixed viewport).
        <View style={{ width: stage.totalWidth, height: stage.totalHeight }}>
          {stage.tiles.map((tile) => (
            <ExpoImage
              key={`${tile.uri}-${retryKey}`}
              source={{ uri: tile.uri }}
              style={{ width: stage.totalWidth, height: tile.displayHeight }}
              contentFit="fill" // tile IS the exact crop at the exact scale; no letterboxing wanted between tiles
              transition={null}
              cachePolicy="disk"
              onError={onError}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  hidden: { opacity: 0 },
  failed: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 160,
  },
  failedText: { color: "#999", fontSize: 13.5, marginBottom: 12 },
  retryBtn: {
    borderWidth: 1,
    borderColor: "#666",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  retryText: { color: "#ddd", fontWeight: "700", fontSize: 13 },
});
