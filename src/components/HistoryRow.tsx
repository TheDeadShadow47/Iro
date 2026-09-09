import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";
import { ProgressBar } from "./ui/MD3";
import { Ripple } from "./ui/Ripple";
import { Cover } from "./ui/Cover";

export interface HistoryRowItem {
  key: string;
  coverUrl?: string;
  mangaTitle: string;
  chapterLabel: string;
  progress: number; // 0..1
  finished?: boolean;
  relativeTime: string;
  downloaded?: boolean;
  onPress: () => void;
}

/** Reading-history row: cover, title hierarchy, relative time + progress —
 * adapted from Honya's HistoryRow. */
export const HistoryRow = memo(function HistoryRow({ item }: { item: HistoryRowItem }) {
  const theme = useAppTheme();
  const progress = Math.min(Math.max(item.progress, 0), 1);
  const pct = Math.round(progress * 100);

  return (
    <Ripple onPress={item.onPress}>
      <View style={styles.row}>
        <Cover uri={item.coverUrl} title={item.mangaTitle} width={50} height={72} radius={RADIUS.md} />

        <View style={styles.body}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14.5, fontWeight: "700" }}>
            {item.mangaTitle}
          </Text>
          <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>
            {item.chapterLabel}
          </Text>

          <View style={styles.metaRow}>
            <Text style={{ color: theme.textMuted, fontSize: 11.5, fontWeight: "600" }}>{item.relativeTime}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11.5 }}> · </Text>
            <Text style={{ color: item.finished ? theme.textMuted : theme.primary, fontSize: 11.5, fontWeight: "700" }}>
              {item.finished ? "Finished" : progress > 0.02 ? `${pct}%` : "Started"}
            </Text>
            {item.downloaded ? (
              <>
                <Text style={{ color: theme.textMuted, fontSize: 11.5 }}> · </Text>
                <Ionicons name="cloud-done-outline" size={12} color={theme.primary} />
              </>
            ) : null}
          </View>

          {progress > 0 && progress < 1 ? (
            <ProgressBar value={progress} height={3} style={{ marginTop: 8, marginRight: 4 }} />
          ) : null}
        </View>

        <Ionicons name="play-circle" size={26} color={theme.primary} style={{ marginLeft: 6 }} />
      </View>
    </Ripple>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, minHeight: 88 },
  body: { flex: 1, minWidth: 0, marginLeft: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 6 },
});