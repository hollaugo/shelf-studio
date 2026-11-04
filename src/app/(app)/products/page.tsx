import { Suspense } from "react";
import Link from "next/link";
import { PageTitle, Skeleton, StatTile } from "@/components/ui";
import { listProducts } from "@/lib/data/products";
import { ProductTable } from "@/components/products/product-table";
import { LiveRefresh } from "@/components/products/live-refresh";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";

export const metadata = { title: "Products" };

async function Content() {
  const [products, role] = await Promise.all([listProducts(), getRole()]);
  const assets = products.flatMap((p) => p.assets);
  const active = assets.some((a) => a.state === "generating" || a.state === "compositing");
  return (
    <>
      <PageTitle
        title="Products"
        sub={`${products.length} SKUs · synced from Salsify (mock) · coverage by channel`}
        actions={can(role, "run") && <Link href="/products/new" className="rounded-[10px] bg-fg px-4 py-2.5 font-semibold text-canvas hover:bg-white">Add new product</Link>}
      />
      <div className="mt-6 flex flex-wrap gap-4">
        <StatTile label="IN REVIEW" value={assets.filter((a) => a.state === "needs_review").length} />
        <StatTile label="READY TO PUBLISH" value={assets.filter((a) => a.state === "approved").length} />
        <StatTile label="PUBLISHED" value={assets.filter((a) => a.state === "published").length} />
        <StatTile label="NEEDS REWORK" value={assets.filter((a) => a.state === "failed" || a.state === "rejected").length} />
      </div>
      <ProductTable products={products} canRun={can(role, "run")} />
      {active && <LiveRefresh />}
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-10 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-80 w-full" /></div>}>
      <Content />
    </Suspense>
  );
}
