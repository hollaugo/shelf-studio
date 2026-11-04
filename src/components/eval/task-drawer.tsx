"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Notice } from "@/components/ui";
import { can } from "@/lib/domain/permissions";
import { CRITERIA, ISSUE_TAGS, isTextResult, READY_TAGS } from "@/lib/eval/criteria";
import { evalModelLabel, evalModels } from "@/lib/eval/models";
import type { EvalCase, EvalTask } from "@/lib/eval/data";
import type { AnalysisOutput } from "@/lib/pipeline/analysis-schema";
import type { Role } from "@/lib/domain/types";
import { AnalysisView, CheckPanel, ListingView, type CopyOutput } from "./task-output";

function Stars({ label, hint, value, onChange }: { label: string; hint?: string; value: number | undefined; onChange: (n: number) => void }) {
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-2">
      <legend className="sr-only">{label}</legend>
      <span className="min-w-0"><span className="block font-medium">{label}</span>{hint && <span className="block text-xs leading-4 text-muted">{hint}</span>}</span>
      <span className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={`flex size-9 cursor-pointer items-center justify-center rounded-lg border text-[13px] ${value === n ? "border-info bg-info-bg font-semibold text-info-strong" : "border-line-strong text-body hover:border-muted"}`}>
            <input type="radio" name={label} checked={value === n} onChange={() => onChange(n)} className="sr-only" />{n}
          </label>
        ))}
      </span>
    </fieldset>
  );
}

export function TaskDrawer({ task, evalCase, attempts, role, blindName, isDefault, queue, onOpen, onClose }: { task: EvalTask; evalCase?: EvalCase; attempts: EvalTask[]; role: Role; blindName: string | null; isDefault: boolean; queue: EvalTask[]; onOpen: (id: string) => void; onClose: () => void }) {
  const router = useRouter();
  const mine = task.annotations.find((a) => a.author_role === role);
  const others = task.annotations.filter((a) => a.author_role !== role);
  const [overall, setOverall] = useState<number | undefined>(mine?.overall);
  const [scores, setScores] = useState<Record<string, number>>(mine?.scores ?? {});
  const [tags, setTags] = useState<string[]>(mine?.tags ?? []);
  const [note, setNote] = useState(mine?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const meta = evalModels(task.kind).find((m) => m.id === task.model);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const next = queue.find((t) => t.id !== task.id && !t.annotations.length);
  const save = (thenNext: boolean) => start(async () => {
    setError(null);
    const res = await fetch(`/api/eval/tasks/${task.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overall, scores, tags, note: note.trim() || null }) });
    if (!res.ok) return setError((await res.json()).error);
    setSaved(true);
    router.refresh();
    if (thenNext && next) onOpen(next.id);
  });
  const makeDefault = () => start(async () => {
    setError(null);
    const res = await fetch("/api/lab/use", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: task.kind, model: task.model }) });
    if (!res.ok) return setError((await res.json()).error);
    router.refresh();
  });
  const url = task.compositeUrl ?? task.sceneUrl;
  const done = task.status === "done";
  const waiting = task.pending;
  const spend = isTextResult(task.kind)
    ? done ? ` · $${task.costUsd.toFixed(3)} · ${(task.inputTokens + task.outputTokens).toLocaleString()} tokens` : meta ? ` · about $${(meta.credits / 100).toFixed(2)}` : ""
    : done ? ` · ${task.credits} credits${task.costUsd ? ` + $${task.costUsd.toFixed(3)} check` : ""}` : meta ? ` · est. ${meta.credits} credits` : "";
  const caption = task.kind === "cutout" ? "Shown on magenta, so fringes and leftover background stand out. Open full size" : "As it would publish. Open full size";
  const rawLink = task.kind === "cutout" ? "Open the model's raw mask" : "Open the model's raw scene";

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label="Result" className="flex h-full w-full max-w-[720px] flex-col gap-4 overflow-y-auto border-l border-line-strong bg-raised p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-[26px]">{evalCase?.title ?? "Result"}</h2>
            <div className="text-[13px] text-muted">{blindName ?? evalModelLabel(task.model)}{task.seconds !== null ? ` · ${task.seconds} s` : ""}{spend}{!blindName && isDefault ? " · current default" : ""}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 flex-none items-center justify-center rounded-[10px] border border-line-strong bg-control text-fg"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg></button>
        </div>

        {task.status === "failed" && <Notice title={task.errorCode ?? "Failed"}>{task.error}</Notice>}
        {waiting && task.status !== "failed" && <Notice tone="info" title="Still running">Results appear here as soon as this finishes.</Notice>}
        {done && !waiting && task.error && <Notice title="Finishing this result failed">{task.error}</Notice>}
        {done && task.kind === "copy" && !!task.output && <ListingView output={task.output as CopyOutput} />}
        {done && task.kind === "analysis" && !!task.output && <AnalysisView output={task.output as AnalysisOutput} />}
        {done && !isTextResult(task.kind) && url && (task.kind === "video"
          ? <video src={url} controls loop playsInline className="mx-auto max-h-[60vh] rounded-[10px] bg-canvas" />
          // eslint-disable-next-line @next/next/no-img-element -- judging quality needs the original pixels, not an optimised copy
          : <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={evalCase?.title ?? "Result"} className="w-full rounded-[10px]" /><span className="mt-1 block text-xs text-muted">{caption}</span></a>)}
        {done && task.kind !== "video" && task.sceneUrl && <a href={task.sceneUrl} target="_blank" rel="noreferrer" className="text-[13px] text-info hover:text-info-strong">{rawLink}</a>}
        {done && task.checks && <CheckPanel checks={task.checks} />}
        {evalCase?.look_for && <div className="rounded-[10px] border border-line-soft p-3 text-[13px] text-body"><span className="text-muted">Look for: </span>{evalCase.look_for}</div>}

        {done && (
          <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
            <h3 className="text-xs font-semibold leading-4 tracking-[0.1em] text-muted">YOUR SCORE · {role.toUpperCase()}</h3>
            <Stars label="Overall" hint="1 is unusable, 5 is publish-ready" value={overall} onChange={setOverall} />
            <div className="border-t border-line-soft" />
            {CRITERIA[task.kind].map((c) => <Stars key={c.key} label={c.label} hint={c.hint} value={scores[c.key]} onChange={(n) => setScores({ ...scores, [c.key]: n })} />)}
            <fieldset>
              <legend className="mb-2 text-xs text-muted">Tags</legend>
              <div className="flex flex-wrap gap-2">
                {ISSUE_TAGS[task.kind].map((t) => { const on = tags.includes(t); return <label key={t} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[13px] ${on ? (READY_TAGS.includes(t) ? "border-ok bg-ok-bg text-ok" : "border-warn bg-warn-bg text-warn") : "border-line-strong text-body hover:border-muted"}`}><input type="checkbox" className="sr-only" checked={on} onChange={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])} />{t}</label>; })}
              </div>
            </fieldset>
            <div>
              <label htmlFor="ev-note" className="text-xs text-muted">Notes. What works, what doesn&apos;t, what you&apos;d change</label>
              <textarea id="ev-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1.5 w-full resize-y rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg" />
            </div>
            {error && <Notice title="That didn't save">{error}</Notice>}
            {saved && !error && <p className="text-[13px] text-ok">Saved.</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" pending={pending} disabled={!overall} onClick={() => save(true)}>{next ? "Save and score next" : "Save"}</Button>
              {next && <Button disabled={!overall || pending} onClick={() => save(false)}>Save</Button>}
              {!overall && <span className="self-center text-[13px] text-muted">Choose an overall score to save.</span>}
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h3 className="mb-2 text-xs font-semibold leading-4 tracking-[0.1em] text-muted">OTHER SCORES</h3>
            <ul className="flex flex-col gap-2">{others.map((a) => <li key={a.id} className="text-[13px] text-body"><b className="capitalize text-fg">{a.author_role}</b> · {a.overall} of 5{a.tags.length ? ` · ${a.tags.join(", ")}` : ""}{a.note && <span className="block text-muted">{a.note}</span>}</li>)}</ul>
          </section>
        )}

        {attempts.length > 1 && (
          <section>
            <h3 className="mb-2 text-xs font-semibold leading-4 tracking-[0.1em] text-muted">ATTEMPTS ON THIS PROMPT · {attempts.length}</h3>
            <div className="flex flex-wrap gap-2">{attempts.map((a) => <button key={a.id} type="button" aria-current={a.id === task.id} onClick={() => onOpen(a.id)} className={`rounded-lg border px-2.5 py-1.5 text-xs ${a.id === task.id ? "border-info text-info-strong" : "border-line-strong text-body"}`}>{new Date(a.created_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}{a.annotations.length ? ` · ${(a.annotations.reduce((s, n) => s + n.overall, 0) / a.annotations.length).toFixed(1)}` : ""}</button>)}</div>
          </section>
        )}

        <details className="rounded-[14px] border border-line bg-surface p-4">
          <summary className="cursor-pointer font-medium">{isTextResult(task.kind) ? "What this model was asked to do" : "The prompt this model received"}</summary>
          <p className="mt-2 text-[13px] leading-[18px] text-body">{task.prompt}</p>
        </details>

        {done && !blindName && !isDefault && (task.kind === "image" || task.kind === "video") && (
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!can(role, "edit_settings") || pending} onClick={makeDefault}>Make {evalModelLabel(task.model)} the default</Button>
            {!can(role, "edit_settings") && <span className="text-[13px] text-muted">Switch to Owner to change this.</span>}
          </div>
        )}
        {blindName && <Chip>Model name hidden for blind scoring</Chip>}
      </aside>
    </div>
  );
}
