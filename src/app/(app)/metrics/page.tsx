import { Suspense } from "react";
import { connection } from "next/server";
import { PageTitle, Skeleton, StatTile } from "@/components/ui";
import { BaselineForm } from "@/components/metrics/baseline-form";
import { getMetrics } from "@/lib/data/metrics";
import { can } from "@/lib/domain/permissions";
import { formatDuration, formatPercent, formatRounds } from "@/lib/domain/metrics";
import { getRole } from "@/lib/role";

export const metadata = { title: "Metrics" };

const HEADINGS = ["PRODUCT", "LIVE PDPS", "TIME TO PUBLISH", "COST", "REVIEW ROUNDS", "FIRST-PASS APPROVAL", "CONVERSION LIFT"];

async function Content() {
  await connection(); // These are live figures, so they belong to the request rather than the prerender.
  const role = await getRole();
  const title = <PageTitle title="Metrics" sub="Did it work? Measured from the app's own records, for owners." />;
  if (!can(role, "view_metrics")) {
    return <div className="flex flex-col gap-6">{title}<div className="rounded-[14px] bg-neutral-bg px-5 py-3.5">Only an owner can see metrics. Switch to the Owner role in the header.</div></div>;
  }
  const m = await getMetrics();
  return (
    <div className="flex flex-col gap-6">
      {title}
      <div className="flex flex-wrap gap-4">
        <StatTile label="TIME TO PUBLISH" value={formatDuration(m.publishMs)} note="Average hours and minutes, from SKU in to its PDP going live" />
        <StatTile label="COST PER SKU" value={m.creditsPerSku == null ? "—" : `${Math.round(m.creditsPerSku).toLocaleString()} credits`} note="Runway credits at $0.01 each, without the Evals or Claude tokens" />
        <StatTile label="REVIEW ROUNDS" value={formatRounds(m.rounds)} note={`Average per PDP · first-pass approval ${formatPercent(m.firstPass)}`} />
        <StatTile label="TIME SAVED" value={m.savedDays == null ? "—" : `${m.savedDays.toFixed(1)} days`} note={m.baselineDays == null ? "Add your previous turnaround below to measure this" : `Per PDP, against a previous turnaround of ${m.baselineDays} days`} />
        <StatTile label="CONVERSION LIFT" value="—" note="No conversion data source is connected yet" />
      </div>
      <section>
        <h2 className="mb-3 text-xs font-semibold leading-4 tracking-[0.1em] text-muted">BY PRODUCT</h2>
        <div className="overflow-x-auto rounded-[14px] border border-line bg-table">
          <table className="w-full min-w-[960px] border-collapse">
            <thead><tr className="text-left text-xs tracking-[0.08em] text-muted">{HEADINGS.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {m.rows.map((p) => (
                <tr key={p.id} className="border-t border-line text-body">
                  <td className="px-4 py-3"><span className="font-semibold text-fg">{p.name}</span><br /><span className="text-xs text-muted">{p.sku}</span></td>
                  <td className="px-4 py-3">{p.started ? `${p.live} of ${p.started}` : "Not started"}</td>
                  <td className="px-4 py-3">{formatDuration(p.publishMs)}</td>
                  <td className="px-4 py-3">{p.credits ? `${p.credits.toLocaleString()} credits` : "—"}</td>
                  <td className="px-4 py-3">{formatRounds(p.rounds)}</td>
                  <td className="px-4 py-3">{formatPercent(p.firstPass)}</td>
                  <td className="px-4 py-3">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">A dash means there&apos;s no data yet. Review figures count decisions on PDPs, not the per-asset reviews from before them.</p>
      </section>
      <BaselineForm initial={m.baselineDays} />
    </div>
  );
}

export default function MetricsPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>}><Content /></Suspense>;
}
