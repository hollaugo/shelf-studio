import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DataRow, Panel, Skeleton } from "@/components/ui";
import { Img } from "@/components/ui/image";
import { publicUrl } from "@/lib/supabase/server";
import { getProductBySku, getSources } from "@/lib/data/products";
import { CHANNEL_LABEL } from "@/lib/domain/types";

async function Content({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const product = await getProductBySku(sku);
  if (!product) notFound();
  const sources = await getSources(product.id);
  const front = sources.find((s) => s.kind === "front");
  const cutout = sources.find((s) => s.kind === "cutout");
  const a = product.analysis;
  return (
    <>
      <Link href="/products" className="text-[13px] text-muted hover:text-fg">Products / {product.sku}</Link>
      <h1 className="mt-2 text-[28px] font-bold leading-9 tracking-[-0.02em]">{product.name}</h1>
      <div className="text-muted">{[product.sku, product.size].filter(Boolean).join(" · ")}</div>
      <aside className="mt-6 flex max-w-[380px] flex-col gap-4">
        <Panel title="INPUTS · PACKSHOTS">
          {front ? (
            <div className="grid grid-cols-2 gap-2.5">
              <figure><Img src={publicUrl("sources", front.storage_path)!} alt="Front packshot" className="aspect-square rounded-[10px] bg-white" sizes="180px" /><figcaption className="mt-1.5 text-xs text-muted">Front</figcaption></figure>
              {cutout && <figure><Img src={publicUrl("sources", cutout.storage_path)!} alt="Cutout" contain className="aspect-square rounded-[10px] bg-[#1b5e4b]" sizes="180px" /><figcaption className="mt-1.5 text-xs text-muted">Real pack cutout</figcaption></figure>}
            </div>
          ) : <Link href={`/products/new?product=${product.id}`} className="text-info">Upload a product image</Link>}
        </Panel>
        <Panel title="INPUTS · PRODUCT DATA">
          <DataRow label="Name">{product.name}</DataRow>
          <DataRow label="Size">{product.size}</DataRow>
          <DataRow label="Primary claim">{product.primary_claim} <span className="text-xs text-muted">· locked</span></DataRow>
          <DataRow label="Channels">{product.channels.map((c) => CHANNEL_LABEL[c]).join(" · ")}</DataRow>
        </Panel>
        {a && <Panel title="WHAT THE AGENT UNDERSTOOD"><DataRow label="Product">{a.productType}</DataRow><DataRow label="Mood">{a.brandMood.join(", ")}</DataRow></Panel>}
      </aside>
    </>
  );
}

export default function ProductPage({ params }: PageProps<"/products/[sku]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Content params={params} />
    </Suspense>
  );
}
