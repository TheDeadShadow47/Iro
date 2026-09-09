import { type ReactNode } from "react";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { Divider } from "./ui/MD3";
import { Ripple } from "./ui/Ripple";
import { RADIUS } from "@/theme/theme";

interface RowProps {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
}

/** Icon + title + subtitle row used inside grouped settings surfaces. */
export function SettingsRow({ icon, title, subtitle, onPress, right, danger }: RowProps) {
  const theme = useAppTheme();
  const tint = danger ? theme.error : theme.primary;
  const content = (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 }}>
      <Ionicons name={icon} size={20} color={tint} style={{ width: 30 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{title}</Text>
        {subtitle ? <Text style={{ color: theme.textMuted, fontSize: 12.5, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={17} color={theme.textMuted} /> : null)}
    </View>
  );

  if (!onPress) return content;
  return <Ripple onPress={onPress}>{content}</Ripple>;
}

/** Grouped surface card with hairline-divided rows. */
export function SettingsGroup({ children, style }: { children: ReactNode; style?: object }) {
  const theme = useAppTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface1,
          borderRadius: RADIUS.lg,
          overflow: "hidden",
          marginBottom: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SettingsDivider() {
  return <Divider inset={46} />;
}