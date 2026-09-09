import React, { useCallback, useMemo, useRef } from "react";
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

  const toLogicalIndex = useCallback(
    (visualIndex: number) => (rtl ? pages.length - 1 - visualIndex : visualIndex),
    [rtl, pages.length]
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        onPageChange(toLogicalIndex(viewableItems[0].index));
      }
    }
  ).current;

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
      initialScrollIndex={rtl ? pages.length - 1 - initialIndex : initialIndex}
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
