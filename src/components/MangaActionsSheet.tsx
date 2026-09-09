import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS, SPACING } from "@/theme/theme";
import { Ripple } from "@/components/ui/Ripple";
import { BottomSheet } from "@/components/BottomSheet";

interface ActionRowProps {
  icon: any;
  label: string;
  hint?: string;
  tone?: "default" | "accent";
  onPress: () => void;
}

const ActionRow = memo(function ActionRow({ icon, label, hint, tone = "default", onPress }: ActionRowProps) {
  const theme = useAppTheme();
  const color = tone === "accent" ? theme.primary : theme.text;
  return (
    <View style={styles.rowWrap}>
      <Ripple onPress={onPress} accessibilityLabel={label}>
        <View style={[styles.row, { backgroundColor: "transparent" }]}>
          <Ionicons name={icon} size={21} color={tone === "accent" ? theme.primary : theme.textMuted} />
          <View style={{ flex: 1, marginLeft: 14, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color, fontSize: 15, fontWeight: "600" }}>
              {label}
            </Text>
            {hint ? (
              <Text numberOfLines={2} style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                {hint}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={17} color={theme.textMuted} />
        </View>
      </Ripple>
    </View>
  );
});

export function MangaActionsSheet({
  visible,
  onDismiss,
  onRefresh,
  onMigrate,
  refreshing,
}: {
  visible: boolean;
  onDismiss: () => void;
  onRefresh: () => void;
  onMigrate: () => void;
  refreshing: boolean;
}) {
  const theme = useAppTheme();
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={[styles.handle, { backgroundColor: theme.outline }]} />
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800", paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm }}>
        Manga actions
      </Text>
      <ActionRow
        icon="refresh-outline"
        label={refreshing ? "Refreshing…" : "Refresh"}
        hint="Re-fetch details and chapters from the source."
        onPress={onRefresh}
      />
      <ActionRow
        icon="swap-horizontal-outline"
        label="Migrate"
        hint="Move this title to another source while keeping reading progress."
        tone="accent"
        onPress={onMigrate}
      />
      <View style={{ height: 24 }} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  handle: { width: 40, height: 4, borderRadius: RADIUS.pill, alignSelf: "center", marginBottom: SPACING.lg },
  rowWrap: { borderRadius: RADIUS.md, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.lg, paddingVertical: 14 },
});
