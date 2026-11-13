import React, { useMemo } from "react";
import Svg, { Path, Rect } from "react-native-svg";
import qrcode from "qrcode-generator";

/** A QR code drawn with react-native-svg, always dark on white so any scanner reads it. */
export function Qr({ text, size = 240 }: { text: string; size?: number }) {
  const q = useMemo(() => {
    const qr = qrcode(0, "M"); qr.addData(text); qr.make();
    const n = qr.getModuleCount(); let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { d, n: n + 4 };
  }, [text]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${q.n} ${q.n}`} accessibilityLabel="Check-in QR code">
      <Rect width={q.n} height={q.n} fill="#ffffff" />
      <Path d={q.d} fill="#111111" />
    </Svg>
  );
}
