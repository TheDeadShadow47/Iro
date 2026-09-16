import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  ViewToken,
  useWindowDimensions,
} from "react-native";
import { ReaderPageImage } from "@/components/ReaderPageImage";

interface ResolvedPage {
  uri: string;
  headers?: Record<string, string>;
}

interface Props {
  pages: ResolvedPage[];
  initialIndex?: number;
  rtl?: boolean;
  backgroundColor: string;
  onPageChange: (index: number) => void;
}

/**
 * One page per screen, horizontal swipe.
 *
 * RTL is implemented as a DATA-ORDER reversal, not a visual transform.
 * A previous `inverted` + `scaleX(-1)` approach left page art visibly
 * mirrored — a real reported bug. Reading direction must only affect
 * NAVIGATION ORDER, never image orientation.
 *
 * The data array is reversed for RTL so the first logical page lands on
 * the right (where RTL readers expect it) via normal LTR layout. Page
 * indices are translated between visual position and logical page number
 * at the two boundaries that need it: `initialScrollIndex` and
 * `onViewableItemsChanged`.
 */
export function ReaderPagedView({
  pages,
  initialIndex = 0,
  rtl = false,
  backgroundColor,
  onPageChange,
}: Props) {
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<ResolvedPage>>(null);

  const displayPages = useMemo(
    () => (rtl ? [...pages].reverse() : pages),
    [rtl, pages]
  );

  const toVisualIndex = useCallback(
    (logicalIndex: number) => (rtl ? pages.length - 1 - logicalIndex : logicalIndex),
    [rtl, pages.length]
  );

  // FlatList requires `onViewableItemsChanged` to stay referentially
  // stable for the life of the list (React Native warns/ignores changes
  // after mount), so it has to be captured once via `useRef(...).current`.
  // The catch: a callback captured that way closes over whatever `rtl`,
  // `pages.length`, and `onPageChange` were on the FIRST render only. If we
  // read those directly inside the frozen callback, every viewability
  // event after the first `rtl` toggle would translate the visual index
  // using the STALE reading direction — silently corrupting the reported
  // logical page (and therefore reading progress) from that point on. To
  // avoid that, the frozen callback reads from refs that are kept fresh
  // on every render instead of closing over the values themselves.
  const rtlRef = useRef(rtl);
  const pagesLengthRef = useRef(pages.length);
  const onPageChangeRef = useRef(onPageChange);
  const lastLogicalIndexRef = useRef(initialIndex);
  useEffect(() => {
    rtlRef.current = rtl;
    pagesLengthRef.current = pages.length;
    onPageChangeRef.current = onPageChange;
  });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        const visualIndex = viewableItems[0].index;
        const logicalIndex = rtlRef.current
          ? pagesLengthRef.current - 1 - visualIndex
          : visualIndex;
        lastLogicalIndexRef.current = logicalIndex;
        onPageChangeRef.current(logicalIndex);
      }
    }
  ).current;

  // Re-sync scroll position when the reading direction changes mid-chapter
  // (e.g. the user flips LTR -> RTL while on page 3). `initialScrollIndex`
  // only takes effect at mount, so without this the list would keep its
  // current PHYSICAL offset after `displayPages` reverses underneath it —
  // landing on a different, wrong logical page. This only fires on actual
  // direction changes, not on mount (where initialScrollIndex already
  // places the list correctly), and jumps with no animation so it reads as
  // "already there" rather than a visible page jump.
  const isFirstRender = useRef(true);
  useLayoutEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    // Depends only on `rtl` (not `pages.length`/`toVisualIndex`) so this
    // fires exactly when the reading direction actually changes — reading
    // the page count from the same ref the viewability handler keeps
    // fresh, rather than the reactive `pages.length`, avoids re-syncing
    // scroll on an unrelated page-count change (e.g. a different chapter's
    // data landing in this same component instance).
    if (pagesLengthRef.current === 0) return;
    const visualIndex = rtl
      ? pagesLengthRef.current - 1 - lastLogicalIndexRef.current
      : lastLogicalIndexRef.current;
    listRef.current?.scrollToIndex({ index: visualIndex, animated: false });
  }, [rtl]);

  const renderItem = useCallback(
    ({ item }: { item: ResolvedPage }) => (
      <View style={[styles.page, { width, height }]}>
        <ReaderPageImage
          page={item}
          width={width}
          height={height}
          fixedContainer
          backgroundColor={backgroundColor}
          resizeMode="contain"
        />
      </View>
    ),
    [width, height, backgroundColor]
  );

  return (
    <FlatList
      ref={listRef}
      data={displayPages}
      horizontal
      pagingEnabled
      initialScrollIndex={toVisualIndex(initialIndex)}
      keyExtractor={(_, i) => String(i)}
      getItemLayout={(_, index) => ({
        length: width,
        offset: width * index,
        index,
      })}
      renderItem={renderItem}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
      style={{ backgroundColor }}
      showsHorizontalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: "center",
    justifyContent: "center",
  },
});
