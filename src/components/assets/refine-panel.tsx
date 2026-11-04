"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, Panel, Spinner } from "@/components/ui";
import { SHOT_LABEL, CHANNEL_LABEL, type Asset } from "@/lib/domain/types";

type Bg = { label: string; direction: string; why: string };
type Txt = { headline: string; subline: string | null; position: "top" | "center" | "bottom"; tone: "dark" | "light" };

const pill = (on: boolean) => `rounded-full border px-3 py-2 text-[13px] ${on ? "border-info bg-info-bg text-info-strong" : "border-line-strong text-body hover:border-muted"}`;
const input = "mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg";

function useSuggestions<T>(assetId: string, kind: "background" | "text") {
  const [state, setState] = useState<{ assetId: string; options: T[]; error: string | null; done: boolean }>({ assetId, options: [], error: null, done: false });
  useEffect(() => {
    let live = true;
    fetch(`/api/assets/${assetId}/suggest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) })
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => { if (live) setState({ assetId, options: ok ? body.options : [], error: ok ? null : body.error, done: true }); })
      .catch(() => { if (live) setState({ assetId, options: [], error: "The agent couldn't suggest anything just now. You can still type your own.", done: true }); });
    return () => { live = false; };
  }, [assetId, kind]);
  return state.assetId === assetId ? state : { assetId, options: [] as T[], error: null, done: false };
}

function Background({ asset, onDone }: { asset: Asset; onDone: () => void }) {
  const s = useSuggestions<Bg>(asset.id, "background");
  const [direction, setDirection] = useState("");
  const [chosen, setChosen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setError(null);
    const res = await fetch(`/api/assets/${asset.id}/background`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ direction }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    onDone();
  });
  return (
    <>
      {!s.done && <p className="flex items-center gap-2 text-info"><Spinner size={14} /> The agent is looking at this image and suggesting settings</p>}
      {s.error && <Notice tone="warn" title="No suggestions">{s.error}</Notice>}
      {s.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {s.options.map((o, i) => <button key={o.label} type="button" aria-pressed={chosen === i} title={o.why} className={pill(chosen === i)} onClick={() => { setChosen(i); setDirection(o.direction); }}>{o.label}</button>)}
        </div>
      )}
      {chosen !== null && s.options[chosen] && <p className="mt-2 text-xs leading-4 text-muted">{s.options[chosen].why}</p>}
      <label htmlFor="bg" className="mt-3.5 block text-xs text-muted">Or describe your own</label>
      <input id="bg" className={input} value={direction} placeholder="e.g. warmer morning light, a little steam" onChange={(e) => { setDirection(e.target.value); setChosen(null); }} />
      {error && <div className="mt-3"><Notice title="That didn't start">{error}</Notice></div>}
      <div className="mt-3"><Button variant="primary" pending={pending} disabled={direction.trim().length < 3} onClick={go}>Generate new background · est. 11 credits</Button></div>
      <p className="mt-3 text-xs leading-4 text-muted">The assistant writes the prompt and picks the model. Only the scene changes; the real packshot is composited back and checks run again. The current version stays as it is.</p>
    </>
  );
}

function AddText({ asset, onDone }: { asset: Asset; onDone: () => void }) {
  const s = useSuggestions<Txt>(asset.id, "text");
  const [form, setForm] = useState<Txt>({ headline: "", subline: "", position: "bottom", tone: "dark" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = () => start(async () => {
    setError(null);
    const res = await fetch(`/api/assets/${asset.id}/text`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, subline: form.subline || null }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    onDone();
  });
  return (
    <>
      {!s.done && <p className="flex items-center gap-2 text-info"><Spinner size={14} /> The agent is finding calm areas and approved wording</p>}
      {s.error && <Notice tone="warn" title="No suggestions">{s.error}</Notice>}
      {s.options.length > 0 && <div className="flex flex-wrap gap-2">{s.options.map((o) => <button key={o.headline} type="button" aria-pressed={form.headline === o.headline} className={pill(form.headline === o.headline)} onClick={() => setForm({ ...o, subline: o.subline ?? "" })}>{o.headline}</button>)}</div>}
      <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="headline" className="text-xs text-muted">Headline</label><input id="headline" className={input} value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} /></div>
        <div><label htmlFor="subline" className="text-xs text-muted">Supporting line. Optional</label><input id="subline" className={input} value={form.subline ?? ""} onChange={(e) => setForm({ ...form, subline: e.target.value })} /></div>
        <div><label htmlFor="position" className="text-xs text-muted">Position</label><select id="position" className={input} value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value as Txt["position"] })}><option value="top">Top</option><option value="center">Centre</option><option value="bottom">Bottom</option></select></div>
        <div><label htmlFor="tone" className="text-xs text-muted">Colour</label><select id="tone" className={input} value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value as Txt["tone"] })}><option value="dark">Deep sage, for light areas</option><option value="light">Label cream, for dark areas</option></select></div>
      </div>
      {error && <div className="mt-3"><Notice title="That didn't start">{error}</Notice></div>}
      <div className="mt-3"><Button variant="primary" pending={pending} disabled={!form.headline.trim()} onClick={go}>Add text · 0 credits</Button></div>
      <p className="mt-3 text-xs leading-4 text-muted">Set in the brand&apos;s Jost type and colours from the style guide, rendered by code rather than a model, so the text is always spelled exactly as written. Claims in text are checked against approved claims.</p>
    </>
  );
}

export function RefinePanel({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const router = useRouter();
  const [action, setAction] = useState<"background" | "text">("background");
  const done = () => { router.refresh(); onClose(); };
  return (
    <Panel title={<span className="flex items-center justify-between gap-3">GUIDED REFINE · {action === "background" ? "CHANGE BACKGROUND" : "ADD TEXT"} <button type="button" onClick={onClose} className="text-xs font-normal tracking-normal text-muted hover:text-fg">Close</button></span>}>
      <p className="mb-3 text-body">Editing <b>{SHOT_LABEL[asset.shot_key]}</b> for {CHANNEL_LABEL[asset.channel]}, version {asset.version}.</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className={pill(action === "background")} aria-pressed={action === "background"} onClick={() => setAction("background")}>Change background</button>
        <button type="button" className={pill(action === "text")} aria-pressed={action === "text"} onClick={() => setAction("text")}>Add text</button>
      </div>
      {action === "background" ? <Background key={asset.id} asset={asset} onDone={done} /> : <AddText key={asset.id} asset={asset} onDone={done} />}
    </Panel>
  );
}
