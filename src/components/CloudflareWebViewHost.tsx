import React, { useCallback, useRef, useState } from "react";
import { Modal, StyleSheet, View, Text } from "react-native";
import WebView, { WebViewNavigation, WebViewMessageEvent } from "react-native-webview";
import { Application } from "@/providers/sandbox/network";

interface PendingChallenge {
  sourceId: string;
  url: string;
  resolve: () => void;
  reject: (err: Error) => void;
}

/**
 * Global bridge so any part of the app (network interceptor, services) can
 * request a Cloudflare solve without needing a ref to this component.
 * Mounted once near the root layout.
 */
class CloudflareBridge {
  private listener: ((challenge: PendingChallenge) => void) | null = null;

  register(listener: (challenge: PendingChallenge) => void) {
    this.listener = listener;
  }

  unregister() {
    this.listener = null;
  }

  requestSolve(sourceId: string, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.listener) {
        reject(
          new Error(
            "CloudflareWebViewHost is not mounted; cannot solve challenge."
          )
        );
        return;
      }
      this.listener({ sourceId, url, resolve, reject });
    });
  }
}

export const cloudflareBridge = new CloudflareBridge();

/**
 * Renders a hidden (0x0, non-interactive-to-the-user until needed)
 * WebView that loads the challenged URL. Cloudflare's JS challenge runs
 * inside the WebView's real browser engine; once it resolves, the WebView
 * carries a `cf_clearance` cookie which we extract and hand back to the
 * network pipeline so subsequent Application.scheduleRequest() calls for
 * that source succeed.
 *
 * Mount this once, high in the tree (e.g. app/_layout.tsx).
 */
export function CloudflareWebViewHost() {
  const [active, setActive] = useState<PendingChallenge | null>(null);
  const webviewRef = useRef<WebView<{}>>(null);
  const settledRef = useRef(false);

  React.useEffect(() => {
    cloudflareBridge.register((challenge) => {
      settledRef.current = false;
      setActive(challenge);
    });
    return () => cloudflareBridge.unregister();
  }, []);

  const finish = useCallback(
    (cookieHeader: string | null, err?: Error) => {
      if (!active || settledRef.current) return;
      settledRef.current = true;
      if (err) {
        active.reject(err);
      } else {
        if (cookieHeader) {
          Application.setClearanceCookie(active.sourceId, cookieHeader);
        }
        active.resolve();
      }
      setActive(null);
    },
    [active]
  );

  const onNavStateChange = useCallback(
    async (navState: WebViewNavigation) => {
      if (!active) return;
      // A successful clearance is signaled once the page finishes loading
      // and is no longer serving the Cloudflare interstitial title/markup.
      if (!navState.loading && navState.title && !/just a moment/i.test(navState.title)) {
        const cookieScript = `
          window.ReactNativeWebView.postMessage(document.cookie);
          true;
        `;
        webviewRef.current?.injectJavaScript(cookieScript);
      }
    },
    [active]
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const cookie = event.nativeEvent.data as string;
      finish(cookie || null);
    },
    [finish]
  );

  if (!active) return null;

  return (
    <Modal visible transparent animationType="none">
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Verifying connection to {active.sourceId}…
          </Text>
        </View>
        <WebView<{}>
          ref={webviewRef}
          source={{ uri: active.url }}
          onNavigationStateChange={onNavStateChange}
          onMessage={onMessage}
          onError={(e) =>
            finish(null, new Error(`Cloudflare WebView error: ${e.nativeEvent.description}`))
          }
          style={styles.webview}
          javaScriptEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  banner: {
    padding: 12,
    backgroundColor: "#1c1f26",
  },
  bannerText: { color: "#fff", textAlign: "center" },
  // Kept off-screen rather than display:none so the engine still
  // executes the challenge JS.
  webview: { height: 220, backgroundColor: "transparent" },
});
