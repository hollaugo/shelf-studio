"use client";

import { useCallback, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, Notice, Spinner } from "@/components/ui";
import { AssetCard } from "@/components/assets/asset-card";
import { CopyStudio } from "@/components/copy/copy-studio";
import { RefinePanel } from "@/components/assets/refine-panel";
import { AssetDrawer } from "@/components/assets/asset-drawer";
import { ChannelPreview } from "@/components/preview/channel-preview";
import { setRole } from "@/components/shell/actions";
import { BLEND_SCENE_MODEL, CUTOUT_CREDITS, EDIT_MODEL, generationCredits, sceneCredits, videoModel } from "@/lib/runway/model-registry";
import { nextStep, type StepAction } from "@/lib/domain/next-step";
import { canGenerate, isOpen, PDP_LABEL, PDP_TONE, submission } from "@/lib/domain/pdp";
import { LiveRefresh } from "./live-refresh";
import type { Detail } from "@/lib/data/detail";
import { CHANNEL_LABEL, type Asset, type Channel, type Role, SHOT_LABEL } from "@/lib/domain/types";
import { can } from "@/lib/domain/permissions";

/** A model drew this asset's text, so exact lettering is available if it got the wording wrong. */
const modelDrawn = (asset: Asset) => (asset.shot_key === "claim_card" && !!asset.generation_id) || (asset.refine as { engine?: string } | null)?.engine === "model";

const BLEND_CREDITS = sceneCredits(BLEND_SCENE_MODEL);

export function Workspace({ detail, role, frontUrl, cutoutUrl }: { detail: Detail; role: Role; frontUrl: string | null; cutoutUrl: string | null }) {
  const router = useRouter();
  const { product, views, pdps, estimates, everything, run, channels } = detail;
  const [channel, setChannel] = useState<Channel>(channels[0]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canRun = can(role, "run");
  const shown = views.filter((v) => v.asset.channel === channel);
  const copyAsset = shown.find((v) => v.asset.shot_key === "copy")?.asset;
  const [refineId, setRefineId] = useState<string | null>(null);
  const refining = views.find((v) => v.asset.id === refineId && v.asset.channel === channel)?.asset;
  const post = (url: string, body: object = {}) => start(async () => {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json()).error);
    router.refresh();
  });
  const versions = pdps.filter((p) => p.channel === channel);
  const open = versions.find((p) => isOpen(p.status)) ?? null;
  const live = versions.find((p) => p.status === "live") ?? null;
  const draft = open?.status === "draft" ? open : null;
  // Only a draft can change. Everything else is a frozen record.
  const canEdit = can(role, "refine") && !!draft;
  const [openId, setOpenId] = useState<string | null>(null);
  const pdpAction = (url: string, payload: object = {}) => start(async () => {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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

  const est = estimates[channel];
  const prepare = cutoutUrl ? 0 : CUTOUT_CREDITS; // The first Generate also cuts out the pack.
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
  const checkResults = (id: string) => detail.checks.filter((c) => c.asset_id === id).map((c) => c.result);
  const canAddShots = est.assets.length > 0 && canGenerate(versions);
  const step = nextStep({
    role, channel: CHANNEL_LABEL[channel], open: open && { status: open.status as "draft" | "in_review" | "approved", version: open.version }, liveVersion: live?.version ?? null, total: shown.length,
    working: shown.filter((v) => ["generating", "compositing"].includes(v.asset.state) || (v.asset.state === "checking" && !v.asset.checks_done_at)).length,
    attention: shown.filter((v) => v.asset.shot_key !== "video" && (v.view.blocked || ["failed", "rejected"].includes(v.asset.state))).map((v) => SHOT_LABEL[v.asset.shot_key]),
    submittable: submission(shown.map((v) => ({ ...v.asset, checks: checkResults(v.asset.id) }))).ready,
    copyDraft: copyAsset?.state === "draft", videoReady: !!videoHere?.view.canGenerate,
    canGenerateMore: canAddShots,
  });
  const stepButton = (action: StepAction, primary: boolean) => {
    const variant = primary ? "primary" : "secondary";
    switch (action) {
      case "create": return <Button key={action} variant={variant} pending={pending} onClick={() => launch([channel])}>{shown.length ? "Generate the rest" : `Create ${CHANNEL_LABEL[channel]} PDP`} · {est.credits + prepare} credits</Button>;
      case "submit": return <Button key={action} variant={variant} pending={pending} onClick={() => pdpAction(`/api/pdps/${draft!.id}/submit`)}>Submit PDP for review</Button>;
      case "write_copy": return <Button key={action} variant={variant} onClick={() => setWriteSignal((n) => n + 1)}>Write the listing</Button>;
      case "video": return <Button key={action} variant={primary ? "primary" : "secondary"} pending={pending} onClick={() => post(`/api/assets/${videoHere!.asset.id}/video`)}>Add video · {videoCredits} credits</Button>;
      case "publish": case "open_version": return <Link key={action} href={`/pdps/${open!.id}`} className={primary ? "inline-flex items-center rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas hover:bg-white" : "inline-flex items-center rounded-[10px] border border-line-strong bg-raised px-4 py-2.5 font-medium text-fg hover:bg-control"}>{open?.status === "approved" ? "Open to publish" : "Open this version"}</Link>;
      case "new_version": return <Button key={action} variant={variant} pending={pending} onClick={() => pdpAction("/api/pdps", { productId: product.id, channel })}>Start a new version</Button>;
      case "switch_producer": return <Button key={action} variant={variant} pending={pending} onClick={() => switchRole("producer")}>Switch to Producer</Button>;
      case "switch_reviewer": return <Button key={action} variant={variant} pending={pending} onClick={() => switchRole("reviewer")}>Switch to Reviewer</Button>;
      case "view_site": return <Link key={action} href={`/verda/${product.slug}`} className={primary ? "inline-flex items-center rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas hover:bg-white" : "inline-flex items-center rounded-[10px] border border-line-strong bg-raised px-4 py-2.5 font-medium text-fg hover:bg-control"}>View on the website</Link>;
    }
  };

  const switchToRealPack = (item: Detail["views"][number]) => () => post(`/api/assets/${item.asset.id}/regenerate`, { composite: true });

  const cardActions = (item: Detail["views"][number]) => {
    const scene = item.asset.shot_key === "lifestyle" || item.asset.shot_key === "in_use";
            return (
              <>
                {canEdit && item.asset.shot_key === "video" && item.view.canGenerate && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/video`)}>Add video · {videoCredits} credits</Button></div>}
                                {canEdit && modelDrawn(item.asset) && (item.asset.shot_key === "claim_card" || !item.drawnPack) && (item.view.blocked || item.asset.state === "failed") && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/exact-text`)}>Use exact lettering · 0 credits</Button></div>}
                {canEdit && scene && item.labelFailed && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={switchToRealPack(item)}>Use real pack · {BLEND_CREDITS} credits</Button></div>}
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
        {(step.actions.length > 0 || step.submitBlocked) && <div className="flex flex-wrap gap-2">{step.actions.map((action, i) => stepButton(action, i === 0 && !step.submitBlocked))}{step.submitBlocked && <Button variant="primary" disabled>Submit PDP for review</Button>}</div>}
      </section>
      <nav aria-label="Channel PDPs" className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
        {channels.map((c) => {
          const mine = pdps.filter((p) => p.channel === c);
          const chips = mine.filter((p) => p.status === "live" || isOpen(p.status));
          return (
            <button key={c} type="button" aria-current={c === channel ? "true" : undefined} onClick={() => setChannel(c)} className={`flex flex-col gap-1.5 rounded-[14px] border px-4 py-3 text-left ${c === channel ? "border-fg bg-raised" : "border-line bg-surface hover:border-muted"}`}>
              <span className="font-semibold">{CHANNEL_LABEL[c]} PDP</span>
              <span className="flex flex-wrap gap-1.5">
                {chips.length ? chips.map((p) => <Chip key={p.id} tone={PDP_TONE[p.status]}>v{p.version} {PDP_LABEL[p.status].toLowerCase()}</Chip>) : <Chip>No PDP yet</Chip>}
              </span>
            </button>
          );
        })}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          {run.spent.toLocaleString()} credits used on this product{active && run.maxConcurrent ? ` · ${run.running} of ${run.maxConcurrent} running${run.queued ? `, ${run.queued} queued` : ""}` : ""}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {canRun && everything.assets.length > (canAddShots ? est.assets.length : 0) && channels.length > 1 && <Button pending={pending} onClick={() => launch(channels.filter((c) => canGenerate(pdps.filter((p) => p.channel === c))))}>Create all PDPs · {everything.credits + prepare} credits</Button>}
          <div role="group" aria-label="View" className="flex rounded-[10px] border border-line-strong p-0.5">
            {(["assets", "preview"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-[13px] ${view === v ? "bg-control font-semibold text-fg" : "text-muted"}`}>{v === "preview" ? "Page preview" : "Assets"}</button>)}
          </div>
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-dashed bg-placeholder p-12 text-center">
          <h2 className="text-lg font-semibold">No {CHANNEL_LABEL[channel]} PDP yet</h2>
          <p className="mt-1 text-muted">{canRun ? "Creating it makes the Main image, Lifestyle, In-use and Claim card, and writes the listing." : "A producer creates this PDP first."}</p>
        </div>
      ) : (
        <div className={view === "assets" ? "grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(340px,1fr)]" : "flex flex-col gap-4"}>
          <div className="flex min-w-0 flex-col gap-4">
            {view === "preview" ? (
              <ChannelPreview key={channel} channel={channel} product={product} views={shown} canWrite={canRun && !!draft} writing={agentRunning || copyAsset?.state === "generating"} onWriteCopy={() => setWriteSignal((n) => n + 1)} />
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-2.5">
                  {shown.filter((item) => item.asset.shot_key !== "copy").map((item) => <AssetCard key={item.asset.id} item={item} selected={item.asset.id === refineId} onOpen={() => setOpenId(item.asset.id)} frontUrl={frontUrl} cutoutUrl={cutoutUrl} actions={cardActions(item)} />)}
                </div>
                {refining?.storage_path && <RefinePanel asset={refining} drawnPack={!!views.find((v) => v.asset.id === refining.id)?.drawnPack} onClose={() => setRefineId(null)} />}
              </>
            )}
          </div>
          {copyAsset && copyItem && (
            <CopyStudio
              key={copyAsset.id} asset={copyAsset} canWrite={canRun && !!draft} compact={view === "preview"} startSignal={writeSignal} onRunningChange={onRunningChange} chip={copyItem.view.chip}
              actions={<>{cardActions(copyItem)}{copyAsset.state !== "draft" && <div className="flex gap-2"><Button variant="card" onClick={() => setOpenId(copyAsset.id)}>Checks and history</Button></div>}</>}
            />
          )}
        </div>
      )}
      {versions.length > 0 && (
        <section className="rounded-[14px] border border-line bg-surface px-5 py-4">
          <h2 className="mb-1 text-xs font-semibold leading-4 tracking-[0.1em] text-muted">{CHANNEL_LABEL[channel].toUpperCase()} PDP VERSIONS</h2>
          <ul>
            {versions.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft py-2.5 first:border-0">
                <b className="w-8">v{p.version}</b>
                <Chip tone={PDP_TONE[p.status]}>{PDP_LABEL[p.status]}</Chip>
                <span className="flex-[1_1_200px] text-[13px] text-muted">{p.status === "live" && p.live_at ? `Live since ${new Date(p.live_at).toLocaleDateString(undefined, { dateStyle: "medium" })}` : p.status === "draft" ? "Being worked on, shown above" : p.decided_at ? `Decided ${new Date(p.decided_at).toLocaleDateString(undefined, { dateStyle: "medium" })}` : p.submitted_at ? `Submitted ${new Date(p.submitted_at).toLocaleDateString(undefined, { dateStyle: "medium" })}` : ""}</span>
                {p.status !== "draft" && <Link href={`/pdps/${p.id}`} className="text-[13px] text-info hover:text-info-strong">Open</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {openId && <AssetDrawer key={openId} assetId={openId} onClose={() => setOpenId(null)} />}
      {active && <p className="flex items-center gap-2 text-xs text-muted"><Spinner /> Updating live. It&apos;s safe to leave this page.</p>}
    </section>
  );
}
