import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { api } from "../../../../lib/api";
import { API_URL } from "../../../../lib/config";
import { F } from "../../../../lib/fonts";
import { project as projectSchema } from "../../../../lib/schemas";
import { useLoad } from "../../../../lib/useLoad";
import { useTheme } from "../../../../lib/theme";
import { Body, H2, Label, Loading, Notice, Screen } from "../../../../components/ui";
import { Avatar, ImageStrip, Video } from "../../../../components/media";
import { ProjectCards, placeLabel } from "../../../../components/projects";

/** One project from a finished challenge: video, screenshots, what it does and who built it. Any of it can be missing. */
export default function ProjectScreen() {
  const { org, slug, team } = useLocalSearchParams<{ org: string; slug: string; team: string }>();
  const t = useTheme();
  const d = useLoad(() => api(`/orgs/${org}/challenges/${slug}/projects/${team}`, { schema: projectSchema }), [org, slug, team], { cache: `project.${team}` });
  if (!d.data) return <Screen><Stack.Screen options={{ title: "Project" }} />{d.err ? <Notice kind="err">{d.err === "Not found" ? "This project is not shown publicly." : d.err}</Notice> : <Loading />}</Screen>;
  const p = d.data.project;
  const links = [["Demo", p.demo_url], ["Code", p.repo_url], ...(p.video_url && !p.video_embed ? [["Video", p.video_url]] : [])].filter(([, u]) => u) as [string, string][];
  return (
    <Screen onRefresh={d.refresh} refreshing={d.refreshing}>
      <Stack.Screen options={{ title: p.team }} />
      <Label>{placeLabel(p)} · {p.challenge}</Label>
      <Text accessibilityRole="header" style={{ color: t.ink, fontFamily: F.display, fontSize: 32, lineHeight: 36 }}>{p.team}</Text>
      <Text style={{ color: t.muted, fontSize: 14 }}>by {d.data.org.name}</Text>
      <Video embed={p.video_embed} title={p.team} />
      <ImageStrip images={p.images} title={p.team} />
      <H2>About the project</H2>
      {p.notes ? <Body>{p.notes}</Body> : <Body muted>The team has not written about this project yet.</Body>}
      {links.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {links.map(([l, u]) => (
            <Pressable key={l} accessibilityRole="link" onPress={() => void Linking.openURL(u)} style={{ borderWidth: 1.5, borderColor: t.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 }}>
              <Text style={{ color: t.ink, fontWeight: "700" }}>{l}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <H2>The team</H2>
      {p.members.map((m, i) => (
        <Pressable key={i} disabled={!m.handle} accessibilityRole={m.handle ? "link" : undefined} onPress={() => m.handle && void WebBrowser.openBrowserAsync(`${API_URL}/u/${m.handle}`)}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: t.line }}>
          <Avatar name={m.name} url={m.avatar_url} size={40} />
          <Text style={{ color: t.ink, fontSize: 16, fontWeight: "700", textDecorationLine: m.handle ? "underline" : "none" }}>{m.name}</Text>
          {m.lead ? <Text style={{ color: t.muted, fontFamily: F.mono, fontSize: 12 }}>LEAD</Text> : null}
        </Pressable>
      ))}
      {d.data.more.length ? <><H2>More from this challenge</H2><ProjectCards items={d.data.more} /></> : null}
    </Screen>
  );
}
