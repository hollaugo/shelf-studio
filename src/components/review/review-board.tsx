"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Notice, Spinner } from "@/components/ui";
import { Img } from "@/components/ui/image";
import { AssetDrawer } from "@/components/assets/asset-drawer";
import { LiveRefresh } from "@/components/products/live-refresh";
import type { BoardItem } from "@/lib/data/review";
import { can } from "@/lib/domain/permissions";
import { CHANNELS, CHANNEL_LABEL, SHOT_LABEL, type Channel, type Role } from "@/lib/domain/types";

type View = "list" | "board";
const COLUMNS: { key: string; title: string; match: (i: BoardItem) => boolean; empty: string }[] = [
  { key: "review", title: "Needs review", match: (i) => i.asset.state === "needs_review", empty: "Nothing waiting for review." },
  { key: "rework", title: "Rework", match: (i) => i.asset.state === "rejected" || i.regenerating, empty: "Nothing rejected." },
  { key: "approved", title: "Approved", match: (i) => i.asset.state === "approved", empty: "Nothing approved yet." },
  { key: "published", title: "Published", match: (i) => i.asset.state === "published", empty: "Nothing published yet. Producers publish approved assets." },
];

function status(i: BoardItem): [string, string] {
  if (i.asset.state === "rejected") return [i.asset.feedback ?? "Rejected", "text-danger"];
  if (i.regenerating) return ["Regenerating with feedback", "text-info"];
  if (i.asset.shot_key === "video" && i.asset.state === "needs_review") return ["Video is always reviewed individually", "text-warn"];
  if (i.checks.warn) return [`${i.checks.pass} of ${i.checks.total} checks · ${i.checks.warn} to confirm`, "text-warn"];
  return [`${i.checks.total} of ${i.checks.total} checks passed`, "text-ok"];
}


export function ReviewBoard({ items, role }: { items: BoardItem[]; role: Role }) {
  const router = useRouter();
  const [view, setView] = useState<View>("board");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canReview = can(role, "review");

  const shown = useMemo(() => items.filter((i) => channel === "all" || i.asset.channel === channel), [items, channel]);
  const waiting = shown.filter((i) => i.asset.state === "needs_review");
  const active = items.some((i) => i.regenerating);
  const eligible = (i: BoardItem) => i.asset.state === "needs_review" && i.asset.shot_key !== "video" && i.checks.warn === 0 && i.checks.fail === 0;
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const bulk = () => start(async () => {
    const res = await fetch("/api/assets/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", ids: selected }) });
    const body = await res.json();
    setMessage(res.ok ? `Approved ${body.done.length}.${body.skipped.length ? ` ${body.skipped.length} need individual review.` : ""}` : body.error);
    setSelected([]);
    router.refresh();
  });

  const card = (i: BoardItem) => {
    const [text, tone] = status(i);
    return (
      <article key={i.asset.id} className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3">
        <div className="flex items-start gap-2.5">
          {canReview && i.asset.state === "needs_review" && (
            <label className="flex pt-0.5">
              <span className="sr-only">Select {SHOT_LABEL[i.asset.shot_key]}, {i.product.sku}, {CHANNEL_LABEL[i.asset.channel]}</span>
              <input type="checkbox" checked={selected.includes(i.asset.id)} onChange={() => toggle(i.asset.id)} className="size-4 accent-[#f2f2ef]" />
            </label>
          )}
          <span className="relative size-14 flex-none overflow-hidden rounded-lg bg-white">{i.url && i.asset.shot_key !== "video" ? <Img src={i.url} alt="" className="absolute inset-0" sizes="56px" /> : <span className="flex h-full items-center justify-center bg-control text-[11px] text-muted">{i.asset.shot_key === "video" ? "Video" : "Copy"}</span>}</span>
          <button type="button" onClick={() => setOpenId(i.asset.id)} className="min-w-0 flex-1 text-left">
            <span className="block font-semibold hover:underline">{SHOT_LABEL[i.asset.shot_key]}{i.asset.version > 1 && <span className="ml-1 text-xs font-normal text-muted">v{i.asset.version}</span>}</span>
            <span className="block text-xs leading-4 text-muted">{i.product.sku} · {CHANNEL_LABEL[i.asset.channel]}</span>
          </button>
        </div>
        <div className={`text-xs leading-4 ${tone}`}>{text}</div>
        {i.asset.state === "needs_review" && <Button variant="card" onClick={() => setOpenId(i.asset.id)}>{canReview ? "Open report to decide" : "Open report"}</Button>}
      </article>
    );
  };

  return (
    <>
      {active && <LiveRefresh />}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {(["all", ...CHANNELS] as const).map((c) => <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)} className={`rounded-full border px-3.5 py-2 text-[13px] ${channel === c ? "border-fg bg-fg text-canvas" : "border-line-strong text-body hover:border-muted"}`}>{c === "all" ? "All channels" : CHANNEL_LABEL[c]}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canReview && selected.length > 0 && <Button variant="primary" pending={pending} onClick={bulk}>Bulk approve {selected.filter((id) => { const i = items.find((x) => x.asset.id === id); return i && eligible(i); }).length} of {selected.length}</Button>}
          <div role="group" aria-label="View" className="flex rounded-[10px] border border-line-strong p-0.5">
            {(["board", "list"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-[13px] capitalize ${view === v ? "bg-control font-semibold text-fg" : "text-muted"}`}>{v}</button>)}
          </div>
        </div>
      </div>
      {message && <div className="mt-3"><Notice tone="info" title={message} /></div>}
      {view === "board" ? (
        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] items-start gap-4">
          {COLUMNS.map((col) => {
            const rows = shown.filter(col.match);
            return (
              <section key={col.key} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line-header bg-well p-3">
                <h2 className="flex items-baseline gap-2 p-1 font-semibold">{col.title}<span className="font-medium text-muted">{rows.length}</span></h2>
                {rows.length ? rows.map(card) : <div className="rounded-xl border border-dashed border-line-dashed px-3 py-5 text-center text-[13px] leading-[18px] text-muted">{col.empty}</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-line bg-table">
          <table className="w-full min-w-[760px] border-collapse">
            <thead><tr className="text-left text-xs tracking-[0.08em] text-muted">{["ASSET", "PRODUCT", "CHANNEL", "STATE", "PRE-COMPLIANCE"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {shown.filter((i) => COLUMNS.some((c) => c.match(i))).map((i) => {
                const [text, tone] = status(i);
                return (
                  <tr key={i.asset.id} className="border-t border-line">
                    <td className="px-4 py-3"><button type="button" onClick={() => setOpenId(i.asset.id)} className="flex items-center gap-3 text-left"><span className="relative size-11 flex-none overflow-hidden rounded-lg bg-control">{i.url && i.asset.shot_key !== "video" && <Img src={i.url} alt="" className="absolute inset-0" sizes="44px" />}</span><span className="font-semibold hover:underline">{SHOT_LABEL[i.asset.shot_key]}{i.asset.version > 1 && ` v${i.asset.version}`}</span></button></td>
                    <td className="px-4 py-3 text-body">{i.product.name}<span className="block text-xs text-muted">{i.product.sku}</span></td>
                    <td className="px-4 py-3 text-body">{CHANNEL_LABEL[i.asset.channel]}</td>
                    <td className="px-4 py-3"><Chip tone={i.asset.state === "needs_review" ? "warn" : i.asset.state === "approved" ? "ok" : i.asset.state === "published" ? "solid" : i.asset.state === "rejected" ? "danger" : "info"}>{i.regenerating ? "Regenerating" : i.asset.state === "needs_review" ? "In review" : i.asset.state[0].toUpperCase() + i.asset.state.slice(1)}</Chip></td>
                    <td className={`px-4 py-3 text-xs leading-4 ${tone}`}>{text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {waiting.length === 0 && view === "list" && <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">{active && <Spinner />} Nothing waiting for review.</p>}
      {openId && <AssetDrawer key={openId} assetId={openId} role={role} onClose={() => setOpenId(null)} />}
    </>
  );
}
