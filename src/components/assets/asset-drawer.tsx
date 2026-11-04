"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Notice, Spinner, type Tone } from "@/components/ui";
import { Img } from "@/components/ui/image";
import { summarizeChecks } from "@/lib/domain/status";
import { can } from "@/lib/domain/permissions";
import { CHANNEL_LABEL, SHOT_LABEL, type Asset, type AssetState, type CheckRow, type Role } from "@/lib/domain/types";
import { PublishPanel } from "./publish-panel";

type DrawerData = {
  asset: Asset & { url: string | null };
  checks: CheckRow[];
  generations: { id: string; model: string; ratio: string; prompt: string | null; status: string; credits: number; attempt: number; error_code: string | null; created_at: string; inputs: { direction?: string; feedback?: string } }[];
  events: { id: number; type: string; from_state: string | null; to_state: string | null; actor: string; at: string }[];
  reviews: { id: string; decision: string; reason_code: string | null; note: string | null; regenerate: boolean; reviewer_role: string; created_at: string }[];
  publications: { id: string; target: string; channel: string; url: string | null; published_by: string; published_at: string }[];
  history: { id: string; version: number; state: AssetState; feedback: string | null; refine: { action?: string } | null; credits: number; url: string | null; created_at: string }[];
  sources: { kind: string; url: string }[];
  product: { name: string; sku: string; approved_claims: string[] } | null;
};

const STATE_CHIP: Record<AssetState, [string, Tone]> = {
  draft: ["Not started", "neutral"], generating: ["Generating", "info"], compositing: ["Compositing", "info"], checking: ["Checks", "plain"], needs_review: ["In review", "warn"],
  approved: ["Approved", "ok"], published: ["Published", "solid"], failed: ["Failed", "danger"], rejected: ["Rejected", "danger"],
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const REASONS = [["label_issue", "Label issue"], ["claim_issue", "Claim issue"], ["off_brand", "Off brand"], ["spec_issue", "Spec issue"], ["quality", "Quality"], ["other", "Other"]] as const;

function CheckList({ checks }: { checks: CheckRow[] }) {
  const mark = { pass: ["●", "text-ok", "Pass"], warn: ["▲", "text-warn", "Reviewer to confirm"], fail: ["■", "text-danger", "Failed"] } as const;
  if (!checks.length) return <p className="text-muted">Checks haven&apos;t run yet.</p>;
  const order = { fail: 0, warn: 1, pass: 2 };
  return (
    <ul>
      {[...checks].sort((a, b) => order[a.result] - order[b.result]).map((c) => (
        <li key={c.id} className="flex gap-2.5 border-t border-line-soft py-2">
          <span aria-hidden="true" className={mark[c.result][1]}>{mark[c.result][0]}</span>
          <span className="min-w-0 flex-1">
            {c.label}
            {c.detail?.note && <span className="block text-xs leading-4 text-muted">{c.detail.note}</span>}
          </span>
          <span className={`whitespace-nowrap text-xs ${mark[c.result][1]}`}>{mark[c.result][2]}</span>
        </li>
      ))}
    </ul>
  );
}

function ReviewControls({ data, onDone }: { data: DrawerData; onDone: () => void }) {
  const warnings = data.checks.filter((c) => c.result === "warn");
  const [mode, setMode] = useState<"idle" | "reject">("idle");
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [regen, setRegen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const send = (payload: object) => start(async () => {
    setError(null);
    const res = await fetch(`/api/assets/${data.asset.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) return setError((await res.json()).error);
    onDone();
  });
  return (
    <div className="flex flex-col gap-3 border-t border-line-soft pt-3">
      {error && <Notice title="That didn't go through">{error}</Notice>}
      {mode === "idle" ? (
        <>
          {warnings.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-[10px] border border-warn-bg bg-[#1d1809] p-3">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 size-4 flex-none accent-[#f2c35b]" />
              <span>I&apos;ve confirmed: {warnings.map((w) => w.label).join("; ")}</span>
            </label>
          )}
          <div className="flex gap-2">
            <Button variant="primary" className="flex-1" pending={pending} disabled={warnings.length > 0 && !confirmed} onClick={() => send({ decision: "approve", confirmedWarnings: warnings.length > 0 })}>Approve</Button>
            <Button className="flex-1" onClick={() => setMode("reject")}>Reject</Button>
          </div>
        </>
      ) : (
        <>
          <fieldset>
            <legend className="mb-2 text-xs text-muted">Reason (required)</legend>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map(([value, label]) => (
                <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 ${reason === value ? "border-info bg-info-bg text-info-strong" : "border-line-strong text-body"}`}>
                  <input type="radio" name="reason" checked={reason === value} onChange={() => setReason(value)} className="size-4 accent-[#9fb3ff]" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <div>
            <label htmlFor="note" className="text-xs text-muted">Feedback. Optional, but the agent works from it</label>
            <textarea id="note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" className="mt-1.5 w-full resize-y rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg" />
          </div>
          <label className="flex items-start gap-2.5 rounded-[10px] border border-line-strong p-3">
            <input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} className="mt-0.5 size-4 flex-none accent-[#9fb3ff]" />
            <span><span className="font-medium">Regenerate with this feedback</span><span className="block text-xs leading-4 text-muted">{regen ? "The agent starts a new version straight away." : "It goes back to the producer to decide what to do."}</span></span>
          </label>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setMode("idle")}>Cancel</Button>
            <Button variant="primary" pending={pending} disabled={!reason} onClick={() => send({ decision: "reject", reasonCode: reason, note: note.trim() || null, regenerate: regen })}>{regen ? "Reject and regenerate" : "Reject"}</Button>
          </div>
        </>
      )}
    </div>
  );
}

export function AssetDrawer({ assetId, role, onClose }: { assetId: string; role: Role; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<DrawerData | null>(null);
  const [tab, setTab] = useState<"Packet" | "Inputs" | "Log" | "History">("Packet");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const load = useCallback(() => fetch(`/api/assets/${assetId}`).then(async (r) => {
    if (!r.ok) throw new Error("load");
    setData(await r.json());
  }).catch(() => setError("This asset didn't load.")), [assetId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const afterAction = () => { router.refresh(); onClose(); };
  const a = data?.asset;
  const summary = data ? summarizeChecks(data.checks.map((c) => c.result)) : null;
  const canSubmit = !!a && can(role, "submit") && a.state === "checking" && !!a.checks_done_at && !summary?.blocked;
  const submit = () => start(async () => {
    setError(null);
    const res = await fetch(`/api/assets/${assetId}/submit`, { method: "POST" });
    if (!res.ok) return setError((await res.json()).error);
    afterAction();
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-label="Asset details" className="flex h-full w-full max-w-[640px] flex-col gap-4 overflow-y-auto border-l border-line-strong bg-raised p-5">
        {!data ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted">{error ?? <><Spinner size={14} /> Loading</>}</div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold leading-[26px]">{SHOT_LABEL[a!.shot_key]}</h2>
                  <Chip tone={STATE_CHIP[a!.state][1]}>{STATE_CHIP[a!.state][0]}</Chip>
                </div>
                <div className="text-[13px] text-muted">{data.product?.sku} · {CHANNEL_LABEL[a!.channel]} · version {a!.version}{a!.width ? ` · ${a!.width} × ${a!.height}` : ""}</div>
              </div>
              <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-11 flex-none items-center justify-center rounded-[10px] border border-line-strong bg-control text-fg">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 6l12 12" /><path d="M18 6 6 18" /></svg>
              </button>
            </div>
            {a!.url && (a!.shot_key === "video"
              ? <video src={a!.url} controls playsInline className="mx-auto max-h-[420px] rounded-[10px] bg-canvas" />
              : <Img src={a!.url} alt={a!.alt_text ?? "Asset"} contain priority className="aspect-square w-full flex-none rounded-[10px] bg-white" sizes="600px" />)}
            {a!.feedback && <Notice tone="warn" title={a!.state === "rejected" ? "Rejected by the reviewer" : "Working from reviewer feedback"}>{a!.feedback}</Notice>}
            <div role="tablist" aria-label="Asset details" className="flex flex-wrap border-b border-line-soft">
              {(["Packet", "Inputs", "Log", "History"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2.5 ${tab === t ? "border-fg font-semibold" : "border-transparent font-medium text-muted hover:text-fg"}`}>{t === "Packet" ? "Pre-compliance report" : t === "Log" ? "Generation log" : t}</button>
              ))}
            </div>
            {tab === "Packet" && (
              <div>
                {summary && summary.total > 0 && <p className={`mb-2 text-[13px] ${summary.fail ? "text-danger" : summary.warn ? "text-warn" : "text-ok"}`}>{summary.fail ? `${summary.fail} failed` : summary.warn ? `${summary.pass} of ${summary.total} passed, ${summary.warn} for the reviewer` : `All ${summary.total} checks passed`}</p>}
                <CheckList checks={data.checks} />
                {a!.submitted_at && <p className="mt-2 text-xs text-muted">Submitted {when(a!.submitted_at)}.</p>}
              </div>
            )}
            {tab === "Inputs" && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {data.sources.map((s) => <figure key={s.kind}><Img src={s.url} alt={s.kind} contain className={`aspect-square rounded-[10px] ${s.kind === "cutout" ? "bg-[#1b5e4b]" : "bg-white"}`} sizes="280px" /><figcaption className="mt-1 text-xs text-muted">{s.kind === "cutout" ? "Real pack cutout. Product pixels come only from here" : "Uploaded image"}</figcaption></figure>)}
                </div>
                <div className="text-[13px]"><span className="text-muted">Approved claims: </span>{data.product?.approved_claims.join(", ") || "None"}</div>
                {data.generations[0]?.prompt ? <div><div className="text-xs text-muted">Prompt the agent wrote · {data.generations[0].model}</div><p className="mt-1.5 rounded-[10px] border border-line-strong bg-well p-3 text-[13px] leading-[18px] text-body">{data.generations[0].prompt}</p></div> : <p className="text-[13px] text-muted">No Runway call. This is rendered from the real pack and SKU data.</p>}
              </div>
            )}
            {tab === "Log" && (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="mb-1 text-xs tracking-[0.08em] text-muted">MODEL CALLS</div>
                  {data.generations.length === 0 && <p className="text-[13px] text-muted">None. 0 credits.</p>}
                  <ul>{data.generations.map((g) => <li key={g.id} className="flex justify-between gap-3 border-t border-line-soft py-2"><span><span className="font-medium">{g.model}</span><span className="block text-xs text-muted">{g.status}{g.attempt ? ` · ${g.attempt + 1} attempts` : ""}{g.error_code ? ` · ${g.error_code}` : ""} · {when(g.created_at)}</span></span><span className="whitespace-nowrap text-xs text-muted">{g.credits} credits</span></li>)}</ul>
                </div>
                <div>
                  <div className="mb-1 text-xs tracking-[0.08em] text-muted">STATE CHANGES</div>
                  <ul>{data.events.map((e) => <li key={e.id} className="flex justify-between gap-3 border-t border-line-soft py-2"><span className="font-mono text-[13px]">{e.from_state ? `${e.from_state} → ${e.to_state}` : e.type}</span><span className="whitespace-nowrap text-xs text-muted">{e.actor} · {when(e.at)}</span></li>)}</ul>
                </div>
              </div>
            )}
            {tab === "History" && (
              <ul className="flex flex-col gap-2.5">
                {data.history.map((h) => (
                  <li key={h.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
                    {h.url && a!.shot_key !== "video" && a!.shot_key !== "copy" ? <Img src={h.url} alt={`Version ${h.version}`} className="size-[72px] flex-none rounded-lg bg-white" sizes="72px" /> : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Version {h.version}</span><Chip tone={STATE_CHIP[h.state][1]}>{STATE_CHIP[h.state][0]}</Chip></div>
                      <div className="text-xs leading-4 text-muted">{h.refine?.action?.replaceAll("_", " ") ?? "From the shot list"} · {h.credits} credits · {when(h.created_at)}</div>
                      {h.feedback && <div className="mt-1.5 text-[13px] leading-[18px] text-body">{h.feedback}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex flex-col gap-3">
              {error && <Notice title="That didn't go through">{error}</Notice>}
              {canSubmit && <Button variant="primary" pending={pending} onClick={submit}>Submit for review</Button>}
              {a!.state === "needs_review" && can(role, "review") && <ReviewControls data={data} onDone={afterAction} />}
              {a!.state === "needs_review" && !can(role, "review") && <p className="text-[13px] text-muted">With the reviewer. Switch to the Reviewer role to approve or reject.</p>}
              <PublishPanel asset={a!} publications={data.publications} role={role} onDone={afterAction} />
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
