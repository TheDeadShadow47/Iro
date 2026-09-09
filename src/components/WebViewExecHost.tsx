import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import WebView, { WebViewMessageEvent } from "react-native-webview";

/** Mirrors the Paperback/InkDex `Application.executeInWebView` shape. */
export interface WebViewExecRequest {
  source: {
    html: string;
    baseUrl?: string;
    loadCSS?: boolean;
    loadImages?: boolean;
    userAgent?: string;
  };
  /** JS body to run against the loaded document; e.g. `"return window.__x;"`. */
  inject: string;
  storage?: { cookies?: Record<string, string> };
  timeoutMs?: number;
}

interface QueuedExec extends WebViewExecRequest {
  id: number;
  resolve: (value: { result: unknown }) => void;
  reject: (err: Error) => void;
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Global bridge so `Application.executeInWebView` can request a WebView
 * execution without holding a ref to this component. Mounted once near the
 * root layout.
 *
 * Unlike CloudflareWebViewHost (which loads a real URL and waits for a
 * challenge to clear), this loads raw HTML the extension already fetched
 * and just needs a real DOM + JS engine to evaluate a computation against.
 */
class WebViewExecBridge {
  private listener: ((req: QueuedExec) => void) | null = null;
  private nextId = 1;

  register(listener: (req: QueuedExec) => void) {
    this.listener = listener;
  }

  unregister() {
    this.listener = null;
  }

  execute(req: WebViewExecRequest): Promise<{ result: unknown }> {
    return new Promise((resolve, reject) => {
      if (!this.listener) {
        reject(new Error("WebViewExecHost is not mounted; cannot execute in webview."));
        return;
      }
      this.listener({ ...req, id: this.nextId++, resolve, reject });
    });
  }
}

export const webViewExecBridge = new WebViewExecBridge();

/** Strips `<style>`/stylesheet `<link>` or `<img>` tags before load,
 * matching `loadCSS`/`loadImages: false` intent. */
function preprocessHtml(html: string, loadCSS?: boolean, loadImages?: boolean): string {
  let out = html;
  if (loadCSS === false) {
    out = out
      .replace(/<link\b[^>]*rel=["']?stylesheet["']?[^>]*>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "");
  }
  if (loadImages === false) {
    out = out.replace(/<img\b/gi, '<img data-src-disabled="1" ');
    out = out.replace(/\ssrc=(["'])(?:(?!\1).)*\1/gi, (m) =>
      m.startsWith(" src=") ? "" : m
    );
  }
  return out;
}

export function WebViewExecHost() {
  const [active, setActive] = useState<QueuedExec | null>(null);
  const queueRef = useRef<QueuedExec[]>([]);
  const activeRef = useRef<QueuedExec | null>(null);
  const webviewRef = useRef<WebView<{}>>(null);
  const settledRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback((result: unknown, err?: Error) => {
    if (!activeRef.current || settledRef.current) return;
    settledRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const current = activeRef.current;
    if (err) current.reject(err);
    else current.resolve({ result });
    activeRef.current = null;
    setActive(null);
  }, []);

  const runNext = useCallback(() => {
    if (activeRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;
    settledRef.current = false;
    activeRef.current = next;
    setActive(next);
    timeoutRef.current = setTimeout(() => {
      finish(null, new Error("Application.executeInWebView timed out"));
    }, next.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  }, [finish]);

  // Pull the next queued job once the current one settles (WebView fully
  // unmounts first — each job gets a fresh browsing context, no leftover
  // `window.*` globals from a previous document).
  useEffect(() => {
    if (!active) runNext();
  }, [active, runNext]);

  useEffect(() => {
    webViewExecBridge.register((req) => {
      queueRef.current.push(req);
      runNext();
    });
    return () => webViewExecBridge.unregister();
  }, [runNext]);

  const onLoadEnd = useCallback(() => {
    if (!active) return;
    const script = `
      (function() {
        try {
          var __result = (function() { ${active.inject} })();
          window.ReactNativeWebView.postMessage(JSON.stringify({ ok: true, result: __result }));
        } catch (e) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ ok: false, error: String((e && e.message) || e) }));
        }
      })();
      true;
    `;
    webviewRef.current?.injectJavaScript(script);
  }, [active]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const parsed = JSON.parse(event.nativeEvent.data);
        if (parsed.ok) finish(parsed.result);
        else finish(null, new Error(parsed.error ?? "executeInWebView script threw"));
      } catch {
        finish(null, new Error("executeInWebView: couldn't parse webview result"));
      }
    },
    [finish]
  );

  if (!active) return null;

  // Cookies must be seeded BEFORE the page's own inline <script> runs
  // (that's usually what `inject` reads from `window`), so they go in
  // injectedJavaScriptBeforeContentLoaded rather than after onLoadEnd.
  const cookieSeedScript = active.storage?.cookies
    ? `${Object.entries(active.storage.cookies)
        .map(([k, v]) => `document.cookie = ${JSON.stringify(`${k}=${v}`)};`)
        .join("\n")}\ntrue;`
    : undefined;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView<{}>
        key={active.id}
        ref={webviewRef}
        source={{
          html: preprocessHtml(
            active.source.html,
            active.source.loadCSS,
            active.source.loadImages
          ),
          baseUrl: active.source.baseUrl,
        }}
        userAgent={active.source.userAgent}
        injectedJavaScriptBeforeContentLoaded={cookieSeedScript}
        onLoadEnd={onLoadEnd}
        onMessage={onMessage}
        onError={(e) =>
          finish(null, new Error(`executeInWebView WebView error: ${e.nativeEvent.description}`))
        }
        style={styles.webview}
        javaScriptEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        originWhitelist={["*"]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Off-screen rather than display:none so the engine executes the page.
  hidden: { position: "absolute", width: 1, height: 1, opacity: 0, left: -9999, top: -9999 },
  webview: { width: 1, height: 1 },
});
