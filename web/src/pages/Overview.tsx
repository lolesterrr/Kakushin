import React, { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, fmtDate } from "../api";
import { useAuth } from "../auth";
import { Band, NumSection, Notice, Tag } from "../ui";
import { challengeTabs } from "./Admin";

interface Overview { counts: Record<string, number>; newest: { team_id: string; name: string; submitted_at: number; members: number }[] }
interface Ch { title: string; summary: string; description: string; cover_url: string | null; status: string; applications_close_at: number | null; questions: unknown[] }

/** Organiser's home for one challenge: what stage everything is at and what to do next. */
export function AdminOverview() {
  const { slug, cslug } = useParams();
  const { me } = useAuth();
  const [ch, setCh] = useState<Ch | null>(null);
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!me) return;
    api<{ challenge: Ch; role: string | null }>(`/orgs/${slug}/challenges/${cslug}`).then((r) => {
      if (!r.role) { setErr("You are not an admin of this organisation."); return; }
      setCh(r.challenge);
      return api<Overview>(`/orgs/${slug}/challenges/${cslug}/overview`).then(setOv);
    }).catch((e: Error) => setErr(e.message));
  }, [slug, cslug, me?.id]);
  if (!me) return <Navigate to={`/login?next=/admin/o/${slug}/c/${cslug}`} replace />;
  if (err) return <div className="section"><Notice kind="err">{err}</Notice></div>;
  if (!ch || !ov) return null;

  const base = `/admin/o/${slug}/c/${cslug}`;
  const n = (k: string) => ov.counts[k] ?? 0;
  const publicUrl = `${window.location.origin}/o/${slug}/c/${cslug}`;
  const todo: { text: string; to?: string; cta?: string; copy?: boolean }[] = [];
  if (ch.status === "draft") todo.push({ text: !ch.summary || !ch.description ? "Finish the summary and description, then publish" : "Publish your challenge so people can find it", to: `${base}/edit`, cta: "Open editor" });
  if (!ch.cover_url) todo.push({ text: "Add a cover image so the challenge stands out", to: `${base}/edit`, cta: "Add image" });
  if (ch.status === "open" && n("applied") > 0) todo.push({ text: `Review ${n("applied")} new ${n("applied") === 1 ? "application" : "applications"}`, to: `${base}/applications?f=applied`, cta: "Review" });
  if (ch.status !== "draft") todo.push({ text: "Share the link with your audience", copy: true });
  if (todo.length === 0) todo.push({ text: "You are all caught up." });

  const stages: [string, string, boolean][] = [
    ["forming", "Forming teams", false], ["applied", "New", n("applied") > 0 && ch.status === "open"],
    ["shortlisted", "Shortlisted", false], ["rejected", "Rejected", false],
  ];

  return (
    <>
      <Band crumb="Back to organisation" to={`/admin/o/${slug}`} title={ch.title} tags={<><Tag status={ch.status} /><span>{ch.applications_close_at ? `Closes ${fmtDate(ch.applications_close_at)}` : "No deadline set"}</span></>} tabs={challengeTabs(slug!, cslug!)} />
      <NumSection n="01" title="Pipeline">
        <div className="pipeline">
          {stages.map(([k, label, hot]) => (
            <Link key={k} to={k === "forming" ? base : `${base}/applications?f=${k}`} className={hot ? "hot" : ""}><b>{n(k)}</b><span>{label}</span></Link>
          ))}
        </div>
      </NumSection>
      <NumSection n="02" title="Do next">
        <ul className="todo">
          {todo.map((t) => (
            <li key={t.text}><span>{t.text}</span>
              {t.to && <Link className="btn small" to={t.to}>{t.cta}</Link>}
              {t.copy && <button className="ghost small" onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* blocked */ } }}>{copied ? "Copied" : "Copy link"}</button>}
            </li>
          ))}
        </ul>
      </NumSection>
      <NumSection n="03" title="Newest applications">
        {ov.newest.length === 0 ? <p className="muted">No new applications yet.</p> : (
          <ul className="todo">{ov.newest.map((a) => (
            <li key={a.team_id}><span><b>{a.name}</b> <span className="muted">· {a.members} {a.members === 1 ? "person" : "people"} · {fmtDate(a.submitted_at)}</span></span><Link to={`${base}/applications?f=applied`}>Open</Link></li>
          ))}</ul>
        )}
      </NumSection>
    </>
  );
}
