import { Suspense } from "react";
import { PageTitle, Skeleton } from "@/components/ui";
import { EvalSuite } from "@/components/eval/eval-suite";
import { getSuite } from "@/lib/eval/data";
import { getRole } from "@/lib/role";

export const metadata = { title: "Model lab" };

async function Content() {
  const [suite, role] = await Promise.all([getSuite(), getRole()]);
  return (
    <div className="flex flex-col gap-6">
      <PageTitle title="Model lab" sub="An evaluation suite for every model in the pipeline: images, text in images, video, copy, analysis and cutouts. Every run and score is saved, and nothing here changes your assets." />
      <EvalSuite suite={suite} role={role} />
    </div>
  );
}

export default function LabPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>}><Content /></Suspense>;
}
