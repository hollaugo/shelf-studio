"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Notice, Spinner } from "@/components/ui";
import { AssetCard } from "@/components/assets/asset-card";
import { CopyStudio } from "@/components/copy/copy-studio";
import { RefinePanel } from "@/components/assets/refine-panel";
import { AssetDrawer } from "@/components/assets/asset-drawer";
import { ChannelPreview } from "@/components/preview/channel-preview";
import { setRole } from "@/components/shell/actions";
import { EDIT_MODEL, generationCredits, videoModel } from "@/lib/runway/model-registry";
import { nextStep, type StepAction } from "@/lib/domain/next-step";
import { LiveRefresh } from "./live-refresh";
import type { Detail } from "@/lib/data/detail";
import { CHANNEL_LABEL, type Asset, type Channel, type Role } from "@/lib/domain/types";
import { can } from "@/lib/domain/permissions";

/** A model drew this asset's text, so exact lettering is available if it got the wording wrong. */
const modelDrawn = (asset: Asset) => (asset.shot_key === "claim_card" && !!asset.generation_id) || (asset.refine as { engine?: string } | null)?.engine === "model";

export function Workspace({ detail, role, frontUrl, cutoutUrl }: { detail: Detail; role: Role; frontUrl: string | null; cutoutUrl: string | null }) {
  const router = useRouter();
  const { product, views, estimates, everything, run, channels } = detail;
  const [channel, setChannel] = useState<Channel>(channels[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canRun = can(role, "run");
  const shown = views.filter((v) => v.asset.channel === channel);
  const all = views;
  const copyAsset = shown.find((v) => v.asset.shot_key === "copy")?.asset;
  const [refineId, setRefineId] = useState<string | null>(null);
  const refining = views.find((v) => v.asset.id === refineId && v.asset.channel === channel)?.asset;
  const post = (url: string) => start(async () => {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!res.ok) setError((await res.json()).error);
    router.refresh();
  });
  const canEdit = can(role, "refine");
  const [openId, setOpenId] = useState<string | null>(null);
  const readyHere = shown.filter((v) => v.view.readyToSubmit).map((v) => v.asset.id);
  const approvedHere = shown.filter((v) => v.asset.state === "approved").map((v) => v.asset.id);
  const bulk = (action: "submit" | "publish", ids: string[]) => start(async () => {
    setError(null);
    const res = await fetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ids }) });
    if (!res.ok) setError((await res.json()).error);
    router.refresh();
  });
  const active = run.working > 0 || run.queued > 0 || run.running > 0;

  const launch = (targets: Channel[]) => start(async () => {
    setError(null);
    const res = await fetch(`/api/products/${product.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: targets }) });
    const body = await res.json();
    if (!res.ok) setError(body.error);
    router.refresh();
  });

  const ready = all.filter((v) => v.view.readyToSubmit).length;
  const review = all.filter((v) => v.asset.state === "needs_review").length;
  const done = all.filter((v) => ["approved", "published"].includes(v.asset.state)).length;
  const est = estimates[channel];
  const videoCredits = detail.videoModel ? videoModel(detail.videoModel)?.credits ?? generationCredits({ model: detail.videoModel }) : 0;

  const [view, setView] = useState<"preview" | "assets">("assets");
  const [writeSignal, setWriteSignal] = useState(0);
  const [agentRunning, setAgentRunning] = useState(false);
  const onRunningChange = useCallback((running: boolean) => setAgentRunning(running), []);
  const switchRole = (to: Role) => start(async () => {
    const data = new FormData();
    data.set("role", to);
    await setRole(data);
    router.refresh();
  });
  const videoHere = shown.find((v) => v.asset.shot_key === "video");
  const step = nextStep({
    role, channel: CHANNEL_LABEL[channel], total: shown.length,
    working: shown.filter((v) => ["generating", "compositing"].includes(v.asset.state) || (v.asset.state === "checking" && !v.asset.checks_done_at)).length,
    attention: shown.filter((v) => v.view.blocked || ["failed", "rejected"].includes(v.asset.state)).length,
    ready: readyHere.length, inReview: shown.filter((v) => v.asset.state === "needs_review").length, approved: approvedHere.length,
    published: shown.filter((v) => v.asset.state === "published").length,
    copyDraft: copyAsset?.state === "draft", videoReady: !!videoHere?.view.canGenerate, videoLocked: videoHere?.asset.state === "draft" && !videoHere.view.canGenerate,
    canGenerateMore: est.assets.length > 0,
  });
  const stepButton = (action: StepAction, primary: boolean) => {
    const variant = primary ? "primary" : "secondary";
    switch (action) {
      case "generate": return <Button key={action} variant={variant} pending={pending} onClick={() => launch([channel])}>Generate {CHANNEL_LABEL[channel]} · {est.credits} credits</Button>;
      case "submit": return <Button key={action} variant={variant} pending={pending} onClick={() => bulk("submit", readyHere)}>Submit {readyHere.length} for review</Button>;
      case "write_copy": return <Button key={action} variant={variant} onClick={() => setWriteSignal((n) => n + 1)}>Write the listing</Button>;
      case "video": return <Button key={action} variant={variant} pending={pending} onClick={() => post(`/api/assets/${videoHere!.asset.id}/video`)}>Generate video · {videoCredits} credits</Button>;
      case "publish": return <Button key={action} variant={variant} pending={pending} onClick={() => bulk("publish", approvedHere)}>Publish {approvedHere.length} to website</Button>;
      case "open_review": return <Link key={action} href="/review" className="inline-flex items-center rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas hover:bg-white">Open review board</Link>;
      case "switch_producer": return <Button key={action} variant={variant} pending={pending} onClick={() => switchRole("producer")}>Switch to Producer</Button>;
      case "switch_reviewer": return <Button key={action} variant={variant} pending={pending} onClick={() => switchRole("reviewer")}>Switch to Reviewer</Button>;
      case "view_site": return <Link key={action} href={`/verda/${product.slug}`} className="inline-flex items-center rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas hover:bg-white">View on the website</Link>;
    }
  };

  const cardActions = (item: Detail["views"][number]) => {
    const scene = item.asset.shot_key === "lifestyle" || item.asset.shot_key === "in_use";
            return (
              <>
                {canEdit && item.view.readyToSubmit && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/submit`)}>Submit for review</Button></div>}
                {can(role, "publish") && item.asset.state === "approved" && <div className="flex gap-2"><Button variant="cardPrimary" onClick={() => setOpenId(item.asset.id)}>Publish</Button></div>}
                {item.asset.state === "published" && <div className="flex gap-2"><Button variant="card" onClick={() => setOpenId(item.asset.id)}>View record</Button></div>}
                {role === "reviewer" && item.asset.state === "needs_review" && <div className="flex gap-2"><Button variant="cardPrimary" onClick={() => setOpenId(item.asset.id)}>Review report</Button></div>}
                {canEdit && item.asset.shot_key === "video" && item.view.canGenerate && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/video`)}>Generate video · {videoCredits} credits</Button></div>}
                {role === "reviewer" && (item.view.canGenerate || (item.asset.shot_key === "copy" && item.asset.state === "draft")) && <div className="flex gap-2"><Button variant="card" pending={pending} onClick={() => switchRole("producer")}>Switch to Producer to start</Button></div>}
                {canEdit && modelDrawn(item.asset) && (item.view.blocked || item.asset.state === "failed") && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/exact-text`)}>Use exact lettering · 0 credits</Button></div>}
                {canEdit && (item.view.canRefine || item.view.canRegenerate) && (
                  <div className="flex flex-wrap gap-1.5">
                    {item.view.canRefine && scene && <Button variant="card" onClick={() => setRefineId(item.asset.id)}>Refine</Button>}
                    {item.view.canRefine && item.asset.shot_key === "video" && item.asset.storage_path && <Button variant="card" onClick={() => setRefineId(item.asset.id)}>Edit · {EDIT_MODEL.credits} cr</Button>}
                    {item.view.canRegenerate && <Button variant="card" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/regenerate`)}>Regenerate</Button>}
                  </div>
                )}
              </>
            );
  };

  const copyItem = shown.find((v) => v.asset.shot_key === "copy");

  return (
    <section className="flex min-w-0 flex-col gap-4">
      {active && <LiveRefresh />}
      {error && <Notice title="That didn't start">{error}</Notice>}
      <section aria-label="Next step" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[14px] border border-line bg-surface px-5 py-4">
        <div className="min-w-0 flex-[1_1_320px]">
          <div className="text-xs font-semibold tracking-[0.1em] text-muted">NEXT STEP</div>
          <h2 className="mt-0.5 text-lg font-semibold leading-6">{step.title}</h2>
          <p className="text-[13px] leading-[18px] text-muted">{step.detail}</p>
        </div>
        {step.actions.length > 0 && <div className="flex flex-wrap gap-2">{step.actions.map((action, i) => stepButton(action, i === 0))}</div>}
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft">
        <div role="tablist" aria-label="Channel" className="flex flex-wrap">
          {channels.map((c) => {
            const here = views.filter((v) => v.asset.channel === c);
            return (
              <button key={c} type="button" role="tab" aria-selected={c === channel} onClick={() => setChannel(c)} className={`border-b-2 px-3.5 py-2.5 ${c === channel ? "border-fg font-semibold text-fg" : "border-transparent font-medium text-muted hover:text-fg"}`}>
                {CHANNEL_LABEL[c]}{here.length > 0 && <span className="ml-1.5 text-xs font-normal text-muted">{here.filter((v) => ["approved", "published"].includes(v.asset.state)).length}/{here.length}</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 pb-2">
          <span className="text-[13px] text-muted">
            {ready} ready · {review} in review · {done} approved · {run.spent.toLocaleString()} credits used{active && run.maxConcurrent ? ` · ${run.running} of ${run.maxConcurrent} running${run.queued ? `, ${run.queued} queued` : ""}` : ""}
          </span>
          {canRun && everything.assets.length > est.assets.length && channels.length > 1 && <Button pending={pending} onClick={() => launch(channels)}>Generate all channels · {everything.credits} credits</Button>}
          <div role="group" aria-label="View" className="flex rounded-[10px] border border-line-strong p-0.5">
            {(["assets", "preview"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-[13px] ${view === v ? "bg-control font-semibold text-fg" : "text-muted"}`}>{v === "preview" ? "Page preview" : "Assets"}</button>)}
          </div>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-dashed bg-placeholder p-12 text-center">
          <h2 className="text-lg font-semibold">Nothing generated for {CHANNEL_LABEL[channel]} yet</h2>
          <p className="mt-1 text-muted">{canRun ? "Generating creates its Main image, Lifestyle, In-use and Claim card, and writes its listing." : "A producer generates this channel first."}</p>
        </div>
      ) : (
        <div className={view === "assets" ? "grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]" : "flex flex-col gap-4"}>
          <div className="flex min-w-0 flex-col gap-4">
            {view === "preview" ? (
              <ChannelPreview key={channel} channel={channel} product={product} views={shown} canWrite={canRun} writing={agentRunning || copyAsset?.state === "generating"} onWriteCopy={() => setWriteSignal((n) => n + 1)} />
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-2.5">
                  {shown.filter((item) => item.asset.shot_key !== "copy").map((item) => <AssetCard key={item.asset.id} item={item} selected={item.asset.id === refineId} onOpen={() => setOpenId(item.asset.id)} frontUrl={frontUrl} cutoutUrl={cutoutUrl} actions={cardActions(item)} />)}
                </div>
                {refining?.storage_path && <RefinePanel asset={refining} onClose={() => setRefineId(null)} />}
              </>
            )}
          </div>
          {copyAsset && copyItem && (
            <CopyStudio
              key={copyAsset.id} asset={copyAsset} canWrite={canRun} compact={view === "preview"} startSignal={writeSignal} onRunningChange={onRunningChange} chip={copyItem.view.chip}
              actions={<>{cardActions(copyItem)}{copyAsset.state !== "draft" && <div className="flex gap-2"><Button variant="card" onClick={() => setOpenId(copyAsset.id)}>Checks and history</Button></div>}</>}
            />
          )}
        </div>
      )}
      {openId && <AssetDrawer key={openId} assetId={openId} role={role} onClose={() => setOpenId(null)} />}
      {active && <p className="flex items-center gap-2 text-xs text-muted"><Spinner /> Updating live. It&apos;s safe to leave this page.</p>}
    </section>
  );
}
