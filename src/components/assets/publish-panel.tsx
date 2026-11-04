"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button, Chip, DataRow, Notice } from "@/components/ui";
import { can } from "@/lib/domain/permissions";
import { CHANNEL_LABEL, type Asset, type Role } from "@/lib/domain/types";

type Publication = { id: string; target: string; channel: string; url: string | null; published_by: string; published_at: string };

const COMING = ["Amazon", "Walmart", "Target", "Salsify", "DAM"];

export function PublishPanel({ asset, publications, role, onDone }: { asset: Asset; publications: Publication[]; role: Role; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const record = publications[0];

  if (asset.state === "published" && record)
    return (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h3 className="mb-2 text-xs font-semibold leading-4 tracking-[0.1em] text-muted">PUBLICATION RECORD</h3>
        <DataRow label="Status"><Chip tone="solid">Published</Chip></DataRow>
        <DataRow label="Target">VERDA website</DataRow>
        <DataRow label="Channel asset">{CHANNEL_LABEL[record.channel as Asset["channel"]]}</DataRow>
        <DataRow label="Live at">{record.url && <Link href={record.url} className="text-info hover:text-info-strong">{record.url}</Link>}</DataRow>
        <DataRow label="Published">{new Date(record.published_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} by {record.published_by}</DataRow>
      </section>
    );

  if (asset.state !== "approved") return null;
  if (!can(role, "publish")) return <p className="text-[13px] text-muted">Approved. A producer or owner publishes it.</p>;

  const publish = () => start(async () => {
    setError(null);
    const res = await fetch(`/api/assets/${asset.id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target: "website" }) });
    if (!res.ok) return setError((await res.json()).error);
    onDone();
  });

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <h3 className="text-xs font-semibold leading-4 tracking-[0.1em] text-muted">PUBLISH TO</h3>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Destination</legend>
        <label className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-info bg-info-bg px-3 text-info-strong">
          <input type="radio" name="target" defaultChecked className="size-4 accent-[#9fb3ff]" />
          <span className="flex-1">VERDA website</span>
          <span className="text-xs">Live now</span>
        </label>
        {COMING.map((t) => (
          <label key={t} className="flex min-h-11 items-center gap-2.5 rounded-[10px] border border-line-strong px-3 text-muted opacity-70">
            <input type="radio" name="target" disabled className="size-4" />
            <span className="flex-1">{t}</span>
            <span className="text-xs">Not connected yet</span>
          </label>
        ))}
      </fieldset>
      {error && <Notice title="Couldn't publish">{error}</Notice>}
      <p className="text-xs leading-4 text-muted">This records what went where and when, and adds the asset to its page on the website.</p>
      <Button variant="primary" pending={pending} onClick={publish}>Publish to website</Button>
    </section>
  );
}
