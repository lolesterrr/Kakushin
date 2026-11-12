// Generates the demo images and pitch decks (illustrations drawn as SVG/HTML, rendered with Playwright).
//   NODE_PATH=$(npm root -g) node scripts/demo/make-media.mjs
// Output goes to scripts/demo/media/ (committed, so seeding does not need a browser).
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CHALLENGES, ORGS, slugOf } from "./data.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "media");
for (const d of ["covers", "logos", "decks"]) fs.mkdirSync(path.join(OUT, d), { recursive: true });

// Small seeded random so every run draws the same picture.
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const f = (n) => Math.round(n * 10) / 10;
const grad = (id, stops, x2 = 0, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`;
const radial = (id, stops) => `<radialGradient id="${id}">${stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</radialGradient>`;
const grain = `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .09 0"/></filter><rect width="100%" height="100%" filter="url(#g)"/>`;
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}${grain}</svg>`;
const star = (x, y, r, fill, op = 1) => `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${fill}" opacity="${op}"/>`;
const flame = (x, y, s, c1, c2) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-70C25-40 38-15 30 15 24 40 6 52 0 52-6 52-24 40-30 15-38-15-25-40 0-70Z" fill="${c1}"/><path transform="translate(${x} ${y + 14 * s}) scale(${s * 0.55})" d="M0-70C25-40 38-15 30 15 24 40 6 52 0 52-6 52-24 40-30 15-38-15-25-40 0-70Z" fill="${c2}"/>`;
const drop = (x, y, s, fill, op = 1) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0-30C14-10 22 2 22 14A22 22 0 0 1-22 14C-22 2-14-10 0-30Z" fill="${fill}" opacity="${op}"/>`;

const W = 1600, H = 700;
const COVERS = {
  ember() {
    const r = rng(11); let smoke = "";
    for (let i = 0; i < 14; i++) smoke += `<circle cx="${f(780 + (r() - 0.4) * 220 + i * 6)}" cy="${f(250 - i * 22)}" r="${f(26 + i * 7)}" fill="#fff1e0" opacity="${f(0.22 - i * 0.014)}"/>`;
    let sparks = ""; for (let i = 0; i < 40; i++) sparks += `<circle cx="${f(r() * W)}" cy="${f(120 + r() * 520)}" r="${f(1 + r() * 3)}" fill="#ffb347" opacity="${f(0.2 + r() * 0.6)}"/>`;
    return svg(W, H, `<defs>${grad("b", [[0, "#1c0d09"], [0.55, "#7b2511"], [1, "#e8621f"]])}${radial("glow", [[0, "#ffb347", 0.9], [1, "#ffb347", 0]])}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/><circle cx="800" cy="470" r="420" fill="url(#glow)"/>${sparks}${smoke}
      <path d="M0 560Q400 520 800 560T1600 540V700H0Z" fill="#140a07"/>
      <path d="M610 400h360l50 160H560Z" fill="#2c1a14"/><path d="M640 400h300l36 160H604Z" fill="#3a241b"/>
      <rect x="690" y="440" width="200" height="120" rx="60" fill="#0f0705"/>
      ${flame(740, 520, 0.9, "#ff8a1f", "#ffd86b")}${flame(790, 505, 1.15, "#ff6a13", "#ffc94a")}${flame(842, 520, 0.85, "#ff8a1f", "#ffd86b")}
      <rect x="590" y="330" width="420" height="84" rx="14" fill="#d9d4c7"/><rect x="590" y="330" width="420" height="22" rx="11" fill="#f2eee3"/>
      <rect x="548" y="352" width="58" height="16" rx="8" fill="#b8b2a3"/><rect x="994" y="352" width="58" height="16" rx="8" fill="#b8b2a3"/>
      ${star(260, 190, 22, "#ffe3b0", 0.8)}${star(1340, 150, 30, "#ffe3b0", 0.7)}${star(1210, 300, 16, "#ffe3b0", 0.6)}`);
  },
  sun() {
    let rays = ""; for (let i = 0; i < 16; i++) rays += `<g transform="rotate(${i * 22.5} 1200 190)"><rect x="1195" y="14" width="10" height="44" rx="5" fill="#ffd34d" opacity="0.9"/></g>`;
    let cells = ""; for (let i = 0; i < 4; i++) for (let j = 0; j < 6; j++) cells += `<polygon points="${f(180 + j * 74 + i * 26)},${f(330 + i * 52)} ${f(246 + j * 74 + i * 26)},${f(330 + i * 52)} ${f(228 + j * 74 + i * 26)},${f(376 + i * 52)} ${f(162 + j * 74 + i * 26)},${f(376 + i * 52)}" fill="#1d4f8f" stroke="#9cc7f0" stroke-width="3"/>`;
    let waves = ""; for (let i = 0; i < 5; i++) waves += `<path d="M0 ${560 + i * 30}Q200 ${535 + i * 30} 400 ${560 + i * 30}T800 ${560 + i * 30}T1200 ${560 + i * 30}T1600 ${560 + i * 30}V700H0Z" fill="#2b7fc4" opacity="${f(0.25 + i * 0.14)}"/>`;
    return svg(W, H, `<defs>${grad("b", [[0, "#9fd6f2"], [0.7, "#fbeec4"], [1, "#fff6dc"]])}${radial("s", [[0, "#fff3b0", 1], [1, "#ffd34d", 0]])}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/><circle cx="1200" cy="190" r="260" fill="url(#s)"/>${rays}<circle cx="1200" cy="190" r="118" fill="#ffc933"/>
      <path d="M0 520Q300 400 650 480T1300 470T1600 440V700H0Z" fill="#6fb26b"/><path d="M0 580Q380 480 800 550T1600 520V700H0Z" fill="#3f8f55"/>
      <rect x="236" y="470" width="14" height="110" fill="#33516e"/>${cells}
      <path d="M1050 480v-90h60v90" fill="none" stroke="#33516e" stroke-width="14" stroke-linecap="round"/><path d="M1110 395h120q40 0 40 36" fill="none" stroke="#33516e" stroke-width="14" stroke-linecap="round"/>
      ${waves}${drop(1272, 510, 1.5, "#8fd0ff")}${drop(1330, 545, 1, "#bfe6ff", 0.9)}${drop(1230, 548, 0.9, "#bfe6ff", 0.8)}`);
  },
  indigo() {
    const r = rng(7); const nodes = Array.from({ length: 46 }, () => [f(r() * W), f(r() * H), f(3 + r() * 7)]);
    let lines = ""; nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d < 230) lines += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#a5b4fc" stroke-opacity="${f(0.55 - d / 520)}" stroke-width="1.6"/>`; }));
    const dots = nodes.map((n) => `<circle cx="${n[0]}" cy="${n[1]}" r="${n[2]}" fill="#c7d2fe" opacity="0.85"/>`).join("");
    return svg(W, H, `<defs>${radial("b", [[0, "#4f46e5"], [1, "#0f0b3a"]])}${radial("h", [[0, "#fde68a", 0.55], [1, "#fde68a", 0]])}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/>${lines}${dots}<circle cx="800" cy="360" r="330" fill="url(#h)"/>
      <path d="M800 250C700 210 560 214 470 250V520C560 484 700 480 800 520Z" fill="#fef3c7"/><path d="M800 250C900 210 1040 214 1130 250V520C1040 484 900 480 800 520Z" fill="#fde68a"/>
      <path d="M800 250V520" stroke="#b45309" stroke-width="6"/>${[0, 1, 2, 3].map((i) => `<path d="M${520 + i * 4} ${300 + i * 44}C610 ${284 + i * 44} 700 ${290 + i * 44} 770 ${316 + i * 44}" stroke="#c4a15a" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>`).join("")}
      ${star(300, 160, 34, "#fde68a")}${star(1320, 140, 26, "#fff")}${star(1230, 560, 38, "#fde68a", 0.9)}${star(380, 560, 22, "#fff", 0.8)}`);
  },
  dusk() {
    const r = rng(3); let sky = ""; for (let i = 0; i < 26; i++) { const w = 40 + r() * 90, h = 80 + r() * 260; sky += `<rect x="${f(i * 64 - 20)}" y="${f(470 - h)}" width="${f(w)}" height="${f(h + 40)}" fill="#1a1a3d" opacity="${f(0.55 + r() * 0.4)}"/>`; }
    let dash = ""; for (let i = 0; i < 7; i++) { const t = i / 7, y = 390 + t * t * 310; dash += `<polygon points="${f(800 - 3 - t * 18)},${f(y)} ${f(800 + 3 + t * 18)},${f(y)} ${f(800 + 6 + (t + 0.09) * 26)},${f(y + 30 + t * 40)} ${f(800 - 6 - (t + 0.09) * 26)},${f(y + 30 + t * 40)}" fill="#fcd34d"/>`; }
    return svg(W, H, `<defs>${grad("b", [[0, "#1b1f4b"], [0.55, "#c4506a"], [1, "#f6c17a"]])}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/><circle cx="800" cy="330" r="170" fill="#ffd9a0" opacity="0.85"/>${sky}
      <polygon points="800,380 0,700 1600,700" fill="#23233f"/><polygon points="800,380 330,700 1270,700" fill="#2e2e52"/>${dash}
      <path d="M800 90c-48 0-86 38-86 86 0 66 86 160 86 160s86-94 86-160c0-48-38-86-86-86z" fill="#ef4444"/><circle cx="800" cy="176" r="32" fill="#fff"/>
      <path d="M200 650C420 560 520 470 800 430" fill="none" stroke="#fcd34d" stroke-width="6" stroke-dasharray="4 16" stroke-linecap="round" opacity=".8"/>${star(240, 120, 26, "#fff", 0.8)}${star(1380, 90, 20, "#fff", 0.7)}`);
  },
  field() {
    let rows = ""; for (let i = -8; i < 9; i++) { const c = i % 2 ? "#4f9d4b" : "#3b8240"; rows += `<polygon points="${1000 + i * 8},330 ${1000 + (i + 1) * 8},330 ${1000 + (i + 1) * 260 - 700 * 0.0},700 ${1000 + i * 260},700" fill="${c}"/>`; }
    let sunrays = ""; for (let i = 0; i < 9; i++) sunrays += `<polygon points="1000,120 ${420 + i * 150},0 ${470 + i * 150},0" fill="#fff6c9" opacity="0.18"/>`;
    return svg(W, H, `<defs>${grad("b", [[0, "#cfeec2"], [0.6, "#f6efc2"], [1, "#fff4c9"]])}${radial("s", [[0, "#fff6a8", 1], [1, "#ffe066", 0]])}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/>${sunrays}<circle cx="1000" cy="190" r="190" fill="url(#s)"/><circle cx="1000" cy="190" r="70" fill="#ffd23f"/>
      <path d="M0 330Q500 280 1000 330T1600 320V700H0Z" fill="#74b86a"/><g>${rows}</g>
      <path d="M0 330Q500 280 1000 330T1600 320V350H0Z" fill="#8cc47f" opacity=".6"/>
      <rect x="90" y="470" width="320" height="170" rx="14" fill="#a8693a"/><rect x="90" y="470" width="320" height="34" rx="10" fill="#c9824a"/><path d="M90 540h320M90 600h320" stroke="#8a5229" stroke-width="6"/>
      ${[[150, 452, "#e53935"], [215, 440, "#ef6c00"], [285, 452, "#e53935"], [350, 442, "#fbc02d"], [180, 428, "#ef6c00"], [320, 424, "#e53935"]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="34" fill="${c}"/><circle cx="${x - 10}" cy="${y - 12}" r="9" fill="#fff" opacity=".35"/>`).join("")}`);
  },
  grain() {
    const r = rng(21); let stalks = "";
    for (let s = 0; s < 14; s++) { const x = 60 + s * 118 + r() * 40, top = 150 + r() * 160, lean = (r() - 0.5) * 80; stalks += `<path d="M${f(x)} 700Q${f(x + lean / 2)} ${f((700 + top) / 2)} ${f(x + lean)} ${f(top)}" stroke="#a9742a" stroke-width="6" fill="none"/>`; for (let g = 0; g < 9; g++) { const ty = top + g * 24, tx = x + lean * (1 - g / 22); stalks += `<ellipse cx="${f(tx - 13)}" cy="${f(ty + 8)}" rx="8" ry="20" transform="rotate(-28 ${f(tx - 13)} ${f(ty + 8)})" fill="#e7b24a"/><ellipse cx="${f(tx + 13)}" cy="${f(ty + 8)}" rx="8" ry="20" transform="rotate(28 ${f(tx + 13)} ${f(ty + 8)})" fill="#f2c866"/>`; } }
    let crates = ""; for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) crates += `<g><rect x="${1080 + j * 150 + i * 75}" y="${500 - i * 96}" width="140" height="90" rx="6" fill="#b4793a"/><path d="M${1080 + j * 150 + i * 75} ${530 - i * 96}h140M${1080 + j * 150 + i * 75} ${560 - i * 96}h140" stroke="#8a5a26" stroke-width="5"/></g>`;
    return svg(W, H, `<defs>${grad("b", [[0, "#fbe08c"], [1, "#e0953a"]])}${radial("s", [[0, "#fff3b8", .9], [1, "#fff3b8", 0]])}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/><circle cx="1260" cy="150" r="300" fill="url(#s)"/>${stalks}<path d="M0 640Q400 600 800 640T1600 620V700H0Z" fill="#7c4a1c"/>${crates}`);
  },
  teal() {
    return svg(W, H, `<defs>${grad("b", [[0, "#073b46"], [1, "#22a79f"]], 1, 1)}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/>${[0, 1, 2].map((i) => `<rect x="${960 + i * 70}" y="${150 + i * 40}" width="360" height="270" rx="26" fill="#fff" opacity="${f(0.2 + i * 0.12)}" transform="rotate(${6 - i * 6} ${1140 + i * 70} ${285 + i * 40})"/>`).join("")}
      <rect x="1030" y="240" width="130" height="14" rx="7" fill="#0b6e75"/><rect x="1030" y="276" width="240" height="12" rx="6" fill="#9ad6d1"/><rect x="1030" y="306" width="200" height="12" rx="6" fill="#9ad6d1"/><rect x="1030" y="336" width="220" height="12" rx="6" fill="#9ad6d1"/>
      <path d="M270 190h90v90h90v90h-90v90h-90v-90h-90v-90h90Z" fill="#f7f4ea" transform="translate(40 40)"/>
      <polyline points="0,540 330,540 410,540 450,470 500,610 560,430 620,560 670,540 1600,540" fill="none" stroke="#f7f4ea" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" opacity=".92"/>
      ${star(760, 150, 30, "#fff", 0.8)}${star(120, 560, 22, "#fff", 0.6)}${star(1450, 600, 28, "#fff", 0.7)}`);
  },
  forest() {
    const box = (x, y, s, c1, c2, c3) => `<g transform="translate(${x} ${y})"><polygon points="0,${-s * 0.5} ${s * 0.87},${-s} ${s * 1.74},${-s * 0.5} ${s * 0.87},0" fill="${c1}"/><polygon points="0,${-s * 0.5} ${s * 0.87},0 ${s * 0.87},${s} 0,${s * 0.5}" fill="${c2}"/><polygon points="${s * 1.74},${-s * 0.5} ${s * 0.87},0 ${s * 0.87},${s} ${s * 1.74},${s * 0.5}" fill="${c3}"/></g>`;
    const pill = (x, y, a, c1, c2) => `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="-60" y="-22" width="120" height="44" rx="22" fill="${c2}"/><path d="M-60 0v0a22 22 0 0 1 22-22h38v44h-38a22 22 0 0 1-22-22z" fill="${c1}"/></g>`;
    return svg(W, H, `<defs>${grad("b", [[0, "#0d3b2c"], [1, "#2f8f5b"]], 1, 1)}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/>
      <path d="M120 600C420 520 520 380 780 420S1160 300 1420 180" fill="none" stroke="#bff0d4" stroke-width="7" stroke-dasharray="3 18" stroke-linecap="round"/>
      ${[[120, 600], [780, 420], [1420, 180]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="#fff"/><circle cx="${x}" cy="${y}" r="11" fill="#e63946"/>`).join("")}
      ${box(960, 520, 120, "#e9d8a6", "#c9b37c", "#a8935a")}${box(1130, 560, 100, "#d4f1e0", "#9bd1b3", "#76b392")}${box(990, 370, 100, "#fff", "#cfe9da", "#a9d3bd")}
      ${pill(300, 230, -25, "#fff", "#f4a259")}${pill(520, 150, 20, "#e63946", "#fff")}${pill(190, 380, 35, "#fff", "#7bd0a0")}${star(640, 560, 24, "#fff", 0.7)}${star(1480, 420, 30, "#fff", 0.6)}`);
  },
  plum() {
    let coins = ""; const r = rng(5); for (let i = 0; i < 9; i++) { const x = 120 + r() * 700, y = 80 + r() * 540, s = 30 + r() * 46; coins += `<g opacity="${f(0.55 + r() * 0.45)}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(s)}" fill="#f2b84b"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(s * 0.72)}" fill="none" stroke="#b9801c" stroke-width="3"/></g>`; }
    return svg(W, H, `<defs>${grad("b", [[0, "#2f0a45"], [0.6, "#a23b7b"], [1, "#f2a65a"]], 1, 1)}${grad("scr", [[0, "#fff4d6"], [1, "#ffd7a1"]])}</defs>
      <rect width="${W}" height="${H}" fill="url(#b)"/>${coins}
      ${[0, 1, 2].map((i) => `<path d="M${1040 - i * 70} 140A${130 + i * 70} ${130 + i * 70} 0 0 1 ${1040 + 130 + i * 70} 290" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="${f(0.7 - i * 0.2)}" transform="translate(240 -30)"/>`).join("")}
      <rect x="1000" y="170" width="300" height="480" rx="44" fill="#1c0a2b"/><rect x="1016" y="190" width="268" height="440" rx="30" fill="url(#scr)"/>
      <circle cx="1150" cy="330" r="62" fill="#a23b7b"/><path d="M1122 330l22 22 36-44" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="1050" y="430" width="200" height="16" rx="8" fill="#b06a8a" opacity=".6"/><rect x="1050" y="466" width="150" height="12" rx="6" fill="#b06a8a" opacity=".4"/><rect x="1050" y="540" width="200" height="54" rx="27" fill="#a23b7b"/>${star(300, 120, 28, "#fff", 0.8)}${star(900, 600, 22, "#fff", 0.6)}`);
  },
};

const LOGOS = {
  climate: (c) => svg(512, 512, `<defs>${grad("b", [[0, "#2f9e61"], [1, "#0f5132"]], 1, 1)}</defs><rect width="512" height="512" fill="url(#b)"/><circle cx="256" cy="230" r="150" fill="#fff4cf" opacity=".95"/><path d="M256 100C350 150 390 240 330 330c-30 44-74 64-74 64s-44-20-74-64C122 240 162 150 256 100Z" fill="#2f9e61"/><path d="M256 150v250" stroke="#fff4cf" stroke-width="12" stroke-linecap="round"/><path d="M256 250l50-50M256 300l-50-50M256 340l44-44" stroke="#fff4cf" stroke-width="10" stroke-linecap="round"/>`),
  uni: () => svg(512, 512, `<defs>${grad("b", [[0, "#2a3a8f"], [1, "#0f1b4d"]], 1, 1)}</defs><rect width="512" height="512" fill="url(#b)"/><polygon points="256,96 410,190 102,190" fill="#fde68a"/><rect x="112" y="204" width="288" height="24" fill="#fff4cf"/>${[0, 1, 2, 3].map((i) => `<rect x="${132 + i * 70}" y="240" width="38" height="150" rx="6" fill="#fff4cf"/>`).join("")}<rect x="102" y="400" width="308" height="30" rx="6" fill="#fde68a"/><circle cx="256" cy="156" r="18" fill="#2a3a8f"/>`),
  agri: () => svg(512, 512, `<defs>${grad("b", [[0, "#e9b44c"], [1, "#b46a1b"]], 1, 1)}</defs><rect width="512" height="512" fill="url(#b)"/><path d="M256 420V170" stroke="#fff6dc" stroke-width="14" stroke-linecap="round"/>${[0, 1, 2, 3, 4].map((i) => `<ellipse cx="226" cy="${200 + i * 42}" rx="16" ry="34" transform="rotate(-35 226 ${200 + i * 42})" fill="#fff6dc"/><ellipse cx="286" cy="${200 + i * 42}" rx="16" ry="34" transform="rotate(35 286 ${200 + i * 42})" fill="#fff6dc"/>`).join("")}<ellipse cx="256" cy="150" rx="16" ry="38" fill="#fff6dc"/><path d="M80 440q44-32 88 0t88 0 88 0 88 0" fill="none" stroke="#2c7a7b" stroke-width="16" stroke-linecap="round"/>`),
  health: () => svg(512, 512, `<defs>${grad("b", [[0, "#22a79f"], [1, "#0b4f5c"]], 1, 1)}</defs><rect width="512" height="512" fill="url(#b)"/><path d="M256 420C120 330 92 240 130 190c34-44 98-34 126 14 28-48 92-58 126-14 38 50 10 140-126 230Z" fill="#fff4ea"/><path d="M236 214h40v42h42v40h-42v42h-40v-42h-42v-40h42Z" fill="#e63946"/>`),
  fintech: () => svg(512, 512, `<defs>${grad("b", [[0, "#8b2a7b"], [1, "#2f0a45"]], 1, 1)}${radial("p", [[0, "#ffffff"], [0.6, "#f3e3f0"], [1, "#c9a3c4"]])}</defs><rect width="512" height="512" fill="url(#b)"/><circle cx="256" cy="256" r="150" fill="url(#p)"/><circle cx="215" cy="210" r="34" fill="#fff" opacity=".8"/><path d="M92 360C190 440 322 440 420 360" fill="none" stroke="#f2b84b" stroke-width="18" stroke-linecap="round"/><path d="M110 150C170 80 342 80 402 150" fill="none" stroke="#f2b84b" stroke-width="10" stroke-linecap="round" opacity=".7"/>`),
};

const THEME_ACCENT = { ember: "#d9531e", sun: "#e0a100", indigo: "#4338ca", dusk: "#c4506a", field: "#3b8240", grain: "#c47d1c", teal: "#0e8f8a", forest: "#1f7a4d", plum: "#a23b7b" };
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function deckHtml(team, idea, challenge, accent) {
  const slide = (inner, bg = "#fbf8f1", fg = "#161616") => `<section style="width:1280px;height:720px;box-sizing:border-box;padding:72px 88px;background:${bg};color:${fg};page-break-after:always;position:relative;overflow:hidden;font-family:Inter,sans-serif">${inner}<div style="position:absolute;left:88px;bottom:36px;font-size:15px;opacity:.55">${esc(team)} · ${esc(challenge)} · demo deck</div></section>`;
  const num = (n, label) => `<div style="flex:1"><div style="font-size:76px;font-weight:800;color:${accent};line-height:1">${n}</div><div style="font-size:22px;margin-top:10px;opacity:.8">${label}</div></div>`;
  return `<html><body style="margin:0">
  ${slide(`<div style="position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:${accent};opacity:.9"></div><div style="position:absolute;right:140px;bottom:90px;width:180px;height:180px;border-radius:50%;border:14px solid #fff;opacity:.6"></div><p style="font-size:22px;letter-spacing:.14em;text-transform:uppercase;opacity:.8;margin:90px 0 24px">${esc(challenge)}</p><h1 style="font-size:116px;line-height:1;margin:0;font-weight:800">${esc(team)}</h1><p style="font-size:36px;margin-top:28px;max-width:760px;line-height:1.3">${esc(idea)}</p>`, "#14120f", "#fbf8f1")}
  ${slide(`<p style="font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:${accent};font-weight:700">The problem</p><h2 style="font-size:60px;line-height:1.1;margin:12px 0 40px;max-width:900px">People feel this every day, and nothing affordable solves it.</h2><div style="display:flex;gap:48px;margin-top:70px">${num("3 in 4", "households affected in our pilot area")}${num("30%", "of income lost to the problem")}${num("0", "affordable local options today")}</div>`)}
  ${slide(`<p style="font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:${accent};font-weight:700">Our solution</p><h2 style="font-size:60px;line-height:1.1;margin:12px 0 36px;max-width:980px">${esc(idea)}</h2><ul style="font-size:32px;line-height:1.7;padding-left:36px;margin-top:32px"><li>Works on the phones and budgets people already have</li><li>Built and tested with real households and partners</li><li>Priced so it pays for itself within months</li></ul>`)}
  ${slide(`<p style="font-size:20px;letter-spacing:.14em;text-transform:uppercase;color:#fff;opacity:.85;font-weight:700">Traction and next steps</p><h2 style="font-size:64px;line-height:1.1;margin:12px 0 44px;max-width:900px">A working prototype today. A pilot in eight weeks.</h2><div style="display:flex;gap:48px;margin-top:40px"><div style="flex:1"><div style="font-size:64px;font-weight:800">20</div><div style="font-size:22px;opacity:.9">pilot users lined up</div></div><div style="flex:1"><div style="font-size:64px;font-weight:800">2</div><div style="font-size:22px;opacity:.9">partners signed</div></div><div style="flex:1"><div style="font-size:64px;font-weight:800">8</div><div style="font-size:22px;opacity:.9">weeks to pilot</div></div></div>`, accent, "#fff")}
  </body></html>`;
}

const browser = await chromium.launch();
const shoot = async (markup, w, h, file, opts) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<html><body style="margin:0">${markup}</body></html>`);
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h }, ...opts });
  await page.close();
};
for (const c of CHALLENGES) await shoot(COVERS[c.theme](), W, H, `covers/${slugOf(c.title)}.jpg`, { type: "jpeg", quality: 86 });
for (const o of ORGS) await shoot(LOGOS[o.key](), 512, 512, `logos/${o.key}.png`, { type: "png" });
let decks = 0;
for (const c of CHALLENGES) {
  if (c.stage !== "completed" && c.stage !== "judging") continue;
  for (let i = 0; i < Math.min(3, c.teams.length) + (c.stage === "judging" ? 1 : 0) && i < c.teams.length; i++) {
    const page = await browser.newPage();
    await page.setContent(deckHtml(c.teams[i][0], c.teams[i][1], c.title, THEME_ACCENT[c.theme]));
    await page.pdf({ path: path.join(OUT, `decks/${slugOf(c.title)}-${i}.pdf`), width: "1280px", height: "720px", printBackground: true });
    await page.close(); decks++;
  }
}
await browser.close();
console.log(`covers ${CHALLENGES.length}, logos ${ORGS.length}, decks ${decks} -> ${OUT}`);
