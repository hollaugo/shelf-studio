import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { getRole } from "@/lib/role";

const body = z.object({
  overall: z.number().int().min(1).max(5),
  scores: z.record(z.string(), z.number().int().min(1).max(5)).default({}),
  tags: z.array(z.string().max(40)).max(20).default([]),
  note: z.string().trim().max(2000).nullable().default(null),
});

/** One score per role per task, so anyone can revise their own and different roles can compare. */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  const { id } = await params;
  const parsed = body.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: "Give an overall score from 1 to 5." }, { status: 400 });
  const { data, error } = await db().from("eval_annotations").upsert({ task_id: id, author_role: role, ...parsed.data, updated_at: new Date().toISOString() } as never, { onConflict: "task_id,author_role" }).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ annotation: data });
}
