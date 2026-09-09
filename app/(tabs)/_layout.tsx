import React from "react";
import { Text, View } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme } from "@/theme/useAppTheme";
import { RADIUS } from "@/theme/theme";

// M3 nav bar; the active pill swaps background colour with no JS
// animation, so tab switching stays instant on Android.
const ICONS: Record<string, [string, string]> = {
  library: ["library", "library-outline"],
  updates: ["notifications", "notifications-outline"],
  history: ["time", "time-outline"],
  browse: ["compass", "compass-outline"],
  downloads: ["download", "download-outline"],
  more: ["menu", "menu-outline"],
};

function TabItem({ routeName, focused }: { routeName: string; focused: boolean }) {
  const theme = useAppTheme();
  const [active, inactive] = ICONS[routeName] ?? ICONS.more;
  return (
    <View style={{ alignItems: "center", justifyContent: "center", width: 64 }}>
      <View
        style={{
          width: 60,
          height: 32,
          borderRadius: RADIUS.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: focused ? theme.primaryContainer : "transparent",
        }}
      >
        <Ionicons
          name={(focused ? active : inactive) as never}
          size={21}
          color={focused ? theme.onPrimaryContainer : theme.textMuted}
        />
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700", marginBottom: 2 },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarStyle: {
          backgroundColor: theme.surface1,
          borderTopWidth: 0,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          elevation: 0,
        },
        tabBarHideOnKeyboard: true,
        tabBarIcon: ({ focused }) => <TabItem routeName={route.name} focused={focused} />,
        tabBarLabel: ({ focused, color, children }) => (
          <Text style={{ color, fontSize: 11, fontWeight: focused ? "800" : "600" }} numberOfLines={1}>
            {children}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="updates" options={{ title: "Updates" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="browse" options={{ title: "Catalogs" }} />
      {/* Reachable from the Updates header and chapter actions, not
          from the bottom bar. */}
      <Tabs.Screen name="downloads" options={{ href: null }} />
      <Tabs.Screen name="more" options={{ title: "More" }} />
    </Tabs>
  );
}