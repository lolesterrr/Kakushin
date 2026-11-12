// Small Wikimedia Commons helper: search for photos and read their license and credit. Used to pick demo images.
//   node scripts/demo/commons.mjs "uganda charcoal stove" [count]
const UA = "KakushinDemoImageFinder/1.0 (open-licensed demo images; contact via project repository)";
export const API = "https://commons.wikimedia.org/w/api.php";
export async function commons(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA } });
    // Commons rate limits shared addresses; wait as long as it asks and try again.
    if (r.status === 429) { await new Promise((s) => setTimeout(s, (Number(r.headers.get("retry-after")) || 20) * 1000 + 1500)); continue; }
    if (!r.ok) throw new Error(`Commons ${r.status}`);
    return r.json();
  }
  throw new Error("Commons rate limited");
}
const strip = (h) => String(h ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;/g, "'").trim();
const OK = /^(CC0|Public domain|PD|CC BY(-SA)? [0-9.]+|CC BY(-SA)?( [0-9.]+)?|Pexels|Unsplash)/i;

/** Returns photos (landscape, wide enough for a cover) with a license we can use and the details needed for credit. */
export async function findPhotos(query, { limit = 12, minWidth = 1600, thumbWidth = 1600 } = {}) {
  const j = await commons({
    action: "query", generator: "search", gsrsearch: `${query} filetype:bitmap`, gsrnamespace: "6", gsrlimit: String(limit * 2),
    prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: String(thumbWidth),
  });
  const out = [];
  for (const p of j.query?.pages ?? []) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const m = ii.extmetadata ?? {};
    const license = strip(m.LicenseShortName?.value);
    if (!/^(CC0|Public domain|PD|CC BY(-SA)?)/i.test(license) || /NC|ND/.test(license)) continue;
    if (!/^image\/(jpeg|png)$/.test(ii.mime) || ii.width < minWidth || ii.width / ii.height < 1.25) continue;
    out.push({ title: p.title, page: ii.descriptionurl, thumb: ii.thumburl, width: ii.width, height: ii.height, license, licenseUrl: strip(m.LicenseUrl?.value), author: strip(m.Artist?.value), desc: strip(m.ImageDescription?.value).slice(0, 110) });
    if (out.length >= limit) break;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const photos = await findPhotos(process.argv[2] ?? "uganda", { limit: Number(process.argv[3] ?? 10) });
  for (const p of photos) console.log(`${p.title} | ${p.width}x${p.height} | ${p.license} | ${p.author.slice(0, 40)} | ${p.desc}`);
}
