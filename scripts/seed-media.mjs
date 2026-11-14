// Example media for trying out pitches, project pages, judging and the event recap.
// Run: npx wrangler dev  (in one terminal), then: node scripts/seed-media.mjs
// Optional: SEED_VIDEOS="https://youtu.be/aaa,https://youtu.be/bbb" puts your YouTube links on the first teams.
//
// It signs demo people in by writing codes into the LOCAL database, so it only runs against a local server.
// Photos are from Wikimedia Commons (see scripts/seed-media/credits.json); app screens are drawn for this demo.
// Some teams get no media at all on purpose, so pages can be checked without it.
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";

const U = process.env.SEED_URL ?? "http://localhost:8787";
if (!/localhost|127\.0\.0\.1/.test(U)) throw new Error("The seed script only runs against a local server");
const P = `demo${Date.now().toString(36).slice(-4)}`;
const DIR = "scripts/seed-media";
const videos = (process.env.SEED_VIDEOS ?? "").split(",").map((v) => v.trim()).filter(Boolean);
const sql = (q) => execSync(`npx wrangler d1 execute kakushin --local --json --command "${q.replace(/"/g, '\\"')}"`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
const DAY = 86400000, now = Date.now();

async function person(name, extra = {}) {
  const email = `${P}-${name.toLowerCase().replace(/[^a-z]/g, "")}@example.com`;
  sql(`INSERT INTO login_tokens (token_hash, kind, email, expires_at) VALUES ('${crypto.createHash("sha256").update(`${email}:123456`).digest("hex")}', 'code', '${email}', ${now + 600000})`);
  let r;
  for (let i = 0; i < 12; i++) {
    r = await fetch(`${U}/api/auth/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, code: "123456" }) });
    if (r.status !== 429) break;
    await new Promise((ok) => setTimeout(ok, 10000));
  }
  const tok = /kk_session=([^;]+)/.exec(r.headers.get("set-cookie") ?? "")?.[1];
  if (!tok) throw new Error(`could not sign in ${email}`);
  const call = async (path, method = "GET", json) => {
    const res = await fetch(`${U}/api${path}`, { method, headers: { "content-type": "application/json", cookie: `kk_session=${tok}` }, body: json === undefined ? undefined : JSON.stringify(json) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) console.warn(`  ${method} ${path} -> ${res.status} ${d.error ?? ""}`);
    return d;
  };
  call.image = async (path, file, caption = "") => {
    const type = file.endsWith(".png") ? "image/png" : "image/jpeg";
    const res = await fetch(`${U}/api${path}`, { method: "POST", headers: { "content-type": type, "x-caption": encodeURIComponent(caption), cookie: `kk_session=${tok}` }, body: fs.readFileSync(`${DIR}/${file}`) });
    if (!res.ok) console.warn(`  upload ${file} -> ${res.status}`);
  };
  call.email = email;
  await call("/me", "PUT", { name, skills: [], ...extra });
  return call;
}

// Teams from different places, with different amounts of media.
const TEAMS = [
  { name: "Chama Ledger", lead: ["Wanjiru Kamau", "Nairobi, Kenya"], mates: [["Otieno Ouma", "Kisumu, Kenya"]], place: 1,
    notes: "Savings groups keep their books in a notebook. Chama Ledger records every deposit and loan by mobile money, so members can check the balance from any phone.",
    shots: [["screens/wallet.png", "group balance at a glance"], ["screens/market.png", "price alerts for members who trade"]] },
  { name: "Rain Ready", lead: ["Priya Raman", "Bengaluru, India"], mates: [["Arjun Nair", "Kochi, India"], ["Meera Iyer", "Chennai, India"]], place: 2,
    notes: "Farmers report rain by missed call. We combine those reports with the forecast and text each farmer when to plant.",
    shots: [["screens/calendar.png", "planting calendar"], ["students-bangalore.jpg", "testing with students in Bengaluru"]] },
  { name: "Clinic Line", lead: ["Chanda Mwale", "Lusaka, Zambia"], mates: [["Bwalya Phiri", "Ndola, Zambia"]], place: 3,
    notes: "A text-message queue for health centres, so mothers wait at home instead of on the bench.",
    shots: [["screens/clinic.png", "your place in the queue"]] },
  { name: "Ruta Libre", lead: ["Camila Rojas", "Bogotá, Colombia"], mates: [], place: null,
    notes: "Live seat counts for university buses, from a cheap sensor at the door.",
    shots: [["screens/transit.png", "next bus and free seats"]] },
  { name: "Study Circle", lead: ["Elif Demir", "İzmir, Türkiye"], mates: [["Mert Kaya", "Ankara, Türkiye"]], place: null,
    notes: "", shots: [["screens/tutor.png", ""]] },
  // No media and no notes on purpose: its page and card must still look right.
  { name: "Night Shift", lead: ["Lucas Silva", "Recife, Brazil"], mates: [], place: null, notes: "", shots: [] },
];

console.log(`Seeding demo data as ${P}-*@example.com ...`);
const organiser = await person("Amara Okafor", { location: "Lagos, Nigeria" });
const ORG = `${P}-labs`;
await organiser("/orgs", "POST", { name: "Open Campus Labs", slug: ORG, type: "university", website: "https://example.org" });
sql(`UPDATE organizations SET verified = 1 WHERE slug = '${ORG}'`);
await organiser(`/orgs/${ORG}/challenges`, "POST", { title: "Campus Fintech and Climate Jam" });
const C = "campus-fintech-and-climate-jam", B = `/orgs/${ORG}/challenges/${C}`;
await organiser(B, "PUT", {
  title: "Campus Fintech and Climate Jam", summary: "One weekend to build money and climate tools for students and their families.",
  description: "Teams from six countries built working prototypes in 31 hours.", status: "open", team_min: 1, team_max: 4, applications_close_at: now + DAY,
});
await organiser(`${B}/criteria`, "PUT", { criteria: [{ name: "Problem fit", weight: 40, max_score: 10 }, { name: "Working demo", weight: 40, max_score: 10 }, { name: "Pitch", weight: 20, max_score: 10 }] });

const ids = [];
for (const [i, t] of TEAMS.entries()) {
  const lead = await person(t.lead[0], { location: t.lead[1] });
  await lead(`${B}/team`, "POST", { name: t.name });
  const team = (await lead(`${B}/team`)).team;
  for (const [n, loc] of t.mates) {
    const m = await person(n, { location: loc });
    sql(`INSERT OR IGNORE INTO team_members (team_id, user_id, joined_at) SELECT '${team.id}', id, ${now} FROM users WHERE email = '${m.email}'`);
  }
  sql(`UPDATE teams SET status = 'finalist' WHERE id = '${team.id}'`);
  if (t.notes || videos[i]) await lead(`/teams/${team.id}/pitch`, "PUT", { video_url: videos[i] ?? "", notes: t.notes });
  for (const [file, cap] of t.shots) await lead.image(`/teams/${team.id}/pitch/images`, file, cap);
  ids.push({ team, lead, t });
  console.log(`  ${t.name}: ${t.shots.length} images${videos[i] ? ", video" : ""}`);
}

// Event photos for the recap, from hackathons and classrooms in several countries.
sql(`UPDATE challenges SET status = 'judging' WHERE org_id = (SELECT id FROM organizations WHERE slug = '${ORG}') AND slug = '${C}'`);
const PHOTOS = [
  ["hackathon-la-2014.jpg", "opening night. a full arena"], ["hackathon-team-2024.jpg", "first demo that ran"], ["students-zambia.jpg", "workshop for first-timers"],
  ["hackathon-eth-zurich.jpg", "2 AM debugging"], ["students-computer.jpg", "user testing in the library"], ["hackathon-turkey-2025.jpg", "mentors on the terrace"],
];
for (const [file, cap] of PHOTOS) await organiser.image(`${B}/photos`, file, cap);
await ids[1].lead.image(`${B}/photos`, "students-laptop.jpg", "our table, hour 20"); // waits for approval

sql(`UPDATE challenges SET status = 'completed' WHERE org_id = (SELECT id FROM organizations WHERE slug = '${ORG}') AND slug = '${C}'`);
for (const { team, t } of ids) if (t.place) sql(`UPDATE teams SET status = 'winner', placement = ${t.place} WHERE id = '${team.id}'`);
await organiser(`${B}/results/publish`, "POST");
for (const { team, lead } of ids) await lead(`/teams/${team.id}/showcase`, "PUT", { show: true });

console.log(`\nDone. Open:\n  ${U}/o/${ORG}/c/${C}           (results, project cards, recap)`);
console.log(`  ${U}/o/${ORG}/c/${C}/p/${ids[0].team.id}   (a project page)`);
console.log(`  ${U}/o/${ORG}/c/${C}/p/${ids[5].team.id}   (a project with no media)`);
