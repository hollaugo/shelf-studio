import { tick } from "@/lib/pipeline/tick";

export const maxDuration = 300;

export async function POST() {
  await tick();
  return Response.json({ ok: true });
}

/** Vercel Cron keeps runs moving when nobody has the page open. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  await tick();
  return Response.json({ ok: true });
}
