"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Img } from "@/components/ui/image";
import { LiveRefresh } from "@/components/products/live-refresh";
import type { BoardPdp } from "@/lib/data/pdps";
import type { PdpStatus } from "@/lib/domain/pdp";
import { CHANNELS, CHANNEL_LABEL, type Channel } from "@/lib/domain/types";

const COLUMNS: { status: PdpStatus; title: string; empty: string }[] = [
  { status: "in_review", title: "In review", empty: "No PDPs are waiting for review." },
  { status: "changes_requested", title: "Changes requested", empty: "Nothing has been sent back." },
  { status: "approved", title: "Approved", empty: "Nothing is waiting to go live." },
  { status: "live", title: "Live", empty: "Nothing is live yet." },
];

function line({ pdp, itemCount, flagged, checks, draftVersion }: BoardPdp): [string, string, string] {
  const base = `${CHANNEL_LABEL[pdp.channel]} · v${pdp.version}`;
  if (pdp.status === "changes_requested") return [`${CHANNEL_LABEL[pdp.channel]} · v${draftVersion} drafting`, `${flagged} item${flagged === 1 ? "" : "s"} flagged on v${pdp.version}`, "text-danger"];
  if (pdp.status === "approved") return [base, "Ready to go live", "text-ok"];
  if (pdp.status === "live") return [base, pdp.live_at ? `Live since ${new Date(pdp.live_at).toLocaleDateString(undefined, { dateStyle: "medium" })}` : "Live", "text-ok"];
  return [`${base} · ${itemCount} items`, checks.warn ? `${checks.warn} to confirm` : "All checks passed", checks.warn ? "text-warn" : "text-ok"];
}

export function ReviewBoard({ items, regenerating }: { items: BoardPdp[]; regenerating: boolean }) {
  const [channel, setChannel] = useState<Channel | "all">("all");
  const shown = useMemo(() => items.filter((i) => channel === "all" || i.pdp.channel === channel), [items, channel]);
  return (
    <>
      {regenerating && <LiveRefresh />}
      <div className="mt-6 flex flex-wrap gap-2">
        {(["all", ...CHANNELS] as const).map((c) => <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)} className={`rounded-full border px-3.5 py-2 text-[13px] ${channel === c ? "border-fg bg-fg text-canvas" : "border-line-strong text-body hover:border-muted"}`}>{c === "all" ? "All channels" : CHANNEL_LABEL[c]}</button>)}
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] items-start gap-4">
        {COLUMNS.map((col) => {
          const rows = shown.filter((i) => i.pdp.status === col.status);
          return (
            <section key={col.status} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line-header bg-well p-3">
              <h2 className="flex items-baseline gap-2 p-1 font-semibold">{col.title}<span className="font-medium text-muted">{rows.length}</span></h2>
              {rows.length ? rows.map((i) => {
                const [meta, status, tone] = line(i);
                return (
                  <Link key={i.pdp.id} href={`/pdps/${i.pdp.id}`} className="flex gap-2.5 rounded-xl border border-line bg-surface p-3 hover:border-muted">
                    <span className="relative size-14 flex-none overflow-hidden rounded-lg bg-white">{i.thumbnail ? <Img src={i.thumbnail} alt="" className="absolute inset-0" sizes="56px" /> : <span className="flex h-full items-center justify-center bg-control text-[11px] text-muted">PDP</span>}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{i.product.name}</span>
                      <span className="block text-xs leading-4 text-muted">{i.product.sku} · {meta}</span>
                      <span className={`block text-xs leading-4 ${tone}`}>{status}</span>
                    </span>
                  </Link>
                );
              }) : <div className="rounded-xl border border-dashed border-line-dashed px-3 py-5 text-center text-[13px] leading-[18px] text-muted">{col.empty}</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
