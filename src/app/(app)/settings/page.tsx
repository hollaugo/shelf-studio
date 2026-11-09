import { Suspense } from "react";
import { connection } from "next/server";
import { DataRow, PageTitle, Panel, Skeleton } from "@/components/ui";
import { LegalRulesForm, StyleGuideForm, type LegalRule } from "@/components/settings/settings-forms";
import { db } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import { accountLimits } from "@/lib/runway/client";
import { CHANNEL_LABEL, SHOT_LABEL, type ChannelSpec, type ShotTemplate } from "@/lib/domain/types";

export const metadata = { title: "Settings" };

async function Content() {
  await connection(); // Live account data and SDK calls belong to the request, not the prerender.
  const [role, { data: settings }, { data: specs }, { data: shots }, limits] = await Promise.all([
    getRole(),
    db().from("settings").select("key,value"),
    db().from("channel_specs").select("*").neq("format", "text").order("channel"),
    db().from("shot_templates").select("*").order("sort"),
    accountLimits().catch(() => null),
  ]);
  const rows = (settings ?? []) as unknown as { key: string; value: unknown }[];
  const value = (k: string) => rows.find((r) => r.key === k)?.value;
  const canEdit = can(role, "edit_settings");
  const templates = (shots ?? []) as unknown as ShotTemplate[];
  const image = limits?.models[templates.find((t) => t.key === "lifestyle")?.model ?? ""];
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Settings" sub="The shot list and retailer rules are data, so a new SKU or retailer needs no code." />
      {!canEdit && <div className="rounded-[14px] bg-neutral-bg px-5 py-3.5">Only an owner can change these settings. Switch to the Owner role to edit.</div>}
      <StyleGuideForm initial={value("style_guide") as never} canEdit={canEdit} />
      <LegalRulesForm initial={(value("legal_rules") ?? []) as LegalRule[]} canEdit={canEdit} />
      <section>
        <h2 className="mb-3 text-xl font-semibold leading-7 tracking-[-0.01em]">Channel specs</h2>
        <div className="overflow-x-auto rounded-[14px] border border-line bg-table">
          <table className="w-full min-w-[760px] border-collapse">
            <thead><tr className="text-left text-xs tracking-[0.08em] text-muted">{["CHANNEL", "SHOT", "SIZE", "FORMAT", "MAX FILE", "RULES"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {((specs ?? []) as unknown as ChannelSpec[]).map((s) => (
                <tr key={s.id} className="border-t border-line text-body">
                  <td className="px-4 py-2.5">{CHANNEL_LABEL[s.channel]}</td><td className="px-4 py-2.5">{SHOT_LABEL[s.shot_key]}</td><td className="px-4 py-2.5">{s.width} × {s.height}</td><td className="px-4 py-2.5 uppercase">{s.format}</td><td className="px-4 py-2.5">{s.max_mb ? `Under ${s.max_mb} MB` : "No limit set"}</td>
                  <td className="px-4 py-2.5">{s.white_bg ? `Pure white, fills ${Math.round((s.min_fill ?? 0) * 100)}%, no text` : "Scene with the real pack"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel title="SHOT LIST">
          {templates.map((t) => <DataRow key={t.key} label={t.label}>{t.model ?? "No model: rendered from the real pack"}</DataRow>)}
        </Panel>
        <Panel title="RUNWAY LIMITS · READ LIVE">
          <DataRow label="Image generations at once">{image?.maxConcurrent ?? "Unavailable"}</DataRow>
          <DataRow label="Image generations in 24 hours">{image ? `${image.usedToday} of ${image.maxDaily}` : "Unavailable"}</DataRow>
          <DataRow label="Credit balance">{limits?.creditBalance?.toLocaleString() ?? "Unavailable"}</DataRow>
          <DataRow label="Cap per run">{process.env.RUNWAY_CREDIT_CAP_PER_RUN ?? 500} credits</DataRow>
        </Panel>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-96 w-full" /></div>}><Content /></Suspense>;
}
