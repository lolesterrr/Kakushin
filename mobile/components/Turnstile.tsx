import React from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { API_URL } from "../lib/config";

/**
 * Cloudflare's bot check, shown in a small web view because the widget only runs in a browser.
 * The page comes from the API's own address (GET /api/auth/turnstile), since Turnstile only works on hostnames it allows.
 * Most people see a tick and nothing else; it calls onToken with a one-use token, or with null when it expires or fails.
 */
export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  return (
    <View style={{ height: 72, borderRadius: 12, overflow: "hidden" }}>
      <WebView
        source={{ uri: `${API_URL}/api/auth/turnstile` }}
        style={{ backgroundColor: "transparent" }}
        originWhitelist={["https://*"]}
        scrollEnabled={false}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data) as { token?: string };
            onToken(typeof m.token === "string" ? m.token : null);
          } catch { onToken(null); }
        }}
      />
    </View>
  );
}
