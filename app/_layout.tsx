import "react-native-gesture-handler";
import React, { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { CloudflareWebViewHost } from "@/components/CloudflareWebViewHost";
import { WebViewExecHost } from "@/components/WebViewExecHost";
import { bootstrap } from "@/services/providerRegistry";
import { useAppTheme } from "@/theme/useAppTheme";
import { isThemeDark } from "@/theme/theme";

export default function RootLayout() {
  const theme = useAppTheme();
  const dark = isThemeDark(theme);

  useEffect(() => {
    void bootstrap();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style={dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.surface1 },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontWeight: "800", fontSize: 17 },
            contentStyle: { backgroundColor: theme.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="manga/[id]"
            options={{ title: "", headerTransparent: true }}
          />
          <Stack.Screen
            name="reader/[chapterId]"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="sources" options={{ title: "Sources" }} />
          <Stack.Screen
            name="browse/[sourceId]"
            options={{ title: "", headerTransparent: true }}
          />
          <Stack.Screen
            name="settings/theme"
            options={{ title: "Appearance" }}
          />
          <Stack.Screen name="settings/reader" options={{ title: "Reader" }} />
          <Stack.Screen name="settings/storage" options={{ title: "Storage" }} />
          <Stack.Screen name="settings/backup" options={{ title: "Backup & restore" }} />
          <Stack.Screen name="settings/about" options={{ title: "About" }} />
        </Stack>
        <CloudflareWebViewHost />
        <WebViewExecHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}