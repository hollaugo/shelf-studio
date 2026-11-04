import { Suspense } from "react";
import { PageTitle, Skeleton } from "@/components/ui";
import { UploadFlow } from "@/components/products/upload-flow";

export const metadata = { title: "Add new product" };

async function Flow({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  return <UploadFlow initialProductId={(await searchParams).product ?? ""} />;
}

export default function NewProductPage({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Add new product" sub="For a product that isn't in the catalog yet. Add its front and back images and its product sheet, then check what the agent understood." />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Flow searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
