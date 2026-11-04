import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Skeleton } from "@/components/ui";
import { PdpVersion } from "@/components/pdp/pdp-version";
import { getVersion } from "@/lib/data/pdps";
import { getRole } from "@/lib/role";

export const metadata = { title: "PDP" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [version, role] = await Promise.all([getVersion(id), getRole()]);
  if (!version) notFound();
  return <PdpVersion key={`${version.pdp.id}:${version.pdp.status}`} version={version} role={role} />;
}

export default function PdpPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-16 w-1/2" /><Skeleton className="h-96 w-full" /></div>}>
      <Content params={params} />
    </Suspense>
  );
}
