import { Suspense } from "react";
import { PageTitle, Skeleton } from "@/components/ui";
import { ModelLab } from "@/components/lab/model-lab";
import { db } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";
import { accountLimits } from "@/lib/runway/client";
import { connection } from "next/server";
import type { Product, ShotTemplate } from "@/lib/domain/types";

export const metadata = { title: "Model lab" };

async function Content() {
  await connection();
  const [role, { data: products }, { data: sources }, { data: shots }, { data: last }, limits] = await Promise.all([
    getRole(),
    db().from("products").select("id,sku,name,channels,source").order("sku"),
    db().from("source_assets").select("product_id").eq("kind", "cutout"),
    db().from("shot_templates").select("key,model"),
    db().from("generations").select("scene_key").like("scene_key", "lab:%").order("created_at", { ascending: false }).limit(1),
    accountLimits().catch(() => null),
  ]);
  const ready = new Set(((sources ?? []) as unknown as { product_id: string }[]).map((s) => s.product_id));
  const choices = ((products ?? []) as unknown as Product[]).filter((p) => ready.has(p.id));
  const rows = (shots ?? []) as unknown as Pick<ShotTemplate, "key" | "model">[];
  const lastBatch = ((last ?? []) as unknown as { scene_key: string }[])[0]?.scene_key.split(":")[1] ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Model lab" sub="Run the same brief through several models, then judge finished results with the real pack on them. Nothing here changes your assets." />
      <ModelLab
        role={role}
        products={choices.map((p) => ({ id: p.id, sku: p.sku, name: p.name }))}
        currentImage={rows.find((r) => r.key === "lifestyle")?.model ?? null}
        currentVideo={rows.find((r) => r.key === "video")?.model ?? null}
        initialBatch={lastBatch}
        creditBalance={limits?.creditBalance ?? null}
      />
    </div>
  );
}

export default function LabPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>}><Content /></Suspense>;
}
