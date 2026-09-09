import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS, TOUCH, alpha } from "@/theme/theme";
import { Ripple } from "./ui/Ripple";

function Act({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();
  const color = disabled ? theme.textMuted : theme.text;
  return (
    <View style={{ borderRadius: RADIUS.pill, overflow: "hidden" }}>
      <Ripple onPress={onPress} disabled={disabled} borderless accessibilityLabel={label}>
        <View style={styles.act}>
          <Ionicons name={icon} size={20} color={color} />
        </View>
      </Ripple>
    </View>
  );
}

function SelectionChip({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();
  return (
    <View style={{ borderRadius: RADIUS.pill, overflow: "hidden" }}>
      <Ripple onPress={onPress} disabled={disabled} accessibilityLabel={label}>
        <View
          style={[
            styles.chip,
            { backgroundColor: disabled ? "transparent" : alpha(theme.primary, 0.14) },
          ]}
        >
          <Ionicons name={icon} size={15} color={disabled ? theme.textMuted : theme.primary} />
          <Text
            style={{
              color: disabled ? theme.textMuted : theme.primary,
              fontSize: 12.5,
              fontWeight: "700",
              marginLeft: 6,
            }}
          >
            {label}
          </Text>
        </View>
      </Ripple>
    </View>
  );
}

export interface SelectionBarProps {
  count: number;
  total: number;
  topInset: number;
  onClose: () => void;
  onSelectAll: () => void;
  onSelectAllExcept: () => void;
  onSelectBetween?: () => void;
  canSelectBetween?: boolean;
  onDownload: () => void;
  onRemoveDownload: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
}

/** Overlay toolbar shown while the chapter list is in multi-select mode —
 * exit, select-all/except/between, then bulk actions. Adapted from Honya's
 * SelectionBar for Iro's chapter management. */
export const SelectionBar = memo(function SelectionBar({
  count,
  total,
  topInset,
  onClose,
  onSelectAll,
  onSelectAllExcept,
  onSelectBetween,
  canSelectBetween,
  onDownload,
  onRemoveDownload,
  onMarkRead,
  onMarkUnread,
}: SelectionBarProps) {
  const theme = useAppTheme();
  const none = count === 0;

  return (
    <View
      style={[
        styles.bar,
        { paddingTop: topInset + 4, backgroundColor: theme.surface2, borderBottomColor: theme.outline },
      ]}
    >
      <View style={styles.top}>
        <View style={{ borderRadius: RADIUS.pill, overflow: "hidden" }}>
          <Ripple onPress={onClose} borderless accessibilityLabel="Exit selection">
            <View style={styles.act}>
              <Ionicons name="close" size={22} color={theme.text} />
            </View>
          </Ripple>
        </View>
        <Text style={{ color: theme.text, fontWeight: "800", fontSize: 16, flex: 1, marginLeft: 6 }}>
          {count} selected
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>of {total}</Text>
      </View>

      <View style={[styles.tools, { borderTopColor: theme.outline }]}>
        <SelectionChip icon="checkmark-done-outline" label="Select all" onPress={onSelectAll} />
        <SelectionChip
          icon="remove-circle-outline"
          label="Select all except"
          onPress={onSelectAllExcept}
          disabled={none}
        />
        {canSelectBetween ? (
          <SelectionChip icon="git-commit-outline" label="Select between" onPress={onSelectBetween} />
        ) : null}
      </View>

      <View style={[styles.actions, { borderTopColor: theme.outline }]}>
        <Act icon="arrow-down-circle-outline" label="Download" onPress={onDownload} disabled={none} />
        <Act icon="trash-outline" label="Remove download" onPress={onRemoveDownload} disabled={none} />
        <Act icon="eye-outline" label="Mark read" onPress={onMarkRead} disabled={none} />
        <Act icon="eye-off-outline" label="Mark unread" onPress={onMarkUnread} disabled={none} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { position: "absolute", top: 0, left: 0, right: 0, borderBottomWidth: 1, elevation: 4, zIndex: 10 },
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingBottom: 2 },
  tools: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 32, borderRadius: RADIUS.pill },
  actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 2, borderTopWidth: 1 },
  act: { width: TOUCH, height: TOUCH, alignItems: "center", justifyContent: "center" },
});
