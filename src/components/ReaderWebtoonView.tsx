import React, { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View, ViewToken, useWindowDimensions } from "react-native";
import { FlashList, ListRenderItemInfo } from "@shopify/flash-list";
import { ReaderPageImage } from "@/components/ReaderPageImage";

interface ResolvedPage {
  uri: string;
  headers?: Record<string, string>;
}

interface Props {
  pages: ResolvedPage[];
  backgroundColor: string;
  onPageChange: (index: number) => void;
}

/**
 * Continuous vertical scroll with FlashList. Image heights are learned from
 * natural onLoad dimensions and cached in a single state object passed as
 * `extraData`, so FlashList can re-measure without remounting rows.
 * Images render at full screen width (full source quality); only the
 * FlashList window is virtualized, so memory stays bounded without ever
 * downscaling page art.
 */
export function ReaderWebtoonView({ pages, backgroundColor, onPageChange }: Props) {
  const { width } = useWindowDimensions();
  const [heights, setHeights] = useState<Record<number, number>>({});

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        onPageChange(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 40 }),
    []
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ResolvedPage>) => (
      <ReaderPageImage
        page={item}
        width={width}
        // Height is undefined until measured — ReaderPageImage resolves
        // real dimensions itself before mounting the actual <Image>,
        // preventing Android from decoding at the wrong resolution.
        height={heights[index]}
        backgroundColor={backgroundColor}
        resizeMode="contain"
        onLoad={(naturalHeight: number) => {
          setHeights((prev) =>
            prev[index] === naturalHeight ? prev : { ...prev, [index]: naturalHeight }
          );
        }}
      />
    ),
    [heights, width, backgroundColor]
  );

  return (
    <View style={[styles.fill, { backgroundColor }]}>
      <FlashList
        data={pages}
        keyExtractor={(_, index) => String(index)}
        renderItem={renderItem}
        extraData={heights}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        style={styles.fill}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
