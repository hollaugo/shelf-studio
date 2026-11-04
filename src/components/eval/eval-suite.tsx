"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Notice, Panel, Spinner, StatTile } from "@/components/ui";
import { Img } from "@/components/ui/image";
import { can } from "@/lib/domain/permissions";
import { IMAGE_MODELS, VIDEO_MODELS, modelLabel } from "@/lib/runway/model-registry";
import { CATEGORY_LABEL, type EvalKind } from "@/lib/eval/criteria";
import { CONFIRM_OVER_CREDITS, estimateRun, MAX_TASKS_PER_RUN, summarizeModels } from "@/lib/eval/summary";
import type { EvalCase, EvalTask, Suite } from "@/lib/eval/data";
import type { Role } from "@/lib/domain/types";
import { TaskDrawer } from "./task-drawer";

type Tab = "scoreboard" | "new" | "runs" | "prompts";
const TAB_LABEL: Record<Tab, string> = { scoreboard: "Scoreboard", new: "New run", runs: "Runs", prompts: "Prompts" };
const field = "mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg";
const pill = (on: boolean) => `rounded-full border px-3.5 py-2 text-[13px] ${on ? "border-fg bg-fg text-canvas" : "border-line-strong text-body hover:border-muted"}`;

const avg = (t: EvalTask) => (t.annotations.length ? t.annotations.reduce((s, a) => s + a.overall, 0) / t.annotations.length : null);
const isActive = (t: EvalTask) => t.status === "queued" || t.status === "running" || (t.kind === "image" && t.status === "done" && !t.compositeUrl);

function ScoreBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const tone = value >= 4 ? "bg-ok text-canvas" : value >= 3 ? "bg-warn text-canvas" : "bg-danger text-canvas";
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${tone}`}>{value.toFixed(1)}</span>;
}

function Cell({ task, onOpen }: { task?: EvalTask; onOpen: (id: string) => void }) {
  if (!task) return <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-line-soft text-xs text-muted">Not run</div>;
  const url = task.compositeUrl ?? task.sceneUrl;
  return (
    <button type="button" onClick={() => onOpen(task.id)} aria-label={`Open result, ${task.status}`} className="relative block aspect-square w-full overflow-hidden rounded-lg bg-control text-left hover:outline hover:outline-2 hover:outline-info">
      {task.status === "failed" ? <span className="flex h-full flex-col items-center justify-center gap-1 bg-danger-well p-2 text-center text-xs text-danger">Failed<span className="break-all font-mono text-[11px] text-body">{task.errorCode}</span></span>
        : isActive(task) ? <span className="shimmer flex h-full items-center justify-center text-xs text-muted"><span className="flex items-center gap-1.5 rounded-full bg-canvas px-2 py-1 text-fg"><Spinner />{task.status === "queued" || task.runwayStatus === "THROTTLED" ? "Queued" : task.status === "done" ? "Compositing" : "Running"}</span></span>
        : task.kind === "video" && url ? <video src={url} muted playsInline loop preload="metadata" onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} className="h-full w-full object-cover" />
        : url ? <Img src={url} alt="" className="absolute inset-0" sizes="220px" /> : null}
      {!isActive(task) && task.status !== "failed" && <span className="absolute right-1.5 top-1.5">{task.annotations.length ? <ScoreBadge value={avg(task)} /> : <span className="rounded bg-canvas/80 px-1.5 py-0.5 text-[11px] text-fg">To score</span>}</span>}
    </button>
  );
}

export function EvalSuite({ suite, role }: { suite: Suite; role: Role }) {
  const router = useRouter();
  const { cases, runs, tasks, products, defaultImage, defaultVideo, creditBalance } = suite;
  const [tab, setTab] = useState<Tab>("scoreboard");
  const [kind, setKind] = useState<EvalKind>("image");
  const [runFilter, setRunFilter] = useState<string>("all");
  const [blind, setBlind] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const active = tasks.some(isActive);
  useEffect(() => {
    if (!active) return;
    let stop = false;
    (async () => {
      while (!stop) {
        await fetch("/api/eval/tick", { method: "POST" }).catch(() => undefined);
        if (stop) return;
        router.refresh();
        await new Promise((r) => setTimeout(r, 3000));
      }
    })();
    return () => { stop = true; };
  }, [active, router]);

  const scoped = useMemo(() => tasks.filter((t) => t.kind === kind && (runFilter === "all" || t.run_id === runFilter)), [tasks, kind, runFilter]);
  const summaries = useMemo(() => summarizeModels(scoped.map((t) => ({ id: t.id, model: t.model, status: t.status, seconds: t.seconds, credits: t.credits })), scoped.flatMap((t) => t.annotations)), [scoped]);
  const models = useMemo(() => summaries.map((s) => s.model), [summaries]);
  const shownCases = useMemo(() => cases.filter((c) => c.kind === kind && scoped.some((t) => t.case_id === c.id)), [cases, kind, scoped]);
  const alias = useMemo(() => {
    const sorted = [...models].sort((a, b) => [...a].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7) % 997 - [...b].reduce((n, ch) => n * 31 + ch.charCodeAt(0), 7) % 997);
    return new Map(sorted.map((m, i) => [m, `Model ${String.fromCharCode(65 + i)}`]));
  }, [models]);
  const name = (m: string) => (blind ? alias.get(m) ?? m : modelLabel(m));

  // Newest attempt for each prompt and model. The drawer shows earlier ones.
  const latest = useMemo(() => {
    const map = new Map<string, EvalTask>();
    for (const t of scoped) if (!map.has(`${t.case_id}:${t.model}`)) map.set(`${t.case_id}:${t.model}`, t);
    return map;
  }, [scoped]);
  const queue = useMemo(() => shownCases.flatMap((c) => models.map((m) => latest.get(`${c.id}:${m}`)).filter((t): t is EvalTask => !!t && t.status === "done" && !isActive(t))), [shownCases, models, latest]);

  const open = tasks.find((t) => t.id === openId);
  const finished = tasks.filter((t) => t.status === "done");
  const scored = finished.filter((t) => t.annotations.length).length;

  return (
    <>
      <div className="flex flex-wrap gap-4">
        <StatTile label="TASKS" value={tasks.length} note={`${tasks.filter(isActive).length} running, ${tasks.filter((t) => t.status === "failed").length} failed`} />
        <StatTile label="SCORED" value={`${scored} of ${finished.length}`} note="Results with feedback" />
        <StatTile label="RUNS SAVED" value={runs.length} />
        <StatTile label="CREDITS SPENT" value={tasks.reduce((s, t) => s + t.credits, 0).toLocaleString()} note={creditBalance !== null ? `${creditBalance.toLocaleString()} available` : undefined} />
      </div>

      <div role="tablist" aria-label="Suite" className="flex flex-wrap border-b border-line-soft">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`border-b-2 px-3.5 py-2.5 ${tab === t ? "border-fg font-semibold" : "border-transparent font-medium text-muted hover:text-fg"}`}>{TAB_LABEL[t]}</button>)}
      </div>

      {tab === "scoreboard" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(["image", "video"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setRunFilter("all"); }} className={pill(kind === k)}>{k === "image" ? "Images" : "Video"}</button>)}
              <label className="ml-1 flex items-center gap-2 text-[13px] text-muted">Run
                <select value={runFilter} onChange={(e) => setRunFilter(e.target.value)} className="max-w-[280px] rounded-lg border border-line-strong bg-well px-2 py-1.5 text-fg">
                  <option value="all">All runs</option>
                  {runs.filter((r) => r.kind === kind).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-[13px] text-body" title="Hide model names so scores aren't influenced by them">
              <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} className="size-4 accent-[#9fb3ff]" /> Blind scoring
            </label>
          </div>

          {scoped.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-dashed bg-placeholder p-12 text-center">
              <h2 className="text-lg font-semibold">No {kind} results yet</h2>
              <p className="mt-1 text-muted">Start a run to fill this in.</p>
              <div className="mt-3"><Button variant="primary" onClick={() => setTab("new")}>New run</Button></div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-[14px] border border-line bg-table">
                <table className="w-full min-w-[820px] border-collapse">
                  <thead><tr className="text-left text-xs tracking-[0.08em] text-muted">{["RANK", "MODEL", "SCORE", "SCORED", "SUCCESS", "AVG TIME", "AVG CREDITS", "PUBLISH-READY", "COMMON ISSUES"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {summaries.map((s, i) => (
                      <tr key={s.model} className="border-t border-line text-body">
                        <td className="px-4 py-3">{s.overall !== null ? i + 1 : "–"}</td>
                        <td className="px-4 py-3 font-semibold text-fg">{name(s.model)}{!blind && s.model === (kind === "image" ? defaultImage : defaultVideo) && <span className="ml-2 align-middle"><Chip>Default</Chip></span>}</td>
                        <td className="px-4 py-3">{s.overall !== null ? <ScoreBadge value={s.overall} /> : <span className="text-muted">Not scored</span>}</td>
                        <td className="px-4 py-3">{s.scored} of {s.done}</td>
                        <td className="px-4 py-3">{s.tasks - s.active ? `${s.done} of ${s.tasks - s.active}` : "Running"}</td>
                        <td className="px-4 py-3">{s.avgSeconds !== null ? `${Math.round(s.avgSeconds)} s` : "–"}</td>
                        <td className="px-4 py-3">{s.avgCredits !== null ? Math.round(s.avgCredits) : "–"}</td>
                        <td className="px-4 py-3">{s.publishReady}</td>
                        <td className="px-4 py-3 text-xs text-muted">{s.topIssues.map((t) => `${t.tag} (${t.count})`).join(", ") || "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-semibold leading-7 tracking-[-0.01em]">Every prompt, every model</h2>
                {queue.some((t) => !t.annotations.length) && <Button variant="primary" onClick={() => setOpenId(queue.find((t) => !t.annotations.length)!.id)}>Score next unscored</Button>}
              </div>
              <div className="overflow-x-auto rounded-[14px] border border-line">
                <table className="w-full border-collapse" style={{ minWidth: 240 + models.length * 190 }}>
                  <thead><tr className="text-left text-xs tracking-[0.04em] text-muted"><th className="sticky left-0 z-10 w-60 bg-table px-3 py-3 font-medium">PROMPT</th>{models.map((m) => <th key={m} className="min-w-[180px] bg-table px-2 py-3 font-medium">{name(m)}</th>)}</tr></thead>
                  <tbody>
                    {shownCases.map((c) => (
                      <tr key={c.id} className="border-t border-line align-top">
                        <th scope="row" className="sticky left-0 z-10 w-60 bg-table px-3 py-3 text-left font-normal">
                          <span className="block font-semibold">{c.title}</span>
                          <span className="mt-0.5 block text-xs text-muted">{CATEGORY_LABEL[c.category] ?? c.category}{c.kind === "image" && c.shape === "wide" ? " · Wide" : ""}</span>
                          {c.look_for && <span className="mt-1.5 block text-xs leading-4 text-muted">{c.look_for}</span>}
                        </th>
                        {models.map((m) => <td key={m} className="p-2"><Cell task={latest.get(`${c.id}:${m}`)} onOpen={setOpenId} /></td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === "new" && <NewRun cases={cases} products={products} role={role} onStarted={(k) => { setKind(k); setRunFilter("all"); setTab("scoreboard"); router.refresh(); }} />}

      {tab === "runs" && (
        runs.length === 0 ? <p className="text-muted">No runs yet.</p> : (
          <div className="overflow-x-auto rounded-[14px] border border-line bg-table">
            <table className="w-full min-w-[760px] border-collapse">
              <thead><tr className="text-left text-xs tracking-[0.08em] text-muted">{["RUN", "STARTED", "PROGRESS", "SCORED", "CREDITS", ""].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {runs.map((r) => {
                  const rows = tasks.filter((t) => t.run_id === r.id);
                  const running = rows.filter(isActive).length;
                  const failed = rows.filter((t) => t.status === "failed").length;
                  const done = rows.filter((t) => t.status === "done");
                  return (
                    <tr key={r.id} className="border-t border-line text-body">
                      <td className="px-4 py-3"><span className="font-semibold text-fg">{r.name}</span><span className="block text-xs text-muted">{r.kind === "image" ? "Images" : "Video"} · by {r.created_by}</span></td>
                      <td className="whitespace-nowrap px-4 py-3">{new Date(r.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="px-4 py-3">{running ? <Chip tone="info" spin>{rows.length - running} of {rows.length}</Chip> : failed ? <Chip tone="warn">{done.length} done, {failed} failed</Chip> : <Chip tone="ok">{done.length} done</Chip>}</td>
                      <td className="px-4 py-3">{done.filter((t) => t.annotations.length).length} of {done.length}</td>
                      <td className="px-4 py-3">{rows.reduce((s, t) => s + t.credits, 0)}</td>
                      <td className="px-4 py-3 text-right"><Button variant="secondary" onClick={() => { setKind(r.kind); setRunFilter(r.id); setTab("scoreboard"); }}>View results</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "prompts" && <Prompts cases={cases} role={role} />}

      {open && <TaskDrawer key={open.id} task={open} evalCase={cases.find((c) => c.id === open.case_id)} attempts={tasks.filter((t) => t.case_id === open.case_id && t.model === open.model)} role={role} blindName={blind ? name(open.model) : null} isDefault={open.model === (open.kind === "image" ? defaultImage : defaultVideo)} queue={queue} onOpen={setOpenId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function NewRun({ cases, products, role, onStarted }: { cases: EvalCase[]; products: Suite["products"]; role: Role; onStarted: (k: EvalKind) => void }) {
  const [kind, setKind] = useState<EvalKind>("image");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [name, setName] = useState("");
  const [imagePicked, setImagePicked] = useState(["gemini_image3.1_flash", "gemini_image3_pro", "gpt_image_2_5_sunburst"]);
  const [videoPicked, setVideoPicked] = useState(["gen4.5", "seedance2", "veo3.1"]);
  const available = useMemo(() => cases.filter((c) => c.kind === kind && c.is_active), [cases, kind]);
  const [unpicked, setUnpicked] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const picked = kind === "image" ? imagePicked : videoPicked;
  const chosenCases = available.filter((c) => !unpicked.includes(c.id));
  const est = estimateRun(chosenCases.length, list.filter((m) => picked.includes(m.id)).map((m) => m.credits));
  const needsConfirm = est.credits > CONFIRM_OVER_CREDITS;
  const tooBig = est.tasks > MAX_TASKS_PER_RUN;
  const canRun = can(role, "run");
  const toggleModel = (id: string) => { setConfirmed(false); (kind === "image" ? setImagePicked : setVideoPicked)((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id])); };
  const groups = useMemo(() => [...new Set(available.map((c) => c.category))], [available]);
  const begin = () => start(async () => {
    setError(null);
    const res = await fetch("/api/eval/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, kind, caseIds: chosenCases.map((c) => c.id), models: picked, name: name || undefined, confirmedCredits: needsConfirm ? est.credits : undefined }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    onStarted(kind);
  });
  if (!products.length) return <Notice tone="info" title="No products are ready">Upload a product image first, so there is a real pack to composite.</Notice>;
  return (
    <Panel title="SET UP A RUN">
      <div className="mb-4 flex gap-2">{(["image", "video"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setUnpicked([]); setConfirmed(false); }} className={pill(kind === k)}>{k === "image" ? "Images" : "Video"}</button>)}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="ev-product" className="text-xs text-muted">Product</label><select id="ev-product" value={productId} onChange={(e) => setProductId(e.target.value)} className={field}>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}</select></div>
        <div><label htmlFor="ev-name" className="text-xs text-muted">Run name. Optional</label><input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. First full image pass" className={field} /></div>
      </div>
      <fieldset className="mt-5">
        <legend className="text-xs text-muted">Models</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {list.map((m) => { const on = picked.includes(m.id); return (
            <label key={m.id} className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 ${on ? "border-info bg-info-bg/40" : "border-line-strong"}`}>
              <input type="checkbox" checked={on} onChange={() => toggleModel(m.id)} className="mt-0.5 size-4 flex-none accent-[#9fb3ff]" />
              <span className="min-w-0 flex-1"><span className="block font-medium">{m.label}</span><span className="block text-xs leading-4 text-muted">{m.credits} credits each · {m.note}</span></span>
            </label>
          ); })}
        </div>
      </fieldset>
      <fieldset className="mt-5">
        <legend className="flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>Prompts · {chosenCases.length} of {available.length}</span></legend>
        <div className="mb-2 mt-1 flex gap-3 text-xs"><button type="button" className="text-info hover:text-info-strong" onClick={() => { setUnpicked([]); setConfirmed(false); }}>Select all</button><button type="button" className="text-info hover:text-info-strong" onClick={() => { setUnpicked(available.map((c) => c.id)); setConfirmed(false); }}>Clear</button></div>
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-xs font-semibold tracking-[0.06em] text-muted">{(CATEGORY_LABEL[g] ?? g).toUpperCase()}</div>
              <div className="grid gap-2 md:grid-cols-2">
                {available.filter((c) => c.category === g).map((c) => { const on = !unpicked.includes(c.id); return (
                  <label key={c.id} className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 ${on ? "border-line-strong bg-well" : "border-line-soft opacity-60"}`}>
                    <input type="checkbox" checked={on} onChange={() => { setConfirmed(false); setUnpicked((l) => (on ? [...l, c.id] : l.filter((x) => x !== c.id))); }} className="mt-0.5 size-4 flex-none accent-[#9fb3ff]" />
                    <span className="min-w-0"><span className="block font-medium">{c.title}{c.shape === "wide" && c.kind === "image" && <span className="ml-1.5 text-xs font-normal text-muted">Wide</span>}</span><span className="block text-xs leading-4 text-muted">{c.look_for}</span></span>
                  </label>
                ); })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      {error && <div className="mt-4"><Notice title="That didn't start">{error}</Notice></div>}
      <div className="mt-5 flex flex-col gap-3 rounded-[10px] border border-line-strong p-4">
        <div className="text-body"><b className="text-fg">{est.tasks} tasks</b> · est. <b className="text-fg">{est.credits.toLocaleString()} credits</b> (${(est.credits / 100).toFixed(2)}). {kind === "video" ? "Each model starts from the same clean frame of an approved Lifestyle image." : "Runs inside Runway's limits, with the rest queued."} Close the page and it stops advancing, but nothing is lost.</div>
        {tooBig && <p className="text-[13px] text-danger">A run can have up to {MAX_TASKS_PER_RUN} tasks. Choose fewer prompts or models.</p>}
        {needsConfirm && !tooBig && <label className="flex items-center gap-2.5"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="size-4 accent-[#f2c35b]" />I understand this run will spend about {est.credits.toLocaleString()} credits</label>}
        <div><Button variant="primary" pending={pending} disabled={!canRun || est.tasks === 0 || tooBig || (needsConfirm && !confirmed)} onClick={begin}>Start run</Button>{!canRun && <span className="ml-3 text-[13px] text-muted">Switch to Producer or Owner to start.</span>}</div>
      </div>
    </Panel>
  );
}

function Prompts({ cases, role }: { cases: EvalCase[]; role: Role }) {
  const router = useRouter();
  const canEdit = can(role, "run");
  const [kind, setKind] = useState<EvalKind>("image");
  const [draft, setDraft] = useState({ title: "", prompt: "", look_for: "", shape: "square" as "square" | "wide" });
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", prompt: "", look_for: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (method: "POST" | "PATCH", payload: object, done?: () => void) => start(async () => {
    setError(null);
    const res = await fetch("/api/eval/cases", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) return setError((await res.json()).error);
    done?.();
    router.refresh();
  });
  const rows = cases.filter((c) => c.kind === kind && c.category !== "earlier");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">{(["image", "video"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={pill(kind === k)}>{k === "image" ? "Images" : "Video"}</button>)}</div>
      {error && <Notice title="That didn't save">{error}</Notice>}
      <ul className="flex flex-col gap-2.5">
        {rows.map((c) => (
          <li key={c.id} className={`rounded-[14px] border border-line bg-surface p-4 ${c.is_active ? "" : "opacity-60"}`}>
            {editing === c.id ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-muted">Title<input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} className={field} /></label>
                <label className="text-xs text-muted">Prompt<textarea rows={4} value={edit.prompt} onChange={(e) => setEdit({ ...edit, prompt: e.target.value })} className={`${field} resize-y`} /></label>
                <label className="text-xs text-muted">What to look for<input value={edit.look_for} onChange={(e) => setEdit({ ...edit, look_for: e.target.value })} className={field} /></label>
                <div className="flex gap-2"><Button variant="primary" pending={pending} onClick={() => send("PATCH", { id: c.id, ...edit }, () => setEditing(null))}>Save</Button><Button onClick={() => setEditing(null)}>Cancel</Button></div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.title}</span><Chip>{CATEGORY_LABEL[c.category] ?? c.category}</Chip>{c.kind === "image" && c.shape === "wide" && <Chip>Wide</Chip>}{!c.is_active && <Chip tone="warn">Retired</Chip>}</div>
                  {canEdit && <div className="flex gap-3 text-xs">{!c.agent_prompt && <button type="button" className="text-info hover:text-info-strong" onClick={() => { setEditing(c.id); setEdit({ title: c.title, prompt: c.prompt, look_for: c.look_for }); }}>Edit</button>}<button type="button" className="text-muted hover:text-fg" onClick={() => send("PATCH", { id: c.id, is_active: !c.is_active })}>{c.is_active ? "Retire" : "Restore"}</button></div>}
                </div>
                <p className="mt-2 text-[13px] leading-[18px] text-body">{c.prompt}</p>
                {c.look_for && <p className="mt-1.5 text-xs leading-4 text-muted">Look for: {c.look_for}</p>}
              </>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <Panel title="ADD A PROMPT">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-muted">Title<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className={field} /></label>
            {kind === "image" && <label className="text-xs text-muted">Shape<select value={draft.shape} onChange={(e) => setDraft({ ...draft, shape: e.target.value as "square" | "wide" })} className={field}><option value="square">Square</option><option value="wide">Wide</option></select></label>}
          </div>
          <label className="mt-3 block text-xs text-muted">Prompt{kind === "image" ? ". Describe an empty scene: the real pack is added afterwards" : ". Describe motion: the image already shows the scene"}<textarea rows={3} value={draft.prompt} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} className={`${field} resize-y`} /></label>
          <label className="mt-3 block text-xs text-muted">What to look for. Optional<input value={draft.look_for} onChange={(e) => setDraft({ ...draft, look_for: e.target.value })} className={field} /></label>
          <div className="mt-3"><Button variant="primary" pending={pending} disabled={draft.title.trim().length < 2 || draft.prompt.trim().length < 10} onClick={() => send("POST", { kind, ...draft }, () => setDraft({ title: "", prompt: "", look_for: "", shape: "square" }))}>Add prompt</Button></div>
        </Panel>
      )}
    </div>
  );
}
