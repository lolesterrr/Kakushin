import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "./api";
import { Notice } from "./ui";

/**
 * Media on pitches, project pages and event recaps.
 * Every piece is optional: each component renders nothing (or a quiet note) when its media is missing,
 * so a team with no video, no images or no deck never breaks a page.
 */

export interface MediaImage { id: string; url: string; caption: string }

/** Posts an image as the raw body with an optional caption header. */
export async function postImage<T = unknown>(path: string, file: File, caption = ""): Promise<T> {
  const res = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": file.type, "X-Caption": encodeURIComponent(caption).slice(0, 400) }, body: file, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Upload failed (${res.status})`);
  return data as T;
}

/** A person's picture, or their first letter on a plain circle when they have none. */
export function Avatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (url && !broken) return <img className="avatar" src={url} alt="" style={style} onError={() => setBroken(true)} />;
  return <span className="avatar ph" aria-hidden="true" style={style}>{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}

/** A YouTube embed when the link is one, otherwise a plain link. Nothing when there is no link. */
export function Video({ url, embed, title }: { url?: string | null; embed?: string | null; title: string }) {
  if (embed) {
    return (
      <div className="video">
        <iframe src={embed} title={`${title}: demo video`} loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
      </div>
    );
  }
  if (url) return <p><a className="btn ghost" href={url} target="_blank" rel="noopener noreferrer nofollow">Watch the video</a></p>;
  return null;
}

/** One large image with numbered thumbnails underneath. Nothing when the list is empty. */
export function ImageStrip({ images, title }: { images: MediaImage[]; title: string }) {
  const [i, setI] = useState(0);
  if (images.length === 0) return null;
  const cur = images[Math.min(i, images.length - 1)]!;
  return (
    <figure className="strip">
      <img className="strip-main" src={cur.url} alt={cur.caption || `${title}: image ${i + 1}`} />
      {cur.caption && <figcaption className="hand-note">{cur.caption}</figcaption>}
      {images.length > 1 && (
        <div className="strip-thumbs" role="list">
          {images.map((m, n) => (
            <button key={m.id} type="button" role="listitem" className={n === i ? "on" : ""} aria-label={`Show image ${n + 1}${m.caption ? `: ${m.caption}` : ""}`} aria-pressed={n === i} onClick={() => setI(n)}>
              <img src={m.url} alt="" /><span>{String(n + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}

/** The team's screenshot manager inside the pitch form. */
export function PitchImagesEditor({ teamId, images, max, locked, onChange }: { teamId: string; images: MediaImage[]; max: number; locked: boolean; onChange: () => Promise<void> }) {
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  useEffect(() => { setCaps(Object.fromEntries(images.map((m) => [m.id, m.caption]))); }, [images]);
  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await f(); await onChange(); if (ok) setMsg({ kind: "ok", text: ok }); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    setBusy(false);
  };
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, max - images.length); e.target.value = "";
    if (!files.length) return;
    await run(async () => { for (const f of files) await postImage(`/teams/${teamId}/pitch/images`, f); }, files.length === 1 ? "Image added" : `${files.length} images added`);
  }
  const order = (list: MediaImage[]) => api(`/teams/${teamId}/pitch/images`, { method: "PUT", json: { images: list.map((m) => ({ id: m.id, caption: (caps[m.id] ?? m.caption).trim() })) } });
  const move = (n: number, d: number) => { const l = [...images]; const [x] = l.splice(n, 1); l.splice(n + d, 0, x!); return run(() => order(l)); };
  const changed = images.some((m) => (caps[m.id] ?? "") !== m.caption);
  return (
    <div className="shots-editor">
      <div className="shots-head"><span className="label" style={{ margin: 0 }}>Screenshots · {images.length} of {max}</span><span className="muted" style={{ fontSize: 13 }}>Optional. The first one is your cover.</span></div>
      {images.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No screenshots yet. Your pitch works without them, but judges and visitors like to see the product.</p>}
      <div className="shots">
        {images.map((m, n) => (
          <div key={m.id} className="shot">
            <div className="shot-img">{n === 0 && <span className="cover-tag">Cover</span>}<img src={m.url} alt={m.caption || `Screenshot ${n + 1}`} /></div>
            <label htmlFor={`cap-${m.id}`} className="sr-only">Caption for screenshot {n + 1}</label>
            <input id={`cap-${m.id}`} className="cap" maxLength={120} placeholder="add a caption" disabled={locked || busy} value={caps[m.id] ?? ""} onChange={(e) => setCaps({ ...caps, [m.id]: e.target.value })} />
            {!locked && (
              <div className="shot-tools">
                <button type="button" className="link" disabled={busy || n === 0} onClick={() => void move(n, -1)} aria-label={`Move screenshot ${n + 1} earlier`}>←</button>
                <button type="button" className="link" disabled={busy || n === images.length - 1} onClick={() => void move(n, 1)} aria-label={`Move screenshot ${n + 1} later`}>→</button>
                <button type="button" className="link" disabled={busy} onClick={() => void run(() => api(`/teams/${teamId}/pitch/images/${m.id}`, { method: "DELETE" }))}>Remove</button>
              </div>
            )}
          </div>
        ))}
        {!locked && images.length < max && (
          <label className="shot-add">
            <span aria-hidden="true">+</span><span className="label" style={{ margin: 0 }}>Add images</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy} onChange={add} className="sr-only" />
          </label>
        )}
      </div>
      {!locked && changed && <div className="actions" style={{ marginTop: 12 }}><button type="button" className="ghost" disabled={busy} onClick={() => void run(() => order(images), "Captions saved")}>Save captions</button></div>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>PNG, JPEG or WebP, up to 3 MB each.</p>
    </div>
  );
}

interface Photo { id: string; url: string; caption: string; approved: boolean; by: string; created_at: number }
const fmtTime = (ms: number) => new Date(ms).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** The event recap: a numbered contact sheet of photos. Hidden until there is a photo or someone who can add one. */
export function Recap({ orgSlug, cslug }: { orgSlug: string; cslug: string }) {
  const base = `/orgs/${orgSlug}/challenges/${cslug}/photos`;
  const [d, setD] = useState<{ photos: Photo[]; can_add: boolean; can_manage: boolean; per_person: number } | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const load = () => api<typeof d & object>(base).then(setD).catch(() => setD(null));
  useEffect(() => { void load(); }, [base]);
  if (!d || (d.photos.length === 0 && !d.can_add)) return null;
  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await f(); await load(); if (ok) setMsg({ kind: "ok", text: ok }); } catch (e) { setMsg({ kind: "err", text: (e as Error).message }); }
    setBusy(false);
  };
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    await run(async () => { await postImage(base, f, caption); setCaption(""); }, d!.can_manage ? "Photo added" : "Photo sent. It shows here once an organiser approves it.");
  }
  const shown = d.photos.filter((p) => p.approved || d.can_manage);
  const waiting = d.photos.filter((p) => !p.approved);
  return (
    <div className="section" id="recap">
      <h2>Recap</h2>
      {shown.length > 0 && (
        <div className="contact">
          {shown.map((p, n) => (
            <figure key={p.id} className={`frame${n === 0 ? " wide" : ""}${p.approved ? "" : " waiting"}`}>
              <div className="frame-n"><span>{String(n + 1).padStart(2, "0")}</span><span>{fmtTime(p.created_at)}</span></div>
              <img src={p.url} alt={p.caption || `Event photo ${n + 1}`} loading="lazy" />
              {p.caption && <figcaption className="hand-note">{p.caption}</figcaption>}
              {d.can_manage && (
                <div className="shot-tools">
                  {!p.approved && <button type="button" className="small" disabled={busy} onClick={() => void run(() => api(`${base}/${p.id}`, { method: "PUT", json: { approved: true } }))}>Approve</button>}
                  {p.approved && <button type="button" className="link" disabled={busy} onClick={() => void run(() => api(`${base}/${p.id}`, { method: "PUT", json: { approved: false } }))}>Hide</button>}
                  <button type="button" className="link" disabled={busy} onClick={() => void run(() => api(`${base}/${p.id}`, { method: "DELETE" }))}>Remove</button>
                  <span className="muted" style={{ fontSize: 12 }}>by {p.by}</span>
                </div>
              )}
            </figure>
          ))}
        </div>
      )}
      {!d.can_manage && waiting.length > 0 && <p className="muted" style={{ fontSize: 14 }}>{waiting.length === 1 ? "Your photo is" : `${waiting.length} of your photos are`} waiting for an organiser to approve.</p>}
      {d.can_add && (
        <div className="recap-add">
          <p className="label" style={{ margin: 0 }}>{d.can_manage ? "Add event photos" : "Were you there?"}</p>
          <p className="muted" style={{ margin: "4px 0 10px", fontSize: 14 }}>{d.can_manage ? "Your photos show at once." : `Add up to ${d.per_person} photos. An organiser approves each one before it shows.`}</p>
          <label htmlFor="rc-cap" className="sr-only">Caption</label>
          <input id="rc-cap" maxLength={120} placeholder="caption (optional)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <label className="btn ghost" style={{ marginTop: 10 }}>{busy ? "Uploading..." : "+ Choose a photo"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={add} className="sr-only" /></label>
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

export interface ProjectCard { id: string; team: string; status: string; placement: number | null; challenge: string; cslug: string; oslug: string; video_url: string; video_embed: string | null; demo_url: string; repo_url: string; notes: string; cover_url: string | null; members: string }
type ProjectFull = Omit<ProjectCard, "members"> & { members: { name: string; handle: string | null; avatar_url?: string | null; lead: boolean }[]; images: MediaImage[] };

export const placeLabel = (p: { status: string; placement: number | null }) =>
  p.status === "winner" && p.placement ? (p.placement === 1 ? "1st place" : p.placement === 2 ? "2nd place" : p.placement === 3 ? "3rd place" : `${p.placement}th place`) : p.status === "winner" ? "Winner" : "Finalist";

/** A project's public page at /o/:slug/c/:cslug/p/:team. */
export function ProjectPage() {
  const { slug, cslug, team } = useParams();
  const [d, setD] = useState<{ project: ProjectFull; org: { slug: string; name: string }; more: ProjectCard[] } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { setD(null); setErr(""); api<NonNullable<typeof d>>(`/orgs/${slug}/challenges/${cslug}/projects/${team}`).then(setD).catch((e) => setErr((e as Error).message)); }, [slug, cslug, team]);
  if (err) return <div className="empty"><p className="hand">Project not found</p><p className="muted">It may be private, or results are not out yet.</p></div>;
  if (!d) return null;
  const p = d.project;
  const hasMedia = !!(p.video_embed || p.images.length);
  return (
    <>
      <div className="project-hero">
        <div className="project-copy">
          <p className="label" style={{ margin: 0 }}><Link to={`/o/${d.org.slug}/c/${p.cslug}`}>{p.challenge}</Link> · {d.org.name}</p>
          <div className="project-rank">
            {p.placement ? <span className="numeral">{String(p.placement).padStart(2, "0")}</span> : null}
            <span className="rubber">{placeLabel(p)}</span>
          </div>
          <h1>{p.team}</h1>
          <div className="actions">
            {p.video_url && !p.video_embed && <a className="btn" href={p.video_url} target="_blank" rel="noopener noreferrer nofollow">Watch the video</a>}
            {p.demo_url && <a className="btn" href={p.demo_url} target="_blank" rel="noopener noreferrer nofollow">Try the demo</a>}
            {p.repo_url && <a className="btn ghost" href={p.repo_url} target="_blank" rel="noopener noreferrer nofollow">View the code</a>}
          </div>
        </div>
        {hasMedia && (
          <div className="project-media">
            <Video embed={p.video_embed} title={p.team} />
            <ImageStrip images={p.images} title={p.team} />
          </div>
        )}
      </div>
      <div className="project-body">
        <div>
          <h2>About the project</h2>
          {p.notes ? <p className="prose">{p.notes}</p> : <p className="muted">The team has not written about this project yet.</p>}
        </div>
        <aside>
          <p className="label" style={{ marginTop: 0 }}>The team</p>
          <ul className="who-list">
            {p.members.map((m, n) => (
              <li key={n}><Avatar name={m.name} url={m.avatar_url} />
                <span>{m.handle ? <Link to={`/u/${m.handle}`}><b>{m.name}</b></Link> : <b>{m.name}</b>}{m.lead && <span className="muted"> · lead</span>}</span></li>
            ))}
          </ul>
        </aside>
      </div>
      {d.more.length > 0 && (
        <div className="section">
          <p className="label" style={{ marginTop: 0 }}>More from this challenge</p>
          <ProjectCards items={d.more} />
        </div>
      )}
    </>
  );
}

/** Project cards with a cover image when the team added one, and a striped placeholder when not. */
export function ProjectCards({ items, showChallenge = false }: { items: ProjectCard[]; showChallenge?: boolean }) {
  return (
    <div className="pcards">
      {items.map((p) => (
        <Link key={p.id} to={`/o/${p.oslug}/c/${p.cslug}/p/${p.id}`} className="pcard">
          {p.cover_url ? <img src={p.cover_url} alt="" loading="lazy" /> : <span className="cover ph" aria-hidden="true" />}
          <span className="label" style={{ margin: 0 }}>{placeLabel(p)}{showChallenge ? ` · ${p.challenge}` : ""}</span>
          <b>{p.team}</b>
          <span className="pcard-media">{[p.video_url && "Video", p.cover_url && "Images", p.demo_url && "Demo", p.repo_url && "Code"].filter(Boolean).join(" · ")}</span>
        </Link>
      ))}
    </div>
  );
}
