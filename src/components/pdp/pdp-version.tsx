"use client";

import { VIDEO_MODEL, videoModel } from "@/lib/runway/model-registry";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Chip, DataRow, Notice, Panel } from "@/components/ui";
import { AssetCard } from "@/components/assets/asset-card";
import { AssetDrawer } from "@/components/assets/asset-drawer";
import { ChannelPreview } from "@/components/preview/channel-preview";
import { setRole } from "@/components/shell/actions";
import type { Version, VersionItem } from "@/lib/data/pdps";
import { can } from "@/lib/domain/permissions";
import { PDP_LABEL, PDP_TONE } from "@/lib/domain/pdp";
import { CHANNEL_LABEL, SHOT_LABEL, type Role, type ShotKey } from "@/lib/domain/types";

const COMING = ["Amazon", "Walmart", "Target", "Salsify", "DAM"];
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const JSON_HEADERS = { "Content-Type": "application/json" };

export function PdpVersion({ version, role }: { version: Version; role: Role }) {
  const router = useRouter();
  const { pdp, product, items, reviews, publication } = version;
  const [view, setView] = useState<"items" | "preview">("items");
  const [flags, setFlags] = useState<Partial<Record<ShotKey, string>>>({});
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reviewing = pdp.status === "in_review" && can(role, "review");
  const warnings = items.flatMap((i) => i.checks.filter((c) => c.result === "warn").map((c) => ({ ...c, shot: i.item.shot_key })));
  const flagged = (Object.keys(flags) as ShotKey[]);
  const unexplained = flagged.some((shot) => !flags[shot]?.trim());
  const canApprove = !flagged.length && confirmed.length === warnings.length;
  const reused = items.length - flagged.length;

  const send = (path: string, payload: object = {}, then?: string) => start(async () => {
    setError(null);
    const res = await fetch(`/api/pdps/${pdp.id}/${path}`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(payload) });
    if (!res.ok) return setError((await res.json()).error);
    if (then) router.push(then);
    router.refresh();
  });
  const switchRole = (to: Role) => start(async () => {
    const data = new FormData();
    data.set("role", to);
    await setRole(data);
    router.refresh();
  });
  const toggle = (shot: ShotKey) => setFlags(({ [shot]: current, ...rest }) => (current === undefined ? { ...rest, [shot]: "" } : rest));

  const itemCard = ({ item, view: itemView, note }: VersionItem) => {
    const isFlagged = flags[item.shot_key] !== undefined;
    return (
      <div key={item.shot_key} className={`flex flex-col gap-2 rounded-xl ${isFlagged || item.flagged ? "outline outline-1 outline-danger" : ""}`}>
        <AssetCard item={{ ...itemView, note }} onOpen={() => setOpenId(item.asset_id)} frontUrl={null} cutoutUrl={null} actions={reviewing ? (
          <div className="flex flex-col gap-2">
            <label className="flex min-h-8 items-center gap-2 text-[13px]">
              <input type="checkbox" checked={isFlagged} onChange={() => toggle(item.shot_key)} className="size-4 accent-[#ff9a7a]" />
              Needs changes
            </label>
            {isFlagged && (
              <label className="text-xs text-muted">
                What should change?
                <textarea rows={2} value={flags[item.shot_key]} onChange={(e) => setFlags((f) => ({ ...f, [item.shot_key]: e.target.value }))} className="mt-1 w-full resize-y rounded-lg border border-line-strong bg-well p-2 text-[13px] text-fg" />
              </label>
            )}
          </div>
        ) : item.flagged ? <p className="text-xs leading-4 text-danger">{item.flag_note}</p> : undefined} />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href={`/products/${product.sku}`} className="text-[13px] text-muted hover:text-fg">Products / {product.sku}</Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em]">{CHANNEL_LABEL[pdp.channel]} PDP · version {pdp.version}</h1>
              <Chip tone={PDP_TONE[pdp.status]}>{PDP_LABEL[pdp.status]}</Chip>
            </div>
            <p className="text-muted">{[product.name, product.size, product.primary_claim].filter(Boolean).join(" · ")}</p>
          </div>
          <div role="group" aria-label="View" className="flex rounded-[10px] border border-line-strong p-0.5">
            {(["items", "preview"] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 text-[13px] ${view === v ? "bg-control font-semibold text-fg" : "text-muted"}`}>{v === "preview" ? "Page preview" : "Items"}</button>)}
          </div>
        </div>
      </div>

      {error && <Notice title="That didn't go through">{error}</Notice>}

      {view === "preview"
        ? <ChannelPreview key={pdp.channel} channel={pdp.channel} product={product} views={items.map((i) => i.view)} canWrite={false} writing={false} onWriteCopy={() => undefined} />
        : <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] items-start gap-3">{items.map(itemCard)}</div>}

      {pdp.status === "in_review" && !can(role, "review") && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-5 py-4">
          <p className="text-body">This version is with the reviewer, and it can&apos;t change while it&apos;s there.</p>
          <Button pending={pending} onClick={() => switchRole("reviewer")}>Switch to Reviewer</Button>
        </section>
      )}

      {reviewing && (
        <section aria-label="Decision" className="flex flex-col gap-4 rounded-2xl border border-line-strong bg-raised p-5">
          {warnings.length > 0 && (
            <div className="rounded-xl border border-warn-bg bg-[#1d1809] p-4">
              <h2 className="font-semibold text-warn">{warnings.length} flagged check{warnings.length === 1 ? "" : "s"} to confirm before approving</h2>
              <ul className="mt-2 flex flex-col">
                {warnings.map((w) => (
                  <li key={w.id}>
                    <label className="flex min-h-9 items-start gap-2.5 py-1.5 text-body">
                      <input type="checkbox" checked={confirmed.includes(w.id)} onChange={() => setConfirmed((c) => (c.includes(w.id) ? c.filter((x) => x !== w.id) : [...c, w.id]))} className="mt-0.5 size-4 flex-none accent-[#f2c35b]" />
                      <span><b className="font-medium text-fg">{SHOT_LABEL[w.shot]} · {w.label}</b>{w.detail?.note && <span className="block text-xs leading-4 text-muted">{w.detail.note}</span>}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">
              {flagged.length
                ? <><b className="font-semibold text-fg">{flagged.length} item{flagged.length === 1 ? "" : "s"} flagged.</b> Version {pdp.version + 1} will regenerate {flagged.map((s) => SHOT_LABEL[s]).join(", ")}{reused ? ` and reuse the other ${reused}` : ""}. A flagged video costs {videoModel(VIDEO_MODEL)?.credits} credits.</>
                : "Approving clears this whole version to go live. Flag any item that needs work to send it back."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button pending={pending} disabled={!flagged.length || unexplained} onClick={() => send("review", { decision: "changes", flags: flagged.map((shot_key) => ({ shot_key, note: flags[shot_key] })) })}>Request changes</Button>
              <Button variant="primary" pending={pending} disabled={!canApprove} onClick={() => send("review", { decision: "approve", confirmedWarnings: warnings.length > 0 })}>Approve PDP</Button>
            </div>
          </div>
        </section>
      )}

      {pdp.status === "approved" && (can(role, "publish") ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-xs font-semibold leading-4 tracking-[0.1em] text-muted">PUBLISH TO</h2>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <span className="rounded-full border border-info bg-info-bg px-3 py-1.5 text-info-strong">VERDA website · Live now</span>
            {COMING.map((t) => <span key={t} className="rounded-full border border-line-strong px-3 py-1.5 text-muted">{t} · Not connected yet</span>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-muted">The whole version goes live together, and replaces any earlier live version on this channel.</p>
            <Button variant="primary" pending={pending} onClick={() => send("publish")}>Publish PDP</Button>
          </div>
        </section>
      ) : <p className="text-[13px] text-muted">Approved. A producer or owner publishes it.</p>)}

      {pdp.status === "replaced" && pdp.live_at && can(role, "publish") && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-5 py-4">
          <p className="text-body">This version was live until it was replaced.</p>
          <Button pending={pending} onClick={() => send("restore")}>Restore as live</Button>
        </section>
      )}

      {pdp.status === "changes_requested" && (
        <section className="rounded-[14px] border border-danger-bg bg-danger-well px-5 py-4 text-body">
          The reviewer sent this version back. The next version regenerates what&apos;s flagged. <Link href={`/products/${product.sku}`} className="text-info hover:text-info-strong">Open the draft</Link>
        </section>
      )}

      {(publication || reviews.length > 0) && (
        <Panel title="RECORD">
          {pdp.status === "live" && publication?.url && <DataRow label="Live at"><Link href={publication.url} className="text-info hover:text-info-strong">{publication.url}</Link></DataRow>}
          {publication && <DataRow label="Published">{when(publication.published_at)} by {publication.published_by}</DataRow>}
          {reviews.map((r) => <DataRow key={r.id} label={r.decision === "approve" ? "Approved" : "Changes requested"}>{when(r.created_at)} by {r.reviewer_role}{r.note && <span className="block whitespace-pre-line text-xs leading-4 text-muted">{r.note}</span>}</DataRow>)}
        </Panel>
      )}

      {openId && <AssetDrawer key={openId} assetId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
