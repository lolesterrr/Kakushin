import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, dayMonth, fmtDate, fromLocalInput } from "../api";
import { useAuth } from "../auth";
import { Banner, ChallengeCard, type ChallengeCardData, Notice, Stamp, TopicPills, topicLabel } from "../ui";

/** Global events: hackathons and opportunities from outside Kakushin. We list them and link out; we do not run them. */
export interface EventCardData {
  slug: string; title: string; summary: string; image_url: string | null; topics: string[]; organizer: string; location: string; is_online: boolean;
  starts_at: number | null; ends_at: number | null; deadline_at: number | null; source: string; host: string; over?: boolean;
}
interface EventFull extends EventCardData { description: string; url: string; state: string; published_at: number | null }
type Msg = { kind: "ok" | "err"; text: string } | null;

/** The date that matters most on a card: the deadline when there is one, otherwise when it starts. */
export function EventStamp({ e, size = "sm" }: { e: EventCardData; size?: "sm" | "md" | "lg" }) {
  const d = dayMonth(e.deadline_at ?? e.starts_at);
  if (!d) return <Stamp big="Open" small="see dates" tone="indigo" size={size} />;
  return <Stamp big={d.day} small={`${e.deadline_at ? "closes" : "starts"} ${d.month}`} tone={e.deadline_at ? "red" : "indigo"} size={size} />;
}

const whenLine = (e: EventCardData) => {
  if (e.starts_at && e.ends_at && fmtDate(e.ends_at) !== fmtDate(e.starts_at)) return `${fmtDate(e.starts_at)} to ${fmtDate(e.ends_at)}`;
  if (e.starts_at) return fmtDate(e.starts_at);
  return e.deadline_at ? `Closes ${fmtDate(e.deadline_at)}` : "";
};

export function EventCard({ e }: { e: EventCardData }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link to={`/events/${e.slug}`} className="cell card-link">
      <div className="ban">{e.image_url && !broken ? <img src={e.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <Banner url={null} seed={e.slug} />}</div>
      <div className="cell-body">
        <div className="org-line"><span className="tag ink">External</span><span>{e.organizer || e.host}</span></div>
        <h3>{e.title}</h3>
        {e.summary && <p className="muted">{e.summary}</p>}
        <TopicPills topics={e.topics} />
        <div className="meta">{[e.is_online ? "Online" : e.location, whenLine(e)].filter(Boolean).join(" · ") || `On ${e.host}`}</div>
      </div>
      <div className="corner"><EventStamp e={e} /></div>
    </Link>
  );
}

type Page = { events: EventCardData[]; next: string | null };

export function Events() {
  const { me } = useAuth();
  const [topics, setTopics] = useState<string[]>([]);
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [topic, setTopic] = useState<string | null>(params.get("topic"));
  const [q, setQ] = useState(params.get("q") ?? "");
  const [query, setQuery] = useState(q);
  const [online, setOnline] = useState(params.get("online") === "1");
  const [items, setItems] = useState<EventCardData[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api<{ topics: string[] }>("/challenges/topics").then((r) => setTopics(r.topics)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => setQuery(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const qs = (cursor?: string) => {
    const u = new URLSearchParams();
    if (topic) u.set("topic", topic);
    if (query) u.set("q", query);
    if (online) u.set("online", "1");
    if (cursor) u.set("cursor", cursor);
    return u.toString();
  };
  useEffect(() => {
    let alive = true;
    setItems(null); setErr("");
    const shown = qs();
    window.history.replaceState(null, "", `/events${shown ? `?${shown}` : ""}`);
    api<Page>(`/events?${shown}`).then((r) => { if (alive) { setItems(r.events); setNext(r.next); } }).catch((e: Error) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [topic, query, online]); // eslint-disable-line react-hooks/exhaustive-deps
  async function more() {
    if (!next) return;
    setBusy(true);
    try { const r = await api<Page>(`/events?${qs(next)}`); setItems([...(items ?? []), ...r.events]); setNext(r.next); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <div className="hero">
        <p className="hand">From around the world</p>
        <h1>Global events</h1>
        <p>Hackathons and opportunities from outside Kakushin, gathered here so you can find them. We do not run these: each one links to its official page, where you apply.</p>
        <div className="search-row">
          <input type="search" aria-label="Search global events" placeholder="Search by name, organiser or place" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} />
          <select aria-label="Where" value={online ? "1" : ""} onChange={(e) => setOnline(e.target.value === "1")}>
            <option value="">Anywhere</option>
            <option value="1">Online only</option>
          </select>
        </div>
        <div className="topic-rail" role="group" aria-label="Filter by topic">
          <span className="label" aria-hidden="true">Topic</span>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={topic === null} onClick={() => setTopic(null)}>All</button>
            {topics.map((t) => <button type="button" key={t} className="chip" aria-pressed={topic === t} onClick={() => setTopic(topic === t ? null : t)}>{topicLabel(t)}</button>)}
          </div>
        </div>
        <div className="actions">
          <Link className="btn ghost" to={me ? "/events/suggest" : "/login?next=/events/suggest"}>Suggest an event</Link>
          {me && <Link className="btn ghost" to="/saved">Your saved list</Link>}
          <Link to="/challenges" style={{ fontWeight: 600 }}>Challenges on Kakushin</Link>
        </div>
      </div>
      {err && <div className="section"><Notice kind="err">{err}</Notice></div>}
      {items && items.length > 0 && <div className="grid">{items.map((e) => <EventCard key={e.slug} e={e} />)}</div>}
      {next && <div className="section" style={{ textAlign: "center" }}><button className="ghost" onClick={() => void more()} disabled={busy}>{busy ? "Loading…" : "Load more"}</button></div>}
      {items && items.length === 0 && (
        <div className="empty"><p className="hand">Nothing here yet</p><p className="muted">{topic || query || online ? "No global events match. Try fewer filters." : "No global events are listed right now. Know a good one? Suggest it."}</p></div>
      )}
    </>
  );
}

/** Bookmark button for a challenge or a global event. Signed out, it sends people to sign in and back. */
export function SaveButton({ path, saved, back, onChange }: { path: string; saved: boolean; back: string; onChange: (on: boolean) => void }) {
  const { me } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!me) return <Link className="btn ghost" to={`/login?next=${encodeURIComponent(back)}`}>Sign in to save</Link>;
  async function flip() {
    setBusy(true); setErr("");
    try { await api(`/saved/${path}`, { method: saved ? "DELETE" : "PUT" }); onChange(!saved); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  return <><button className="ghost" aria-pressed={saved} disabled={busy} onClick={() => void flip()}>{saved ? "Saved ✓" : "Save for later"}</button>{err && <Notice kind="err">{err}</Notice>}</>;
}

const REASONS: [string, string][] = [["spam", "It is spam or a joke"], ["scam", "It looks like a scam"], ["offensive", "It is offensive or harmful"], ["wrong", "The details are wrong or out of date"], ["other", "Something else"]];

/** "Report this" link that opens a short form. Reports go to the platform team, not to the organiser. */
export function ReportLink({ kind, org, slug, back }: { kind: "challenge" | "event"; org?: string; slug: string; back: string }) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    setMsg(null);
    try { await api("/reports", { method: "POST", json: { kind, org, slug, reason, details } }); setOpen(false); setMsg({ kind: "ok", text: "Thanks. The Kakushin team will take a look." }); }
    catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <div className="section" style={{ borderBottom: 0 }}>
      {!open && !msg && (me
        ? <button type="button" className="link muted" onClick={() => setOpen(true)}>Something wrong? Report this {kind === "event" ? "listing" : "challenge"}</button>
        : <Link className="muted" to={`/login?next=${encodeURIComponent(back)}`}>Something wrong? Sign in to report this {kind === "event" ? "listing" : "challenge"}</Link>)}
      {open && (
        <form className="form" onSubmit={send}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">What is wrong with it?</legend>
            {REASONS.map(([v, label]) => (
              <label key={v} style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 500, margin: "6px 0" }}>
                <input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} style={{ width: "auto" }} required /> {label}
              </label>
            ))}
          </fieldset>
          <label htmlFor="report-details">Anything that helps us check (optional)</label>
          <textarea id="report-details" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
          <div className="actions"><button type="submit">Send report</button><button type="button" className="ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

const longDate = (ms: number) => new Date(ms).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function EventPage() {
  const { slug } = useParams();
  const [data, setData] = useState<{ event: EventFull; saved: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [broken, setBroken] = useState(false);
  useEffect(() => { setData(null); api<{ event: EventFull; saved: boolean }>(`/events/${slug}`).then(setData).catch((e: Error) => setErr(e.message)); }, [slug]);
  useEffect(() => { if (data) document.title = `${data.event.title} · Global events · Kakushin`; }, [data]);
  if (err) return <div className="section"><Notice kind="err">{err === "Not found" ? "We could not find that event. It may have been taken off the list." : err}</Notice><p><Link to="/events">See all global events</Link></p></div>;
  if (!data) return null;
  const e = data.event;
  const hasDates = !!(e.deadline_at || e.starts_at);
  return (
    <>
      <div className="hero-ban">{e.image_url && !broken ? <img src={e.image_url} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} /> : <Banner url={null} seed={e.slug} />}</div>
      <div className="hero">
        <div className="head-row">
          <div style={{ maxWidth: 680 }}>
            <div className="org-line" style={{ marginBottom: 12 }}><span className="tag ink">External</span><span>{e.organizer || e.host}</span></div>
            <h1>{e.title}</h1>
            {e.summary && <p>{e.summary}</p>}
            {e.topics.length > 0 && <div style={{ marginTop: 16 }}><TopicPills topics={e.topics} /></div>}
            {e.state !== "published" && <Notice kind="err">{e.state === "pending" ? "This event is waiting for review. Only you and the Kakushin team can see it." : "This event is not on the public list."}</Notice>}
            {e.over && <Notice kind="err">This event has passed. Check its official page for the next round.</Notice>}
            <div className="actions">
              <a className="btn" href={e.url} target="_blank" rel="noopener noreferrer nofollow">Open the official page</a>
              {e.state === "published" && <SaveButton path={`events/${e.slug}`} saved={data.saved} back={`/events/${e.slug}`} onChange={(on) => setData({ ...data, saved: on })} />}
              {e.state === "published" && hasDates && !e.over && <a className="btn ghost" href={`/api/events/${e.slug}/calendar.ics`}>Add to calendar</a>}
            </div>
          </div>
          <EventStamp e={e} size="lg" />
        </div>
      </div>
      <div className="spec">
        {e.deadline_at ? <div><p className="label">Apply by</p><b>{fmtDate(e.deadline_at)}</b></div> : null}
        {e.starts_at ? <div><p className="label">{e.ends_at ? "Starts" : "Date"}</p><b>{fmtDate(e.starts_at)}</b><span className="muted" style={{ display: "block", fontSize: 13 }}>{longDate(e.starts_at)}</span></div> : null}
        {e.ends_at ? <div><p className="label">Ends</p><b>{fmtDate(e.ends_at)}</b></div> : null}
        {(e.is_online || e.location) ? <div><p className="label">Where</p><b>{e.is_online ? "Online" : e.location}</b></div> : null}
      </div>
      <div className="section">
        <p className="label" style={{ marginTop: 0 }}>Not run on Kakushin</p>
        <p className="muted" style={{ maxWidth: 720, marginTop: 0 }}>
          {e.source === "Suggested by the community" ? "Suggested by someone on Kakushin and checked by our team. " : e.source ? `Listed from ${e.source}. ` : ""}Kakushin only points to this event. Applications, rules and prizes are handled by its organisers on <a href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.host}</a>, so check the details there before you apply.
        </p>
      </div>
      {e.description && <div className="section"><p className="label" style={{ marginTop: 0 }}>About</p><div className="prose" style={{ whiteSpace: "pre-line", maxWidth: 720 }}>{e.description}</div></div>}
      {e.state === "published" && <ReportLink kind="event" slug={e.slug} back={`/events/${e.slug}`} />}
    </>
  );
}

interface Mine extends EventCardData { state: string; review_note: string }
const STATE: Record<string, [string, string]> = { pending: ["In review", "gold"], published: ["Listed", "moss"], rejected: ["Not listed", "ink"], removed: ["Taken off", "ink"] };

/** Anyone signed in can suggest an event. It goes public once a platform admin has checked it. */
export function SuggestEvent() {
  const { me } = useAuth();
  const nav = useNavigate();
  const [topics, setTopics] = useState<string[]>([]);
  const [f, setF] = useState({ title: "", url: "", summary: "", description: "", organizer: "", location: "", is_online: false, deadline: "", starts: "", ends: "" });
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<Msg>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const loadMine = () => api<{ events: Mine[] }>("/events/mine").then((r) => setMine(r.events)).catch(() => {});
  useEffect(() => { api<{ topics: string[] }>("/challenges/topics").then((r) => setTopics(r.topics)).catch(() => {}); void loadMine(); }, []);
  useEffect(() => { if (me === null) nav("/login?next=/events/suggest", { replace: true }); }, [me, nav]);
  if (!me) return null;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    setMsg(null);
    try {
      const r = await api<{ slug: string; pending: boolean }>("/events/suggest", { method: "POST", json: {
        title: f.title, url: f.url, summary: f.summary, description: f.description, organizer: f.organizer, location: f.location, is_online: f.is_online,
        deadline_at: fromLocalInput(f.deadline), starts_at: fromLocalInput(f.starts), ends_at: fromLocalInput(f.ends), topics: picked,
      } });
      setMsg({ kind: "ok", text: r.pending ? "Thanks. Your event is waiting for review, and you get a note when it is listed." : "Listed. It is in Global events now." });
      setF({ title: "", url: "", summary: "", description: "", organizer: "", location: "", is_online: false, deadline: "", starts: "", ends: "" }); setPicked([]);
      await loadMine();
    } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
  }
  return (
    <>
      <div className="hero"><p className="hand">Share what you found</p><h1>Suggest a global event</h1><p>Know a hackathon or opportunity that others here should see? Send it in. The Kakushin team checks every suggestion before it is listed. <Link to="/events">Back to global events</Link>.</p></div>
      <div className="section form">
        <form className="form" onSubmit={send}>
          <label htmlFor="ev-title">Name of the event</label>
          <input id="ev-title" required minLength={3} maxLength={160} value={f.title} onChange={set("title")} />
          <label htmlFor="ev-url">Link to its official page</label>
          <input id="ev-url" type="url" required maxLength={500} placeholder="https://" value={f.url} onChange={set("url")} />
          <label htmlFor="ev-sum">One line about it (optional)</label>
          <input id="ev-sum" maxLength={200} value={f.summary} onChange={set("summary")} />
          <label htmlFor="ev-org">Who runs it (optional)</label>
          <input id="ev-org" maxLength={80} value={f.organizer} onChange={set("organizer")} />
          <label htmlFor="ev-loc">Where (optional)</label>
          <input id="ev-loc" maxLength={120} placeholder="City and country" value={f.location} onChange={set("location")} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={f.is_online} onChange={(e) => setF({ ...f, is_online: e.target.checked })} style={{ width: "auto" }} /> It is online</label>
          <label htmlFor="ev-dead">Apply by (optional)</label>
          <input id="ev-dead" type="datetime-local" value={f.deadline} onChange={set("deadline")} />
          <label htmlFor="ev-start">Starts (optional)</label>
          <input id="ev-start" type="datetime-local" value={f.starts} onChange={set("starts")} />
          <label htmlFor="ev-end">Ends (optional)</label>
          <input id="ev-end" type="datetime-local" value={f.ends} onChange={set("ends")} />
          <div role="group" aria-label="Topics">
            <p className="label">Topics (up to 5)</p>
            <div className="chips">{topics.map((t) => <button type="button" key={t} className="chip" aria-pressed={picked.includes(t)} onClick={() => setPicked(picked.includes(t) ? picked.filter((x) => x !== t) : picked.length < 5 ? [...picked, t] : picked)}>{topicLabel(t)}</button>)}</div>
          </div>
          <label htmlFor="ev-desc">More details (optional)</label>
          <textarea id="ev-desc" rows={5} maxLength={4000} value={f.description} onChange={set("description")} />
          <div className="actions"><button type="submit">Send for review</button></div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      </div>
      {mine.length > 0 && (
        <div className="section form">
          <h2>Your suggestions</h2>
          <ul className="todo">{mine.map((e) => (
            <li key={e.slug}>
              <span><Link to={`/events/${e.slug}`}><b>{e.title}</b></Link>{e.review_note && <span className="muted"> · {e.review_note}</span>}</span>
              <span className={`tag ${STATE[e.state]?.[1] ?? "sand"}`}>{STATE[e.state]?.[0] ?? e.state}</span>
            </li>
          ))}</ul>
        </div>
      )}
    </>
  );
}

/** Everything the signed-in person bookmarked: challenges on Kakushin and global events. */
export function Saved() {
  const [data, setData] = useState<{ challenges: ChallengeCardData[]; events: EventCardData[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<NonNullable<typeof data>>("/saved").then(setData).catch((e: Error) => setErr(e.message)); }, []);
  const none = data && data.challenges.length === 0 && data.events.length === 0;
  return (
    <>
      <div className="hero"><p className="hand">For later</p><h1>Saved</h1><p>Challenges and global events you bookmarked. You get a reminder three days and one day before a saved one closes.</p></div>
      {err && <div className="section"><Notice kind="err">{err}</Notice></div>}
      {none && <div className="empty"><p className="hand">Nothing saved yet</p><p className="muted">Open a <Link to="/challenges">challenge</Link> or a <Link to="/events">global event</Link> and press Save for later.</p></div>}
      {data && data.challenges.length > 0 && <><div className="section" style={{ borderBottom: 0, paddingBottom: 8 }}><p className="label" style={{ margin: 0 }}>Challenges</p></div><div className="grid">{data.challenges.map((c) => <ChallengeCard key={`${c.org.slug}/${c.slug}`} c={c} />)}</div></>}
      {data && data.events.length > 0 && <><div className="section" style={{ borderBottom: 0, paddingBottom: 8 }}><p className="label" style={{ margin: 0 }}>Global events</p></div><div className="grid">{data.events.map((e) => <EventCard key={e.slug} e={e} />)}</div></>}
    </>
  );
}
