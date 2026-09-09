import { Platform, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { useAppTheme } from "@/theme/useAppTheme";
import { alpha } from "@/theme/theme";

interface Props {
  children?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  style?: StyleProp<ViewStyle>;
  borderless?: boolean;
  disabled?: boolean;
  hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number };
  rippleColor?: string;
  accessibilityLabel?: string;
}

/** Native `android_ripple` runs on the UI thread, keeping touch
 * feedback smooth while a list scrolls. */
export function Ripple({
  children,
  onPress,
  onLongPress,
  delayLongPress,
  style,
  borderless = false,
  disabled,
  hitSlop,
  rippleColor,
  accessibilityLabel,
}: Props) {
  const theme = useAppTheme();
  const color = rippleColor ?? alpha(theme.primary, 0.16);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color, borderless, foreground: !borderless }}
      style={({ pressed }) => [
        style,
        pressed && Platform.OS !== "android" ? { opacity: 0.65 } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}