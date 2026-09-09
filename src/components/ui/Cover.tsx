import { memo, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";

interface Props {
  uri?: string;
  title?: string;
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  radius?: number;
  style?: object;
}

/** Image with a themed fallback. `fadeDuration={0}` avoids the Android
 * cross-fade that janks recycled list cells. */
export const Cover = memo(function Cover({
  uri,
  title,
  width,
  height,
  radius = RADIUS.md,
  style,
}: Props) {
  const theme = useAppTheme();
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;

  return (
    <View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.surface2, overflow: "hidden" },
        style,
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          fadeDuration={0}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.fallback}>
          <Text numberOfLines={3} style={{ color: theme.textMuted, fontSize: 11, textAlign: "center" }}>
            {title ?? ""}
          </Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  fallback: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
});