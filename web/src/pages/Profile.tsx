import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { Notice } from "../ui";
import { StatusStamp } from "./Team";
import { CertificatesList } from "./Certificates";
import { TopicPicker } from "./Inbox";
import { PushSetting } from "./OrgTeam";
import { Avatar, postImage } from "../media";

export function Profile() {
  const { me, reload } = useAuth();
  const [form, setForm] = useState({
    name: me?.name ?? "", bio: me?.bio ?? "", institution: me?.institution ?? "", location: me?.location ?? "", skills: me?.skills.join(", ") ?? "",
    handle: me?.handle ?? "", github: me?.links?.github ?? "", linkedin: me?.links?.linkedin ?? "", website: me?.links?.website ?? "",
  });
  const [isPublic, setIsPublic] = useState(!!me?.public_profile);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [tab, setTab] = useState(0);
  const [certCount, setCertCount] = useState(0);
  const [teams, setTeams] = useState<{ id: string; name: string; status: string; title: string; cslug: string; oslug: string; oname: string }[]>([]);
  useEffect(() => { if (me) api<{ teams: typeof teams }>("/teams/mine").then((r) => setTeams(r.teams)).catch(() => {}); }, [me?.id]);
  if (!me) return <Navigate to="/login?next=/profile" replace />;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { github, linkedin, website, handle, ...rest } = form;
      // Other link names someone saved from the app stay as they are.
      const links: Record<string, string> = { ...(me?.links ?? {}) };
      for (const [k, v] of Object.entries({ github, linkedin, website })) { if (v.trim()) links[k] = v.trim(); else delete links[k]; }
      await api("/me", { method: "PUT", json: { ...rest, skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean), links, handle: handle.trim().toLowerCase() || null, public_profile: isPublic && !!handle.trim() } });
      await reload(); setMsg({ kind: "ok", text: "Saved" });
    } catch (err) { setMsg({ kind: "err", text: (err as Error).message }); }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const finals = teams.filter((t) => t.status === "finalist" || t.status === "winner").length;
  const TABS = ["About you", "Teams and certificates", "Notifications", "Account"];
  return (
    <>
    <div className={`me-hero${me.banner_url ? " has-banner" : ""}`}>
      {me.banner_url ? <img className="me-banner" src={me.banner_url} alt="" /> : <><span className="me-sun" aria-hidden="true" /><span className="me-ring" aria-hidden="true" /></>}
      <BannerPicker url={me.banner_url} onChange={reload} />
      <div className="me-card">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <p className="label">{me.public_profile && me.handle ? "Public profile" : "Private profile"}</p>
          <div className="me-id">
            <AvatarPicker name={me.name || me.email} url={me.avatar_url} onChange={reload} />
            <h1 className="boxed">{me.name || "Your name"}</h1>
          </div>
          {(me.institution || me.location) && <div className="facts">{me.institution && <span>{me.institution}</span>}{me.location && <span>{me.location}</span>}</div>}
          {me.skills.length > 0 && <div className="pills">{me.skills.slice(0, 8).map((k) => <span className="pill" key={k}>{k}</span>)}</div>}
          {me.public_profile && me.handle ? <Link to={`/u/${me.handle}`} style={{ fontFamily: "var(--mono)", fontSize: 14, color: "#f6f4ee" }}>{window.location.host}/u/{me.handle}</Link>
            : <button type="button" className="link" style={{ color: "#dcd8cf", alignSelf: "flex-start" }} onClick={() => setTab(0)}>Make your profile public below</button>}
        </div>
      </div>
      <div className="me-stats">
        <div><b>{pad(teams.length)}</b><span>Challenges joined</span></div>
        <div><b>{pad(certCount)}</b><span>Certificates</span></div>
        <div><b>{pad(finals)}</b><span>Finals</span></div>
      </div>
    </div>
    <nav className="folders" role="tablist" aria-label="Profile sections">
      {TABS.map((label, i) => <button key={label} type="button" role="tab" id={`ptab-${i}`} aria-controls={`psec-${i}`} aria-selected={tab === i} onClick={() => setTab(i)}>{label}</button>)}
    </nav>
    <div role="tabpanel" id="psec-1" aria-labelledby="ptab-1" hidden={tab !== 1}>
      {teams.length > 0 ? (
        <div className="section">
          <h2>Your teams</h2>
          <div className="grid" style={{ marginTop: 16 }}>
            {teams.map((t) => (
              <Link key={t.id} to={`/o/${t.oslug}/c/${t.cslug}`} className="cell card-link"><div className="cell-body"><span className="muted">{t.oname}</span><h3>{t.title}</h3><p>{t.name}</p></div>
                <div className="corner"><StatusStamp status={t.status} /></div></Link>
            ))}
          </div>
        </div>
      ) : <div className="empty"><p className="hand">No teams yet</p><p className="muted"><Link to="/challenges">Find a challenge</Link> to join.</p></div>}
      <CertificatesList onCount={setCertCount} />
    </div>
    <div className="section form" role="tabpanel" id="psec-0" aria-labelledby="ptab-0" hidden={tab !== 0}>
      <h2>About you</h2><p className="muted">Organisers see this when you apply. Only your name is required. Signed in as {me.email}.</p>
      <form onSubmit={save}>
        <label htmlFor="n">Name</label><input id="n" required value={form.name} onChange={set("name")} />
        <label htmlFor="i">Institution</label><input id="i" value={form.institution} onChange={set("institution")} />
        <label htmlFor="l">Location</label><input id="l" value={form.location} onChange={set("location")} />
        <label htmlFor="s">Skills (comma separated)</label><input id="s" value={form.skills} onChange={set("skills")} />
        <p className="note-box" style={{ margin: "6px 0 0" }}>teams search by skills, so add a few</p>
        <label htmlFor="b">Bio</label><textarea id="b" rows={4} value={form.bio} onChange={set("bio")} />
        <div className="row">
          <div><label htmlFor="lg">GitHub</label><input id="lg" type="url" placeholder="https://github.com/…" value={form.github} onChange={set("github")} /></div>
          <div><label htmlFor="ll">LinkedIn</label><input id="ll" type="url" placeholder="https://linkedin.com/in/…" value={form.linkedin} onChange={set("linkedin")} /></div>
          <div><label htmlFor="lw">Website</label><input id="lw" type="url" placeholder="https://" value={form.website} onChange={set("website")} /></div>
        </div>
        <h2 style={{ marginTop: 28 }}>Public profile</h2>
        <p className="muted" style={{ marginTop: 0 }}>Off unless you turn it on. It shows your name, bio, institution, location, skills, links, teams and certificates, never your email. People with a public profile are also named in "Who's coming" on challenges they join.</p>
        <label htmlFor="h">Profile address</label>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="muted" style={{ fontFamily: "var(--mono)", fontSize: 14 }}>{window.location.host}/u/</span><input id="h" maxLength={30} pattern="[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]" title="3 to 30 lowercase letters, numbers or dashes" placeholder="your-name" value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })} /></div>
        <label className="check"><input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />Make my profile public</label>
        {me.public_profile && me.handle && <p style={{ fontSize: 14 }}>Live at <Link to={`/u/${me.handle}`}>/u/{me.handle}</Link></p>}
        <div className="actions"><button type="submit">Save changes</button></div>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      </form>
    </div>
    <div role="tabpanel" id="psec-2" aria-labelledby="ptab-2" hidden={tab !== 2}>
      <TopicPicker />
      <PushSetting />
    </div>
    <div role="tabpanel" id="psec-3" aria-labelledby="ptab-3" hidden={tab !== 3}>
      <DeleteAccount email={me.email} />
    </div>
    </>
  );
}

/** Deleting is final, so it sits behind a button, a plain list of what goes, and the email typed back. */
function DeleteAccount({ email }: { email: string }) {
  const { reload } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (!matches) return;
    setBusy(true); setErr("");
    try { await api("/me", { method: "DELETE", json: { confirm: typed } }); await reload(); nav("/?deleted=1", { replace: true }); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <div className="section form" id="delete">
      <h2>Delete your account</h2>
      {!open ? (
        <>
          <p className="muted">This removes your account and your data from Kakushin for good.</p>
          <div className="actions"><button className="ghost" onClick={() => setOpen(true)}>Delete my account</button></div>
        </>
      ) : (
        <form onSubmit={remove}>
          <p>This cannot be undone. Deleting your account removes:</p>
          <ul>
            <li>your profile, sign-in sessions and devices</li>
            <li>your place in every team (a team you lead passes to the teammate who joined first; a team with only you in it is removed, with its application and pitch)</li>
            <li>your certificates, which will stop verifying</li>
            <li>your inbox, follows and topics, and any scores you gave as a judge</li>
          </ul>
          <p className="muted">If you own an organisation, another admin becomes its owner. If you are its only admin and it has public challenges, add another admin first.</p>
          <label htmlFor="del-email">Type your email address to confirm</label>
          <input id="del-email" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
          <div className="actions">
            <button type="submit" disabled={!matches || busy}>{busy ? "Deleting..." : "Delete my account for good"}</button>
            <button type="button" className="ghost" onClick={() => { setOpen(false); setTyped(""); setErr(""); }}>Cancel</button>
          </div>
          {err && <Notice kind="err">{err}</Notice>}
        </form>
      )}
    </div>
  );
}

/** The profile picture with a way to change or remove it. Square crops look best; the circle trims the rest. */
function AvatarPicker({ name, url, onChange }: { name: string; url?: string | null; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="avatar-pick">
      <Avatar name={name} url={url} size={88} />
      <div>
        <label className={`btn small ghost${busy ? " disabled" : ""}`}>
          {busy ? "Saving" : url ? "Change photo" : "Add a photo"}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void act(() => postImage("/me/avatar", f)); }} />
        </label>
        {url && <button type="button" className="link" disabled={busy} onClick={() => void act(() => api("/me/avatar", { method: "DELETE" }))}>Remove</button>}
        {err && <p className="avatar-err" role="alert">{err}</p>}
      </div>
    </div>
  );
}

/** The wide picture across the top of the profile. Without one, the profile keeps its red sun. */
function BannerPicker({ url, onChange }: { url?: string | null; onChange: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setErr("");
    try { await fn(); await onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="banner-pick">
      <label className={`btn small ghost${busy ? " disabled" : ""}`}>
        {busy ? "Saving" : url ? "Change banner" : "Add a banner"}
        <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void act(() => postImage("/me/banner", f)); }} />
      </label>
      {url && <button type="button" className="btn small ghost" disabled={busy} onClick={() => void act(() => api("/me/banner", { method: "DELETE" }))}>Remove</button>}
      {err && <p className="avatar-err" role="alert">{err}</p>}
    </div>
  );
}
