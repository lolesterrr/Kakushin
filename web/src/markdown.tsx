import React, { useRef, useState } from "react";
import { parseMarkdown, type Block, type Inline } from "../../shared/markdown";
import { uploadImage } from "./api";

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.t) {
          case "text": return <React.Fragment key={i}>{n.v.split("\n").map((line, j) => (j ? [<br key={`b${j}`} />, line] : line))}</React.Fragment>;
          case "b": return <strong key={i}><Inlines nodes={n.c} /></strong>;
          case "i": return <em key={i}><Inlines nodes={n.c} /></em>;
          case "code": return <code key={i}>{n.v}</code>;
          case "a": return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow"><Inlines nodes={n.c} /></a>;
          case "img": return <img key={i} src={n.src} alt={n.alt} loading="lazy" />;
        }
      })}
    </>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    // Headings sit under the section's own heading, so they start at h3.
    case "h": return React.createElement(`h${b.level + 2}`, null, <Inlines nodes={b.c} />);
    case "p": return <p><Inlines nodes={b.c} /></p>;
    case "ul": return <ul>{b.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ul>;
    case "ol": return <ol start={b.start}>{b.items.map((it, i) => <li key={i}><Inlines nodes={it} /></li>)}</ol>;
    case "quote": return <blockquote><Inlines nodes={b.c} /></blockquote>;
    case "hr": return <hr />;
  }
}

/** Organiser text with basic formatting. Never raw HTML: see shared/markdown.ts. */
export function Markdown({ text, className = "md" }: { text: string; className?: string }) {
  const blocks = parseMarkdown(text);
  return <div className={className}>{blocks.map((b, i) => <BlockView key={i} b={b} />)}</div>;
}

/** A Markdown textarea with Write and Preview tabs, and an image button when there is somewhere to upload to. */
export function MarkdownField({ id, label, value, onChange, rows = 8, maxLength = 20000, uploadPath, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; rows?: number; maxLength?: number; uploadPath?: string; hint?: string;
}) {
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  async function addImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f || !uploadPath) return;
    setBusy(true); setErr("");
    try {
      const r = await uploadImage<{ url: string }>(uploadPath, f);
      const at = area.current?.selectionStart ?? value.length;
      const alt = f.name.replace(/\.[^.]+$/, "").replace(/[[\]]/g, "");
      const snippet = `${at > 0 && value[at - 1] !== "\n" ? "\n\n" : ""}![${alt}](${r.url})\n`;
      onChange(value.slice(0, at) + snippet + value.slice(at));
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  return (
    <div className="mdfield">
      <div className="mdbar">
        <label htmlFor={id} style={{ margin: 0 }}>{label}</label>
        <span className="mdtabs" role="group" aria-label={`${label} view`}>
          <button type="button" className={`pill ${!preview ? "on" : ""}`} aria-pressed={!preview} onClick={() => setPreview(false)}>Write</button>
          <button type="button" className={`pill ${preview ? "on" : ""}`} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</button>
          {uploadPath && !preview && <><button type="button" className="pill" disabled={busy} onClick={() => file.current?.click()}>{busy ? "Uploading…" : "Add image"}</button>
            <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={addImage} /></>}
        </span>
      </div>
      {preview
        ? <div className="mdpreview">{value.trim() ? <Markdown text={value} /> : <p className="muted">Nothing to preview yet.</p>}</div>
        : <textarea id={id} ref={area} rows={rows} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} />}
      <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>{hint ?? "Formatting: # Heading, **bold**, *italic*, - list, 1. list, [link](https://…)."}</p>
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
