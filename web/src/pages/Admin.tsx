import React, { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api, confirmStageMove, fmtDate, fromLocalInput, toLocalInput, uploadImage } from "../api";
import { useAuth } from "../auth";
import { Band, Banner, Logo, Notice, Tag } from "../ui";
import { AnnounceBox, OrgMembers } from "./OrgTeam";
import { MarkdownField } from "../markdown";

const ORG_TYPES = ["university", "hub", "corporate", "partner", "other"];
const STATUSES = ["draft", "open", "reviewing", "judging", "completed"];
export const challengeTabs = (slug: string, cslug: string) => [
  { to: `/admin/o/${slug}/c/${cslug}`, label: "Overview", end: true },
  { to: `/admin/o/${slug}/c/${cslug}/applications`, label: "Applications" },
  { to: `/admin/o/${slug}/c/${cslug}/judging`, label: "Judging" },
  { to: `/admin/o/${slug}/c/${cslug}/messages`, label: "Messages" },
  { to: `/admin/o/${slug}/c/${cslug}/live`, label: "Event day" },
  { to: `/admin/o/${slug}/c/${cslug}/results`, label: "Results" },
  { to: `/admin/o/${slug}/c/${cslug}/edit`, label: "Edit" },
];
type Msg = { kind: "ok" | "err"; text: string } | null;

function useGuard(path: string) {
  const { me } = useAuth();
  return me ? null : <Navigate to={`/login?next=${path}`} replace />;
}

interface OrgSummary { slug: string; name: string; type: string; logo_url: string | null; role: string }

export function AdminHome() {
  const guard = useGuard("/admin");
  const nav = useNavigate();
  const [orgs, setOrgs] = useState<OrgSummary[] | null>(null);
  const [form, setForm] = useState({ name: "", type: "hub", slug: "", website: "" });
  const [msg, setMsg] = useState<Msg>(null);
  useEffect(() => { if (!guard) api<{ orgs: OrgSummary[] }>("/orgs/mine").then((r) => setOrgs(r.orgs)).catch(() => setOrgs([])); }, [guard]);
  if (guard) return guard;
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await api<{ slug: string }>("/orgs", { method: "POST", json: { name: form.name, type: form.type, website: form.website, ...(form.slug ? { slug: form.slug } : {}) } });
      nav(`/admin/o/${r.slug}`);
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  return (
    <>
      <Band title="Your organisations" tags={<span>Where your challenges live</span>} />
      {orgs && orgs.length > 0 && (
        <div className="grid">
          {orgs.map((o) => (
            <Link key={o.slug} to={`/admin/o/${o.slug}`} className="cell card-link"><div className="cell-body" style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <Logo url={o.logo_url} name={o.name} size={44} /><div><h3>{o.name}</h3><span className="muted">{o.type} · {o.role}</span></div>
            </div></Link>
          ))}
        </div>
      )}
      <div className="section form">
        <h2>{orgs && orgs.length > 0 ? "Create another organisation" : "Create your organisation"}</h2>
        <p className="muted">This is the public home for your challenges, like a university, hub or company.</p>
        <form onSubmit={create}>
          <label htmlFor="n">Name</label><input id="n" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="row">
            <div><label htmlFor="t">Type</label><select id="t" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{ORG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label htmlFor="s">Web address (optional)</label><input id="s" placeholder="mutic-hub" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></div>
          </div>
          <label htmlFor="w">Website (optional)</label><input id="w" type="url" placeholder="https://" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <div className="actions"><button type="submit">Create organisation</button></div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      </div>
    </>
  );
}

interface OrgData {
  org: { slug: string; name: string; type: string; website: string | null; logo_url: string | null };
  role: string | null;
  challenges: { slug: string; title: string; status: string; applications_close_at: number | null; review_state?: string }[];
}

export function AdminOrg() {
  const { slug } = useParams();
  const guard = useGuard(`/admin/o/${slug}`);
  const nav = useNavigate();
  const [data, setData] = useState<OrgData | null>(null);
  const [form, setForm] = useState({ name: "", type: "other", website: "" });
  const [msg, setMsg] = useState<Msg>(null);
  const [newTitle, setNewTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const load = () => api<OrgData>(`/orgs/${slug}`).then((d) => { setData(d); setForm({ name: d.org.name, type: d.org.type, website: d.org.website ?? "" }); }).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  useEffect(() => { if (!guard) void load(); }, [slug, guard]);
  if (guard) return guard;
  if (!data) return msg ? <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div> : null;
  if (!data.role) return <div className="section"><Notice kind="err">You are not an admin of this organisation.</Notice></div>;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await api(`/orgs/${slug}`, { method: "PUT", json: form }); setMsg({ kind: "ok", text: "Saved" }); await load(); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function logo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      await uploadImage(`/orgs/${slug}/logo`, f);
      // Certificates print a small JPEG copy, which is cheap for the server to put in a PDF. Best effort.
      const print = await printCopy(f).catch(() => null);
      if (print) await uploadImage(`/orgs/${slug}/logo/print`, print).catch(() => {});
      setMsg({ kind: "ok", text: "Logo updated" }); await load();
    }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    e.target.value = "";
  }
  async function createChallenge(e: React.FormEvent) {
    e.preventDefault();
    try { const r = await api<{ slug: string }>(`/orgs/${slug}/challenges`, { method: "POST", json: { title: newTitle } }); nav(`/admin/o/${slug}/c/${r.slug}/edit`); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  const { org, challenges } = data;
  return (
    <>
      <Band crumb="All organisations" to="/admin" title={org.name} tags={<><span className="tag">{org.type}</span><Link to={`/o/${org.slug}`} style={{ color: "inherit" }}>View public page</Link></>} />
      <div className="section">
        <div className="head-row"><h2>Challenges</h2><Link className="btn ghost small" to={`/admin/o/${slug}/impact`}>Impact report</Link></div>
        {challenges.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Title</th><th>Status</th><th>Closes</th><th></th></tr></thead>
            <tbody>{challenges.map((c) => (
              <tr key={c.slug}><td><Link to={`/admin/o/${slug}/c/${c.slug}`}>{c.title}</Link></td><td><Tag status={c.status === "draft" && c.review_state === "pending" ? "pending" : c.status === "draft" && c.review_state === "rejected" ? "rejected_review" : c.status} /></td><td>{fmtDate(c.applications_close_at)}</td><td>{c.status !== "draft" && <Link to={`/admin/o/${slug}/c/${c.slug}/applications`}>Applications</Link>}</td></tr>
            ))}</tbody>
          </table></div>
        )}
        {challenges.length === 0 && <p className="muted">No challenges yet. Give your first one a title below, then fill in the details.</p>}
        <form onSubmit={createChallenge} className="form" style={{ marginTop: 16 }}>
          <label htmlFor="ct">New challenge title</label>
          <div style={{ display: "flex", gap: 8 }}><input id="ct" required minLength={3} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Fintech for farmers" /><button type="submit">Create</button></div>
        </form>
      </div>
      <AnnounceBox listPath={`/orgs/${slug}/announcements`} postPath={`/orgs/${slug}/announcements`} heading="Announcements" hint="Send a note to everyone who follows this organisation. It shows in their inbox and pings their phone. Up to 5 a day."
        audience={(r) => `${r.followers ?? 0} ${r.followers === 1 ? "person follows" : "people follow"} you right now.`} />
      <OrgMembers slug={slug!} />
      <div className="section form">
        <h2>Organisation settings</h2>
        <form onSubmit={save}>
          <label htmlFor="on">Name</label><input id="on" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="row">
            <div><label htmlFor="ot">Type</label><select id="ot" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{ORG_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
            <div><label htmlFor="ow">Website</label><input id="ow" type="url" placeholder="https://" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
          </div>
          <label>Logo (PNG, JPEG or WebP, up to 2 MB)</label>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={logo} aria-label="Upload logo" />
          <div className="actions"><button type="submit">Save</button></div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      </div>
    </>
  );
}

interface Question { id?: string; label: string; type: string; required: boolean; options: string[] }
interface Sponsor { name: string; url: string; logo_key: string | null; logo_url: string | null }
interface Form {
  title: string; summary: string; description: string; prizes: string; status: string; team_min: number; team_max: number;
  opens: string; closes: string; pitch: string; topics: string[]; questions: Question[]; cover_url: string | null;
  rules: string; faq: { q: string; a: string }[]; sponsors: Sponsor[]; timeline: { label: string; at: string }[]; show_judges: boolean;
}

export function AdminChallenge() {
  const { slug, cslug } = useParams();
  const guard = useGuard(`/admin/o/${slug}/c/${cslug}/edit`);
  const nav = useNavigate();
  const [f, setF] = useState<Form | null>(null);
  const [allTopics, setAllTopics] = useState<string[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [wasDraft, setWasDraft] = useState(true);
  const [liveStatus, setLiveStatus] = useState("draft"); // the stage as last saved, to spot a move back
  const [review, setReview] = useState<{ state: string; note: string }>({ state: "none", note: "" });
  useEffect(() => {
    if (guard) return;
    api<{ topics: string[] }>("/challenges/topics").then((r) => setAllTopics(r.topics)).catch(() => {});
    api<{ challenge: any; role: string | null }>(`/orgs/${slug}/challenges/${cslug}`).then(({ challenge: c, role }) => {
      if (!role) { setMsg({ kind: "err", text: "You are not an admin of this organisation." }); return; }
      setReview({ state: c.review_state ?? "none", note: c.review_note ?? "" });
      setWasDraft(c.status === "draft"); setLiveStatus(c.status);
      setF({
        title: c.title, summary: c.summary, description: c.description, prizes: c.prizes, status: c.status, team_min: c.team_min, team_max: c.team_max,
        opens: toLocalInput(c.applications_open_at), closes: toLocalInput(c.applications_close_at), pitch: toLocalInput(c.pitch_due_at),
        topics: c.topics, questions: c.questions, cover_url: c.cover_url,
        rules: c.rules ?? "", faq: c.faq ?? [], show_judges: !!c.show_judges,
        sponsors: (c.sponsors ?? []).map((x: Sponsor) => ({ name: x.name, url: x.url ?? "", logo_key: x.logo_key, logo_url: x.logo_url })),
        timeline: (c.timeline ?? []).map((x: { label: string; at: number }) => ({ label: x.label, at: toLocalInput(x.at) })),
      });
    }).catch((e: Error) => setMsg({ kind: "err", text: e.message }));
  }, [slug, cslug, guard]);
  if (guard) return guard;
  if (!f) return msg ? <div className="section"><Notice kind={msg.kind}>{msg.text}</Notice></div> : null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const setQ = (i: number, patch: Partial<Question>) => set("questions", f.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => {
    const qs = [...f.questions]; const j = i + d; if (j < 0 || j >= qs.length) return;
    [qs[i], qs[j]] = [qs[j]!, qs[i]!]; set("questions", qs);
  };

  async function save(status = f!.status) {
    if (wasDraft && status !== "draft" && !f!.cover_url) { setMsg({ kind: "err", text: "Add a banner before publishing. It is the first thing people see." }); return; }
    if (f!.timeline.some((x) => !x.label.trim() !== !x.at)) { setMsg({ kind: "err", text: "Give every timeline date both a label and a time, or remove it." }); return; }
    const reopen = confirmStageMove(liveStatus, status);
    if (reopen === null) return;
    setSaving(true); setMsg(null);
    try {
      const res = await api<{ pending?: boolean }>(`/orgs/${slug}/challenges/${cslug}`, { method: "PUT", json: {
        title: f!.title, summary: f!.summary, description: f!.description, prizes: f!.prizes, status,
        team_min: Number(f!.team_min), team_max: Number(f!.team_max),
        applications_open_at: fromLocalInput(f!.opens), applications_close_at: fromLocalInput(f!.closes), pitch_due_at: fromLocalInput(f!.pitch),
        topics: f!.topics,
        questions: f!.questions.map((q) => ({ ...q, options: q.type === "choice" ? q.options.filter(Boolean) : [] })),
        rules: f!.rules, faq: f!.faq, show_judges: f!.show_judges,
        sponsors: f!.sponsors.map((x) => ({ name: x.name, url: x.url || null, logo_key: x.logo_key })),
        timeline: f!.timeline.filter((x) => x.label.trim() && x.at).map((x) => ({ label: x.label, at: fromLocalInput(x.at) ?? 0 })),
        ...(reopen ? { reopen } : {}),
      } });
      if (res.pending) {
        setF({ ...f!, status: "draft" }); setReview({ state: "pending", note: "" });
        setMsg({ kind: "ok", text: "Sent for review. The Kakushin team checks new challenges before they go public, and you will get a note in your inbox." });
      } else {
        setF({ ...f!, status }); setLiveStatus(status); if (status !== "draft") setWasDraft(false);
        setMsg({ kind: "ok", text: status === "open" && f!.status !== "open" ? "Published. Share the link below." : "Saved" });
      }
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    setSaving(false);
  }
  async function cover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try { const r = await uploadImage<{ cover_url: string }>(`/orgs/${slug}/challenges/${cslug}/cover`, file); set("cover_url", r.cover_url); setMsg({ kind: "ok", text: "Banner updated" }); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
    e.target.value = "";
  }
  async function sponsorLogo(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    try {
      const r = await uploadImage<{ logo_key: string; logo_url: string }>(`/orgs/${slug}/challenges/${cslug}/sponsor-logo`, file);
      set("sponsors", f!.sponsors.map((x, j) => (j === i ? { ...x, logo_key: r.logo_key, logo_url: r.logo_url } : x)));
      setMsg({ kind: "ok", text: "Logo added. Save to keep it." });
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function duplicate() {
    if (!confirm("Make a new draft from this challenge? It copies the text, questions, both rubrics, sponsors and FAQ. Dates, the banner, teams and judges stay here.")) return;
    try { const r = await api<{ slug: string }>(`/orgs/${slug}/challenges/${cslug}/duplicate`, { method: "POST" }); nav(`/admin/o/${slug}/c/${r.slug}/edit`); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  async function remove() {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    try { await api(`/orgs/${slug}/challenges/${cslug}`, { method: "DELETE" }); nav(`/admin/o/${slug}`); }
    catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  const publicUrl = `${window.location.origin}/o/${slug}/c/${cslug}`;
  async function copy() { try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ } }

  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title={f.title || "Untitled challenge"} tags={<Tag status={f.status === "draft" && review.state === "pending" ? "pending" : f.status} />} tabs={challengeTabs(slug!, cslug!)} />
      {f.status !== "draft" && (
        <div className="section"><div className="actions" style={{ marginTop: 0 }}><input readOnly value={publicUrl} aria-label="Public link" style={{ maxWidth: 420 }} onFocus={(e) => e.target.select()} /><button className="ghost" onClick={copy}>{copied ? "Copied" : "Copy link"}</button><Link className="btn ghost" to={`/o/${slug}/c/${cslug}`}>View page</Link></div></div>
      )}

      <div className="section form">
        <h2>Basics</h2>
        <label htmlFor="t">Title</label><input id="t" value={f.title} onChange={(e) => set("title", e.target.value)} />
        <label htmlFor="su">One-line summary (shown on cards)</label><input id="su" maxLength={200} value={f.summary} onChange={(e) => set("summary", e.target.value)} />
        <MarkdownField id="d" label="Description" rows={10} value={f.description} onChange={(v) => set("description", v)} uploadPath={`/orgs/${slug}/challenges/${cslug}/images`} />
        <MarkdownField id="p" label="Prizes" rows={4} maxLength={5000} value={f.prizes} onChange={(v) => set("prizes", v)} hint="The first line shows on cards, so start with the main prize." />
        <label htmlFor="banner">Banner</label>
        <p className="muted" style={{ margin: "0 0 10px" }}>Every challenge needs a banner. It is the first thing people see on the app and the website. PNG, JPEG or WebP, up to 4 MB, best at 1600 by 500 pixels.</p>
        <div className="banner-preview"><Banner url={f.cover_url} seed={cslug ?? "challenge"} alt={f.cover_url ? "Current banner" : ""} /></div>
        {!f.cover_url && <p className="note-box">No banner yet, so people will see an illustration. Add one to publish.</p>}
        <input id="banner" type="file" accept="image/png,image/jpeg,image/webp" onChange={cover} style={{ marginTop: 10 }} />
        <label>Topics (up to 5)</label>
        <div className="pills">{allTopics.map((t) => {
          const on = f.topics.includes(t);
          return <button type="button" key={t} aria-pressed={on} className={`pill ${on ? "on" : ""}`} onClick={() => set("topics", on ? f.topics.filter((x) => x !== t) : [...f.topics, t].slice(0, 5))}>{t}</button>;
        })}</div>
      </div>

      <div className="section form">
        <h2>Rules and FAQ</h2>
        <MarkdownField id="ru" label="Rules" rows={8} value={f.rules} onChange={(v) => set("rules", v)} uploadPath={`/orgs/${slug}/challenges/${cslug}/images`} hint="Who can take part, what to build, what is not allowed. Same formatting as the description." />
        <label>Frequently asked questions</label>
        {f.faq.map((x, i) => (
          <div className="qcard" key={i}>
            <label htmlFor={`fq${i}`} style={{ marginTop: 0 }}>Question {i + 1}</label><input id={`fq${i}`} maxLength={200} value={x.q} onChange={(e) => set("faq", f.faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} />
            <label htmlFor={`fa${i}`}>Answer</label><textarea id={`fa${i}`} rows={3} maxLength={2000} value={x.a} onChange={(e) => set("faq", f.faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} />
            <div className="actions" style={{ marginTop: 10 }}><button type="button" className="ghost small" onClick={() => set("faq", f.faq.filter((_, j) => j !== i))}>Remove</button></div>
          </div>
        ))}
        <button type="button" className="ghost" disabled={f.faq.length >= 30} onClick={() => set("faq", [...f.faq, { q: "", a: "" }])}>Add a question</button>
      </div>

      <div className="section form">
        <h2>Sponsors</h2>
        <p className="muted">Shown with their logo on the challenge page. Logos are PNG, JPEG or WebP, up to 1 MB.</p>
        {f.sponsors.map((x, i) => (
          <div className="qcard" key={i}>
            <div className="row">
              <div><label htmlFor={`sn${i}`} style={{ marginTop: 0 }}>Name</label><input id={`sn${i}`} maxLength={80} value={x.name} onChange={(e) => set("sponsors", f.sponsors.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} /></div>
              <div><label htmlFor={`su${i}`} style={{ marginTop: 0 }}>Website (optional)</label><input id={`su${i}`} type="url" placeholder="https://" value={x.url} onChange={(e) => set("sponsors", f.sponsors.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} /></div>
            </div>
            <label htmlFor={`sl${i}`}>Logo</label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>{x.logo_url && <img src={x.logo_url} alt="" style={{ height: 40, maxWidth: 120, objectFit: "contain" }} />}<input id={`sl${i}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void sponsorLogo(i, e)} /></div>
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="ghost small" disabled={i === 0} onClick={() => { const a = [...f.sponsors]; [a[i - 1], a[i]] = [a[i]!, a[i - 1]!]; set("sponsors", a); }}>Up</button>
              <button type="button" className="ghost small" onClick={() => set("sponsors", f.sponsors.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" className="ghost" disabled={f.sponsors.length >= 20} onClick={() => set("sponsors", [...f.sponsors, { name: "", url: "", logo_key: null, logo_url: null }])}>Add a sponsor</button>
      </div>

      <div className="section form">
        <h2>Timeline and teams</h2>
        <div className="row">
          <div><label htmlFor="o">Applications open</label><input id="o" type="datetime-local" value={f.opens} onChange={(e) => set("opens", e.target.value)} /></div>
          <div><label htmlFor="c">Applications close</label><input id="c" type="datetime-local" value={f.closes} onChange={(e) => set("closes", e.target.value)} /></div>
          <div><label htmlFor="pi">Pitch due</label><input id="pi" type="datetime-local" value={f.pitch} onChange={(e) => set("pitch", e.target.value)} /></div>
        </div>
        <div className="row">
          <div><label htmlFor="mn">Smallest team</label><input id="mn" type="number" min={1} max={20} value={f.team_min} onChange={(e) => set("team_min", Number(e.target.value))} /></div>
          <div><label htmlFor="mx">Largest team</label><input id="mx" type="number" min={1} max={20} value={f.team_max} onChange={(e) => set("team_max", Number(e.target.value))} /></div>
        </div>
        <label>More dates for the timeline</label>
        <p className="muted" style={{ marginTop: 0 }}>The application and pitch dates above are on the page already. Add others, such as an info session or demo day.</p>
        {f.timeline.map((x, i) => (
          <div className="row" key={i} style={{ alignItems: "end" }}>
            <div><label htmlFor={`tl${i}`}>What happens</label><input id={`tl${i}`} maxLength={80} placeholder="Info session" value={x.label} onChange={(e) => set("timeline", f.timeline.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /></div>
            <div><label htmlFor={`ta${i}`}>When</label><input id={`ta${i}`} type="datetime-local" value={x.at} onChange={(e) => set("timeline", f.timeline.map((y, j) => (j === i ? { ...y, at: e.target.value } : y)))} /></div>
            <div><button type="button" className="ghost small" onClick={() => set("timeline", f.timeline.filter((_, j) => j !== i))}>Remove</button></div>
          </div>
        ))}
        <div className="actions"><button type="button" className="ghost" disabled={f.timeline.length >= 20} onClick={() => set("timeline", [...f.timeline, { label: "", at: "" }])}>Add a date</button></div>
        <label className="check" style={{ marginTop: 20 }}><input type="checkbox" checked={f.show_judges} onChange={(e) => set("show_judges", e.target.checked)} />Show judges on the page</label>
        <p className="muted" style={{ marginTop: 4 }}>Only judges who add a display name on their judging page appear, with their title. Their email is never shown.</p>
      </div>

      <div className="section form">
        <h2>Application questions</h2>
        <p className="muted">Applicants answer these when they apply. Name and email come from their profile.</p>
        {f.questions.map((q, i) => (
          <div className="qcard" key={q.id ?? i}>
            <div className="row">
              <div><label htmlFor={`ql${i}`} style={{ marginTop: 0 }}>Question {i + 1}</label><input id={`ql${i}`} value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} /></div>
              <div><label htmlFor={`qt${i}`} style={{ marginTop: 0 }}>Answer type</label>
                <select id={`qt${i}`} value={q.type} onChange={(e) => setQ(i, { type: e.target.value })}>
                  <option value="short_text">Short text</option><option value="long_text">Long text</option><option value="choice">Choice</option><option value="url">Link</option>
                </select></div>
            </div>
            {q.type === "choice" && (<><label htmlFor={`qo${i}`}>Options (one per line)</label><textarea id={`qo${i}`} rows={3} value={q.options.join("\n")} onChange={(e) => setQ(i, { options: e.target.value.split("\n") })} /></>)}
            <label className="check"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} />Required</label>
            <div className="actions" style={{ marginTop: 10 }}>
              <button type="button" className="ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">Up</button>
              <button type="button" className="ghost small" onClick={() => move(i, 1)} disabled={i === f.questions.length - 1} aria-label="Move down">Down</button>
              <button type="button" className="ghost small" onClick={() => set("questions", f.questions.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </div>
        ))}
        <button type="button" className="ghost" onClick={() => set("questions", [...f.questions, { label: "", type: "short_text", required: false, options: [] }])} disabled={f.questions.length >= 20}>Add a question</button>
      </div>

      <div className="section form">
        <h2>Status</h2>
        <label htmlFor="st">Stage</label>
        <select id="st" value={f.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <p className="muted">Drafts are hidden from everyone but your admins. Open challenges appear on Explore.</p>
        {f.status === "draft" && review.state === "pending" && <Notice kind="ok">Waiting for review. The Kakushin team is checking this challenge. You can keep editing, and you will get a note in your inbox when it is decided.</Notice>}
        {f.status === "draft" && review.state === "rejected" && <Notice kind="err">Changes needed before this can go live: {review.note}</Notice>}
        {f.status === "draft" && review.state !== "pending" && <p className="muted">Publishing sends the challenge to the Kakushin team for a quick check before it goes public.</p>}
        <div className="actions">
          <button onClick={() => save()} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          {f.status === "draft" && review.state !== "pending" && <button className="ghost" onClick={() => save("open")} disabled={saving}>{review.state === "rejected" ? "Send for review again" : "Publish"}</button>}
          {f.status === "draft" && !f.cover_url && <span className="muted">Add a banner above to publish.</span>}
          <button className="ghost" onClick={duplicate} disabled={saving}>Duplicate</button>
          {f.status === "draft" && <button className="ghost" onClick={remove}>Delete draft</button>}
        </div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </div>
    </>
  );
}

/** A 256-pixel JPEG of the logo on the certificate's paper colour (JPEG has no transparency). */
async function printCopy(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, fail) => { img.onload = () => ok(); img.onerror = () => fail(new Error("load")); img.src = url; });
    const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k)); canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.fillStyle = "#F5F2ED"; g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    return blob ? new File([blob], "logo-print.jpg", { type: "image/jpeg" }) : null;
  } finally { URL.revokeObjectURL(url); }
}
