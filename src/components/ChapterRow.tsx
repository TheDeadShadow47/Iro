import { memo, useCallback } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { alpha, RADIUS } from "@/theme/theme";
import type { ChapterInfo, DownloadStatus } from "@/domain/models";
import { Ripple } from "./ui/Ripple";
import { hasValidDate } from "@/utils/dateTime";

export const CHAPTER_ROW_HEIGHT = 68;

interface ChapterRowProps {
  chapter: ChapterInfo;
  onPress: () => void;
  onLongPress?: () => void;
  /** 0..1 reading progress for this chapter. */
  progress?: number;
  metadata?: string;
  trailing?: React.ReactNode;
  /** Multi-select mode: hides the per-row download button and tints the
   * row when `selected`. */
  selecting?: boolean;
  selected?: boolean;
  /** Download state for the trailing action button; omit if unknown. */
  downloadStatus?: DownloadStatus;
  onDownload?: () => void;
  onRemoveDownload?: () => void;
}

/** Chapter list row. Read state is communicated by the lead dot and a weight
 * shift, not by icon clutter — the same system Honya uses for novel chapters. */
export const ChapterRow = memo(function ChapterRow({
  chapter,
  onPress,
  onLongPress,
  progress = 0,
  metadata,
  trailing,
  selecting = false,
  selected = false,
  downloadStatus,
  onDownload,
  onRemoveDownload,
}: ChapterRowProps) {
  const theme = useAppTheme();
  const read = progress == null ? false : progress >= 1;
  const partial = !read && progress > 0.02;
  const downloading = downloadStatus === "downloading" || downloadStatus === "queued";
  const downloaded = downloadStatus === "completed";
  const failed = downloadStatus === "error";

  const dateLabel = hasValidDate(chapter.publishedAt)
    ? new Date(chapter.publishedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "";

  const meta = [metadata ? `${metadata} · ` : "", dateLabel].join("");

  const handleDownloadPress = useCallback(() => {
    if (downloading) return;
    if (downloaded) onRemoveDownload?.();
    else onDownload?.();
  }, [downloading, downloaded, onDownload, onRemoveDownload]);

  return (
    <Ripple onPress={onPress} onLongPress={onLongPress} delayLongPress={220}>
      <View style={[styles.row, selected ? { backgroundColor: alpha(theme.primary, 0.2) } : null]}>
        <View style={styles.lead}>
          <View
            style={[
              styles.dot,
              read
                ? { borderWidth: 1.5, borderColor: theme.textMuted, opacity: 0.4 }
                : { backgroundColor: theme.primary },
            ]}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: read ? theme.textMuted : theme.text,
              fontSize: 14.5,
              lineHeight: 19,
              fontWeight: read ? "500" : "700",
            }}
          >
            {chapter.title || `Chapter ${chapter.chapterNumber}`}
          </Text>
          <View style={styles.metaRow}>
            <Text
              numberOfLines={1}
              style={{ color: partial || downloaded ? theme.primary : theme.textMuted, fontSize: 11.5 }}
            >
              {meta}
              {downloaded ? " · Offline" : ""}
            </Text>
          </View>
          {partial ? (
            <View style={[styles.track, { backgroundColor: alpha(theme.primary, 0.18) }]}>
              <View
                style={{
                  width: `${Math.min(100, Math.round(progress * 100))}%`,
                  height: "100%",
                  borderRadius: 2,
                  backgroundColor: theme.primary,
                }}
              />
            </View>
          ) : null}
        </View>

        {trailing !== undefined ? (
          trailing
        ) : selecting ? null : onDownload ? (
          <View style={styles.actionWrap}>
            <Ripple borderless disabled={downloading} hitSlop={6} onPress={handleDownloadPress} accessibilityLabel="Download chapter">
              <View style={styles.downloadButton}>
                {downloading ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Ionicons
                    name={downloaded ? "checkmark-circle" : failed ? "cloud-offline-outline" : "arrow-down-circle-outline"}
                    size={21}
                    color={downloaded ? theme.primary : failed ? theme.error : theme.textMuted}
                  />
                )}
              </View>
            </Ripple>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={17} color={theme.textMuted} style={{ marginLeft: 6 }} />
        )}
      </View>
    </Ripple>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    height: CHAPTER_ROW_HEIGHT,
  },
  lead: { width: 26, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 3 },
  track: { height: 3, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  actionWrap: { borderRadius: RADIUS.pill, overflow: "hidden", marginLeft: 6 },
  downloadButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
