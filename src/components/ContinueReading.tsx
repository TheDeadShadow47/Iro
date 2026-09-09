import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";
import { ProgressBar } from "./ui/MD3";
import { Ripple } from "./ui/Ripple";
import { Cover } from "./ui/Cover";

interface Props {
  coverUrl?: string;
  title: string;
  chapterLabel: string;
  progress: number;
  onPress: () => void;
}

/** "Continue reading" banner shown above the library grid — same compact
 * surface Honya uses on its library tab. */
export function ContinueReading({ coverUrl, title, chapterLabel, progress, onPress }: Props) {
  const theme = useAppTheme();
  const pct = Math.min(Math.max(progress ?? 0, 0), 1);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 }}>
        CONTINUE READING
      </Text>
      <View style={{ borderRadius: RADIUS.lg, overflow: "hidden", backgroundColor: theme.surface1 }}>
        <Ripple onPress={onPress}>
          <View style={{ flexDirection: "row", alignItems: "center", padding: 12 }}>
            <Cover uri={coverUrl} title={title} width={54} height={76} radius={RADIUS.md} />
            <View style={{ flex: 1, minWidth: 0, marginLeft: 14 }}>
              <Text numberOfLines={1} style={{ color: theme.text, fontWeight: "800", fontSize: 15 }}>
                {title}
              </Text>
              <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>
                {chapterLabel}
              </Text>
              <View style={{ marginTop: 10, marginRight: 4 }}>
                <ProgressBar value={pct} />
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 6 }}>{Math.round(pct * 100)}%</Text>
            </View>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: theme.primary,
                alignItems: "center",
                justifyContent: "center",
                marginLeft: 8,
              }}
            >
              <Ionicons name="play" size={17} color={theme.onPrimary} />
            </View>
          </View>
        </Ripple>
      </View>
    </View>
  );
}