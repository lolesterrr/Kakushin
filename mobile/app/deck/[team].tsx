import React from "react";
import { Platform, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { WebView } from "react-native-webview";
import { authHeaders } from "../../lib/api";
import { API_URL } from "../../lib/config";
import { Body, Screen } from "../../components/ui";

/** The pitch deck PDF, opened with the judge's session. iPhone shows PDFs in the viewer; Android needs the web. */
export default function DeckScreen() {
  const { team, name } = useLocalSearchParams<{ team: string; name?: string }>();
  const url = `${API_URL}/api/decks/${team}`;
  if (Platform.OS === "android") return <Screen><Stack.Screen options={{ title: name ?? "Deck" }} /><Body muted>Android cannot show PDFs inside the app yet. Open this team on the Kakushin website to read the deck.</Body></Screen>;
  if (Platform.OS === "web") return <Screen><Stack.Screen options={{ title: name ?? "Deck" }} /><Body muted>Open the deck on the Kakushin website.</Body></Screen>;
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: name ? `${name} deck` : "Deck" }} />
      <WebView source={{ uri: url, headers: authHeaders() }} style={{ flex: 1 }} startInLoadingState originWhitelist={["https://*", "http://*"]} />
    </View>
  );
}
