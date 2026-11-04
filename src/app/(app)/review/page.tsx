import { Suspense } from "react";
import { PageTitle, Skeleton } from "@/components/ui";
import { ReviewBoard } from "@/components/review/review-board";
import { getBoard } from "@/lib/data/review";
import { getRole } from "@/lib/role";

export const metadata = { title: "Review board" };

async function Content() {
  const [items, role] = await Promise.all([getBoard(), getRole()]);
  const waiting = items.filter((i) => i.asset.state === "needs_review").length;
  return (
    <>
      <PageTitle title="Review board" sub={`${waiting} asset${waiting === 1 ? "" : "s"} waiting · open any asset for its pre-compliance report${role === "reviewer" ? "" : " · switch to the Reviewer role to decide"}`} />
      <ReviewBoard items={items} role={role} />
    </>
  );
}

export default function ReviewPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>}><Content /></Suspense>;
}
