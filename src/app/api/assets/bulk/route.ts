import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { approve, checksFor, submitForReview } from "@/lib/pipeline/review";
import { getRole } from "@/lib/role";
import { can } from "@/lib/domain/permissions";
import type { Asset } from "@/lib/domain/types";

const body = z.object({ action: z.enum(["submit", "approve"]), ids: z.array(z.string().uuid()).min(1).max(200) });

export async function POST(req: Request) {
  const role = await getRole();
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Nothing selected." }, { status: 400 });
  const { action, ids } = parsed.data;
  if (!can(role, action === "submit" ? "submit" : "review")) return Response.json({ error: "Your role can't do that." }, { status: 403 });
  const { data } = await db().from("assets").select("*").in("id", ids);
  const done: string[] = [], skipped: { id: string; reason: string }[] = [];
  await Promise.all(((data ?? []) as unknown as Asset[]).map(async (asset) => {
    try {
      if (action === "submit") await submitForReview(asset, role);
      else {
        // Bulk approve never covers video or anything a person needs to confirm.
        if (asset.shot_key === "video") throw new Error("Video is always reviewed individually.");
        const checks = await checksFor(asset.id);
        if (checks.some((c) => c.result !== "pass")) throw new Error("A check needs confirming.");
        await approve(asset, role, false);
      }
      done.push(asset.id);
    } catch (error) {
      skipped.push({ id: asset.id, reason: error instanceof Error ? error.message : "Skipped" });
    }
  }));
  return Response.json({ done, skipped });
}
