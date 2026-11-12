import React from "react";
import { Image, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { API_URL } from "../lib/config";

/** Three colourways for the paper-cut fallback, picked from the challenge slug so each one keeps its look. */
const SCENES = [
  { sky: ["#F4E4D2", "#E6E1D7"], sun: "#C8321F", sunAt: [400, 108], hills: ["#CFC8BA", "#4A6AAE", "#2F4F8F", "#111111"] },
  { sky: ["#F3E6BF", "#EBD9A8"], sun: "#F6F4EE", sunAt: [250, 100], hills: ["#B9CFA0", "#6E9A55", "#4E7A3A", "#26421D"] },
  { sky: ["#DCE6F6", "#C9D6EE"], sun: "#C9A15A", sunAt: [380, 94], hills: ["#9DB4E2", "#5A7DC4", "#2F4F8F", "#111111"] },
] as const;

const pick = (seed: string) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return SCENES[h % SCENES.length]!; };

function PaperScene({ seed }: { seed: string }) {
  const s = pick(seed);
  const [sx, sy] = s.sunAt;
  return (
    <Svg width="100%" height="100%" viewBox="0 0 640 280" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={s.sky[0]} /><Stop offset="1" stopColor={s.sky[1]} /></LinearGradient>
      </Defs>
      <Rect width="640" height="280" fill="url(#sky)" />
      <Circle cx={sx} cy={sy} r="74" fill={s.sun} opacity={0.16} />
      <Circle cx={sx} cy={sy} r="52" fill={s.sun} />
      <Ellipse cx="130" cy="70" rx="46" ry="12" fill="#F6F4EE" opacity={0.9} />
      <Ellipse cx="190" cy="86" rx="34" ry="9" fill="#F6F4EE" opacity={0.9} />
      <Path d="M0 178Q110 112 230 166T470 150T640 140V280H0Z" fill={s.hills[0]} />
      <Path d="M0 214Q150 150 310 206T640 178V280H0Z" fill={s.hills[1]} />
      <Path d="M0 244Q190 200 380 238T640 222V280H0Z" fill={s.hills[2]} />
      <Path d="M0 266Q220 238 420 262T640 252V280H0Z" fill={s.hills[3]} />
    </Svg>
  );
}

/** A dark fade at the bottom so white text stays readable on any banner. */
export function Scrim({ height = 120 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height }}>
      <Svg width="100%" height="100%">
        <Defs><LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#111111" stopOpacity={0} /><Stop offset="1" stopColor="#111111" stopOpacity={0.8} /></LinearGradient></Defs>
        <Rect width="100%" height="100%" fill="url(#scrim)" />
      </Svg>
    </View>
  );
}

/** The challenge banner: the organiser's image when there is one, a paper-cut scene when there is not. */
export function Banner({ url, seed, label, style, children }: { url?: string | null; seed: string; label: string; style?: ViewStyle; children?: React.ReactNode }) {
  const [failed, setFailed] = React.useState(false);
  const src = url && !failed ? (url.startsWith("http") ? url : `${API_URL}${url}`) : null;
  return (
    <View style={[{ overflow: "hidden", backgroundColor: "#E6E1D7" }, style]} accessible accessibilityRole="image" accessibilityLabel={`${label} banner`}>
      {src ? <Image source={{ uri: src }} resizeMode="cover" onError={() => setFailed(true)} style={{ width: "100%", height: "100%" }} /> : <PaperScene seed={seed} />}
      {children}
    </View>
  );
}
