import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";
import { Ripple } from "./ui/Ripple";
import { Cover } from "./ui/Cover";
import { relativeTime } from "@/utils/time";
import type { UpdateEntry } from "@/domain/models";

/** A single new-chapter row in the Updates feed — cover, title hierarchy,
 * unread dot — adapted from Honya's updates row. */
export const UpdateRow = memo(function UpdateRow({
  entry,
  onPress,
}: {
  entry: UpdateEntry;
  onPress: () => void;
}) {
  const theme = useAppTheme();

  return (
    <Ripple onPress={onPress}>
      <View style={styles.row}>
        <Cover uri={entry.coverUrl} title={entry.mangaTitle} width={50} height={72} radius={RADIUS.md} />
        <View style={styles.body}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14.5, fontWeight: "700" }}>
            {entry.mangaTitle}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: entry.isRead ? theme.textMuted : theme.text,
              fontSize: 13,
              marginTop: 3,
              fontWeight: entry.isRead ? "500" : "600",
            }}
          >
            {entry.chapterTitle}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 4 }}>
            {relativeTime(entry.firstSeenAt)}
          </Text>
        </View>
        {entry.isRead ? null : (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.primary, marginLeft: 8 }} />
        )}
        <Ionicons name="chevron-forward" size={16} color={theme.textMuted} style={{ marginLeft: 8 }} />
      </View>
    </Ripple>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, minHeight: 88 },
  body: { flex: 1, minWidth: 0, marginLeft: 14 },
});
