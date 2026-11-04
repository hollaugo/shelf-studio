import { Chip } from "@/components/ui";
import type { Listing, Violation } from "@/lib/agent/channel-rules";
import type { AutoCheck } from "@/lib/eval/auto-checks";
import type { AnalysisOutput } from "@/lib/pipeline/analysis-schema";

export type CopyOutput = { listing: Listing; violations: Violation[]; drafts: number };

const heading = "text-xs font-semibold leading-4 tracking-[0.1em] text-muted";

export function CheckPanel({ checks }: { checks: AutoCheck }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className={heading}>AUTOMATIC CHECK</h3>
        <Chip tone={checks.passed ? "ok" : "warn"}>{checks.summary}</Chip>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {checks.items.map((item) => (
          <li key={item.label} className="flex gap-2 text-[13px] leading-[18px]">
            <span aria-hidden="true" className={item.ok ? "text-ok" : "text-danger"}>{item.ok ? "✓" : "✕"}</span>
            <span className="min-w-0 break-words"><span className="sr-only">{item.ok ? "Passed: " : "Failed: "}</span><span className="text-fg">{item.label}</span>{item.detail && <span className="block text-xs leading-4 text-muted">{item.detail}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Field({ label, limit, children }: { label: string; limit?: number; children: React.ReactNode }) {
  return <div><div className="text-xs text-muted">{label}{limit !== undefined ? ` · ${limit} characters` : ""}</div><div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-[18px] text-fg">{children}</div></div>;
}

export function ListingView({ output }: { output: CopyOutput }) {
  const { listing: l } = output;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <Field label="Title" limit={l.title.length}>{l.title}</Field>
      {l.itemHighlights && <Field label="Item highlights" limit={l.itemHighlights.length}>{l.itemHighlights}</Field>}
      {l.shortDescription && <Field label="Short description" limit={l.shortDescription.length}>{l.shortDescription}</Field>}
      <Field label={`Bullets · ${l.bullets.length}`}><ul className="flex list-disc flex-col gap-1 pl-4">{l.bullets.map((b) => <li key={b}>{b}</li>)}</ul></Field>
      <Field label="Description" limit={l.description.length}>{l.description}</Field>
      {l.searchTerms && <Field label="Search terms">{l.searchTerms}</Field>}
      {l.metaTitle && <Field label="Meta title" limit={l.metaTitle.length}>{l.metaTitle}</Field>}
      {l.metaDescription && <Field label="Meta description" limit={l.metaDescription.length}>{l.metaDescription}</Field>}
      {l.faq?.length ? <Field label="FAQ"><dl className="flex flex-col gap-2">{l.faq.map((f) => <div key={f.question}><dt className="font-medium">{f.question}</dt><dd className="text-body">{f.answer}</dd></div>)}</dl></Field> : null}
      <Field label="Alt text">{l.altText}</Field>
    </section>
  );
}

const list = (items: string[]) => (items.length ? items.join(", ") : "None");

export function AnalysisView({ output: a }: { output: AnalysisOutput }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
      <Field label="Product">{a.productType}</Field>
      <Field label="Name on pack">{a.productName ?? "Not read"}</Field>
      <Field label="Size on pack">{a.size ?? "Not read"}</Field>
      <Field label="Image type">{a.imageType.replaceAll("_", " ")}</Field>
      <div className="sm:col-span-2"><Field label={`Text read · ${a.visibleText.length} lines`}>{a.visibleText.join(" / ") || "None"}</Field></div>
      <div className="sm:col-span-2"><Field label="Claims on pack">{list(a.claimsOnPack)}</Field></div>
      <Field label="Packaging">{[a.packaging.form, a.packaging.material, a.packaging.finish, a.packaging.closure].join(", ")}</Field>
      <Field label="Lighting">{a.lighting}</Field>
      <Field label="Palette"><span className="flex flex-wrap gap-2">{a.palette.map((p) => <span key={p.hex + p.name} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3.5 rounded-sm border border-line-strong" style={{ background: p.hex }} />{p.name}</span>)}</span></Field>
      <Field label="Mood">{list(a.brandMood)}</Field>
      <div className="sm:col-span-2"><Field label="Suggested settings">{list(a.scenePrompting.suggestedSettings)}</Field></div>
      <Field label="Props that fit">{list(a.scenePrompting.compatibleProps)}</Field>
      <Field label="Avoid">{list(a.scenePrompting.avoid)}</Field>
      <Field label="Usable for a cutout">{a.usableForCutout ? "Yes" : "No"}</Field>
      <Field label="Problems found">{list(a.issues)}</Field>
    </section>
  );
}
