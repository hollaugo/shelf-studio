import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataRow, Panel, Skeleton } from "@/components/ui";
import { Img } from "@/components/ui/image";
import { publicUrl } from "@/lib/supabase/server";
import { getDetail } from "@/lib/data/detail";
import { getRole } from "@/lib/role";
import { CHANNEL_LABEL } from "@/lib/domain/types";
import { Workspace } from "@/components/products/workspace";

async function Content({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const [detail, role] = await Promise.all([getDetail(sku), getRole()]);
  if (!detail) notFound();
  const { product, sources, views } = detail;
  const source = (kind: string) => publicUrl("sources", sources.find((s) => s.kind === kind)?.storage_path);
  const front = source("front");
  const cutout = source("cutout");
  const a = product.analysis;
  const approved = views.filter((v) => ["approved", "published"].includes(v.asset.state)).length;
  return (
    <>
      <Link href="/products" className="text-[13px] text-muted hover:text-fg">Products / {product.sku}</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {front ? <Img src={front} alt={`${product.name} packshot`} className="size-14 flex-none rounded-[10px] bg-white" sizes="56px" /> : <span aria-hidden="true" className="size-14 flex-none rounded-[10px] border border-dashed border-line-dashed bg-placeholder" />}
          <div>
            <h1 className="text-[28px] font-bold leading-9 tracking-[-0.02em]">{product.name}</h1>
            <div className="text-muted">{[product.sku, product.size, views.length ? `${approved} of ${views.length} assets approved` : null].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-start gap-6">
        <aside className="flex max-w-[380px] flex-[1_1_320px] flex-col gap-4">
          <Panel title="INPUTS · PACKSHOT">
            {front ? (
              <div className="grid grid-cols-2 gap-2.5">
                <figure><Img src={front} alt="Front packshot" contain className="aspect-square rounded-[10px] bg-white" sizes="180px" /><figcaption className="mt-1.5 text-xs text-muted">Front · uploaded</figcaption></figure>
                {cutout ? <figure><Img src={cutout} alt="Real pack cutout" contain className="aspect-square rounded-[10px] bg-[#1b5e4b]" sizes="180px" /><figcaption className="mt-1.5 text-xs text-muted">Real pack cutout</figcaption></figure> : <div className="flex aspect-square items-center justify-center rounded-[10px] border border-dashed border-line-dashed bg-placeholder p-2 text-center text-xs text-muted">No cutout yet</div>}
              </div>
            ) : (
              <>
                <p className="text-body">This product needs an image before anything can be generated.</p>
                {role !== "reviewer" && <Link href={`/products/new?product=${product.id}`} className="mt-3 inline-block rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas">Upload product image</Link>}
              </>
            )}
          </Panel>
          <Panel title="INPUTS · PRODUCT DATA (SALSIFY MOCK)">
            <DataRow label="Name">{product.name}</DataRow>
            <DataRow label="Size">{product.size}</DataRow>
            <DataRow label="Primary claim">{product.primary_claim} <span className="text-xs text-muted">· locked</span></DataRow>
            <DataRow label="Channels">{product.channels.map((c) => CHANNEL_LABEL[c]).join(" · ")}</DataRow>
          </Panel>
          {a && (
            <Panel title="WHAT THE AGENT UNDERSTOOD">
              <DataRow label="Product">{a.productType}</DataRow>
              <DataRow label="Finish">{a.packaging?.finish}</DataRow>
              <DataRow label="Lighting">{a.lighting}</DataRow>
              <DataRow label="Mood">{a.brandMood?.join(", ")}</DataRow>
              <DataRow label="Text on pack">{a.visibleText?.join(" / ")}</DataRow>
            </Panel>
          )}
        </aside>
        <Workspace detail={detail} role={role} frontUrl={front} cutoutUrl={cutout} />
      </div>
    </>
  );
}

export default function ProductPage({ params }: PageProps<"/products/[sku]">) {
  return (
    <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-16 w-1/2" /><Skeleton className="h-96 w-full" /></div>}>
      <Content params={params as Promise<{ sku: string }>} />
    </Suspense>
  );
}
