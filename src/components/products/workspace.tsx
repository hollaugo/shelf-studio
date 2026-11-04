"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, Spinner } from "@/components/ui";
import { AssetCard } from "@/components/assets/asset-card";
import { CopyStudio } from "@/components/copy/copy-studio";
import { RefinePanel } from "@/components/assets/refine-panel";
import { AssetDrawer } from "@/components/assets/asset-drawer";
import { LiveRefresh } from "./live-refresh";
import type { Detail } from "@/lib/data/detail";
import { CHANNEL_LABEL, type Channel, type Role } from "@/lib/domain/types";
import { can } from "@/lib/domain/permissions";

function Tally({ n, label }: { n: number; label: string }) {
  return <div className="flex items-baseline gap-1.5"><span className="text-lg font-semibold">{n}</span><span className="text-[13px] text-muted">{label}</span></div>;
}

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

  return (
    <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
      {active && <LiveRefresh />}
      {error && <Notice title="That didn't start">{error}</Notice>}
      <section aria-label="Run progress" className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line bg-surface px-5 py-3.5">
        <div className="flex flex-wrap gap-6">
          {all.length === 0 ? <span className="text-muted">Nothing generated yet</span> : <>
            <Tally n={run.working} label="working" />
            <Tally n={ready} label="ready to submit" />
            <Tally n={review} label="in review" />
            <Tally n={done} label="approved" />
          </>}
        </div>
        <div className="text-[13px] text-muted">
          {run.spent} credits used{run.maxConcurrent ? ` · Runway limit ${run.maxConcurrent} at once, ${run.running} running${run.queued ? `, ${run.queued} queued` : ""}` : ""}
        </div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft">
        <div role="tablist" aria-label="Channel" className="flex flex-wrap">
          {channels.map((c) => (
            <button key={c} type="button" role="tab" aria-selected={c === channel} onClick={() => setChannel(c)} className={`border-b-2 px-3.5 py-2.5 ${c === channel ? "border-fg font-semibold text-fg" : "border-transparent font-medium text-muted hover:text-fg"}`}>
              {CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>
        {canRun && (
          <div className="flex flex-wrap gap-2 pb-2">
            {readyHere.length > 0 && <Button variant="primary" pending={pending} onClick={() => bulk("submit", readyHere)}>Submit {readyHere.length} for review</Button>}
            {approvedHere.length > 0 && can(role, "publish") && <Button variant="primary" pending={pending} onClick={() => bulk("publish", approvedHere)}>Publish {approvedHere.length} to website</Button>}
            <Button pending={pending} disabled={est.assets.length === 0} onClick={() => launch([channel])}>
              {est.assets.length ? `Generate for ${CHANNEL_LABEL[channel]} · est. ${est.credits} credits` : `${CHANNEL_LABEL[channel]} is generated`}
            </Button>
            {channels.length > 1 && (
              <Button pending={pending} disabled={everything.assets.length === 0} onClick={() => launch(channels)}>
                Generate all channels · est. {everything.credits} credits
              </Button>
            )}
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-dashed bg-placeholder p-12 text-center">
          <h2 className="text-lg font-semibold">Nothing generated for {CHANNEL_LABEL[channel]} yet</h2>
          <p className="mt-1 text-muted">{canRun ? "Generate this channel to see its Main image, Lifestyle, In-use, Claim card, Video and copy." : "A producer needs to run this product's shot list."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
          {shown.map((item) => {
            const scene = item.asset.shot_key === "lifestyle" || item.asset.shot_key === "in_use";
            const actions = (
              <>
                {canEdit && item.view.readyToSubmit && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/submit`)}>Submit for review</Button></div>}
                {can(role, "publish") && item.asset.state === "approved" && <div className="flex gap-2"><Button variant="cardPrimary" onClick={() => setOpenId(item.asset.id)}>Publish</Button></div>}
                {item.asset.state === "published" && <div className="flex gap-2"><Button variant="card" onClick={() => setOpenId(item.asset.id)}>View record</Button></div>}
                {role === "reviewer" && item.asset.state === "needs_review" && <div className="flex gap-2"><Button variant="cardPrimary" onClick={() => setOpenId(item.asset.id)}>Review report</Button></div>}
                {canEdit && item.asset.shot_key === "video" && item.view.canGenerate && <div className="flex gap-2"><Button variant="cardPrimary" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/video`)}>Generate video</Button></div>}
                {canEdit && (item.view.canRefine || item.view.canRegenerate) && (
                  <div className="flex gap-2">
                    {item.view.canRefine && scene && <Button variant="card" onClick={() => setRefineId(item.asset.id)}>Refine</Button>}
                    {item.view.canRegenerate && <Button variant="card" disabled={pending} onClick={() => post(`/api/assets/${item.asset.id}/regenerate`)}>Regenerate</Button>}
                  </div>
                )}
              </>
            );
            return <AssetCard key={item.asset.id} item={item} selected={item.asset.id === refineId} onOpen={() => setOpenId(item.asset.id)} frontUrl={frontUrl} cutoutUrl={cutoutUrl} actions={actions} />;
          })}
        </div>
      )}
      {refining?.storage_path && <RefinePanel asset={refining} onClose={() => setRefineId(null)} />}
      {copyAsset && <CopyStudio key={copyAsset.id} asset={copyAsset} canWrite={canRun} />}
      {openId && <AssetDrawer key={openId} assetId={openId} role={role} onClose={() => setOpenId(null)} />}
      {active && <p className="flex items-center gap-2 text-xs text-muted"><Spinner /> Updating live. It&apos;s safe to leave this page.</p>}
    </section>
  );
}
