import { Suspense } from "react";
import { connection } from "next/server";
import { PageTitle, Skeleton } from "@/components/ui";
import { ReviewBoard } from "@/components/review/review-board";
import { getBoard } from "@/lib/data/pdps";
import { getRole } from "@/lib/role";

export const metadata = { title: "Review board" };

async function Content() {
  await connection(); // A live board, so it belongs to the request rather than the prerender.
  const [items, role] = await Promise.all([getBoard(), getRole()]);
  const waiting = items.filter((i) => i.pdp.status === "in_review").length;
  return (
    <>
      <PageTitle title="Review board" sub={`${waiting} PDP${waiting === 1 ? "" : "s"} waiting · each card is one PDP version${role === "reviewer" ? "" : " · switch to the Reviewer role to decide"}`} />
      <ReviewBoard items={items} regenerating={items.some((i) => i.pdp.status === "changes_requested")} />
    </>
  );
}

export default function ReviewPage() {
  return <Suspense fallback={<div className="flex flex-col gap-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-96 w-full" /></div>}><Content /></Suspense>;
}
