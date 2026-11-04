"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, Spinner } from "@/components/ui";
import { AssetCard } from "@/components/assets/asset-card";
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
            <Button pending={pending} disabled={est.assets.length === 0} onClick={() => launch([channel])}>
              {est.assets.length ? `Generate for ${CHANNEL_LABEL[channel]} · est. ${est.credits} credits` : `${CHANNEL_LABEL[channel]} is generated`}
            </Button>
            {channels.length > 1 && (
              <Button variant="primary" pending={pending} disabled={everything.assets.length === 0} onClick={() => launch(channels)}>
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
          {shown.map((item) => <AssetCard key={item.asset.id} item={item} frontUrl={frontUrl} cutoutUrl={cutoutUrl} />)}
        </div>
      )}
      {active && <p className="flex items-center gap-2 text-xs text-muted"><Spinner /> Updating live. It&apos;s safe to leave this page.</p>}
    </section>
  );
}
