import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { alpha, RADIUS } from "@/theme/theme";
import type { MangaTile } from "@/domain/models";
import { Ripple } from "./ui/Ripple";
import { Cover } from "./ui/Cover";

interface Props {
  tile: MangaTile;
  onPress: () => void;
  onLongPress?: () => void;
  width?: number | `${number}%`;
  unreadCount?: number;
  /** 0..1 reading progress for the progress overlay. */
  progress?: number;
  /** Secondary caption under the title (author or source). */
  caption?: string;
  /** Finished check instead of the unread badge. */
  finished?: boolean;
  /** True if any chapter of this title is downloaded — small corner glyph. */
  downloaded?: boolean;
  /** Library multi-select mode: dims the cover and shows a selection check. */
  selecting?: boolean;
  selected?: boolean;
}

/** Manga grid card. Covers stay visually dominant; only useful metadata
 * (progress, author/source) sits below — mirroring Honya's novel cards. */
export const MangaCard = memo(function MangaCard({
  tile,
  onPress,
  onLongPress,
  width = "31%",
  unreadCount,
  progress = 0,
  caption,
  finished,
  downloaded,
  selecting,
  selected,
}: Props) {
  const theme = useAppTheme();
  const showProgress = progress > 0 && progress < 1;
  const showCheck = finished || progress >= 1;

  return (
    <View style={{ width, borderRadius: RADIUS.lg, overflow: "hidden" }}>
      <Ripple onPress={onPress} onLongPress={onLongPress} delayLongPress={220}>
        <View>
          <View style={styles.coverWrap}>
            <Cover uri={tile.coverUrl} title={tile.title} radius={RADIUS.lg} style={styles.cover} />

            {selecting ? (
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: selected ? alpha(theme.primary, 0.28) : alpha("#000000", 0.18) },
                ]}
              />
            ) : null}

            {selecting ? (
              <View
                style={[
                  styles.checkDot,
                  selected
                    ? { backgroundColor: theme.primary, borderColor: theme.primary }
                    : { backgroundColor: alpha("#000000", 0.35), borderColor: "#ffffffaa" },
                ]}
              >
                {selected ? <Ionicons name="checkmark" size={13} color={theme.onPrimary} /> : null}
              </View>
            ) : unreadCount ? (
              <View style={[styles.badge, { backgroundColor: theme.primary }]}>
                <Text style={{ color: theme.onPrimary, fontSize: 11, fontWeight: "800" }}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Text>
              </View>
            ) : showCheck ? (
              <View style={[styles.badge, styles.badgeIcon, { backgroundColor: alpha(theme.primary, 0.9) }]}>
                <Text style={{ color: theme.onPrimary, fontSize: 10, fontWeight: "800" }}>✓</Text>
              </View>
            ) : null}

            {downloaded && !selecting ? (
              <View style={[styles.downloadBadge, { backgroundColor: alpha("#000000", 0.55) }]}>
                <Ionicons name="checkmark-circle" size={13} color={theme.primary} />
              </View>
            ) : null}

            {showProgress ? (
              <View style={styles.progressWrap}>
                <View style={[styles.progressTrack, { backgroundColor: "#00000073" }]}>
                  <View style={{ width: `${progress * 100}%`, height: "100%", backgroundColor: theme.primary }} />
                </View>
              </View>
            ) : null}
          </View>

          <Text numberOfLines={2} style={[styles.title, { color: theme.text }]}>
            {tile.title}
          </Text>
          {caption ? (
            <Text numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>
              {showProgress ? `${Math.round(progress * 100)}% · ` : ""}
              {caption}
            </Text>
          ) : null}
        </View>
      </Ripple>
    </View>
  );
});

const styles = StyleSheet.create({
  coverWrap: { aspectRatio: 2 / 3, borderRadius: RADIUS.lg, overflow: "hidden" },
  cover: { width: "100%", height: "100%" },
  badge: {
    position: "absolute",
    top: 7,
    right: 7,
    minWidth: 22,
    paddingHorizontal: 7,
    height: 22,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeIcon: { minWidth: 22, paddingHorizontal: 0 },
  checkDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 22,
    height: 22,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadBadge: {
    position: "absolute",
    top: 7,
    left: 7,
    width: 20,
    height: 20,
    borderRadius: RADIUS.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  progressWrap: { position: "absolute", left: 8, right: 8, bottom: 8 },
  progressTrack: { height: 4, borderRadius: 4, overflow: "hidden" },
  title: { fontSize: 12.5, fontWeight: "700", marginTop: 8, lineHeight: 16.5 },
  meta: { fontSize: 11, fontWeight: "600", marginTop: 2, marginBottom: 4 },
});