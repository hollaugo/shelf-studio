import { Suspense } from "react";
import { db } from "@/lib/supabase/server";
import { PageTitle, Skeleton } from "@/components/ui";
import { UploadFlow } from "@/components/products/upload-flow";
import type { Product } from "@/lib/domain/types";

export const metadata = { title: "Upload a product image" };

async function Flow({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const [{ product }, { data }] = await Promise.all([searchParams, db().from("products").select("*").order("sku")]);
  return <UploadFlow products={(data ?? []) as Product[]} initialProductId={product ?? ""} />;
}

export default function NewProductPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Upload a product image" sub="The image is analysed so every prompt knows the product, and the real pack is cut out so it's never regenerated." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Flow searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
