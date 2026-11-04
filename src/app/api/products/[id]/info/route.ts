import { db } from "@/lib/supabase/server";
import { getProduct } from "@/lib/data/products";
import { productDetailsSchema } from "@/lib/domain/product-info";
import { can } from "@/lib/domain/permissions";
import { extractProductInfo } from "@/lib/pipeline/extract-info";
import { getRole } from "@/lib/role";

export const maxDuration = 120;

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXT = 60_000;
const TEXT_FILE = /\.(txt|csv|tsv|json|md)$/i;

/** Reads uploaded or pasted product information into fields. Nothing is saved until the producer confirms. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can add product information." }, { status: 403 });
  const { id } = await params;
  if (!(await getProduct(id))) return Response.json({ error: "Product not found." }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  let input: { pdf: Buffer } | { text: string };
  if (file instanceof File) {
    if (file.size > MAX_BYTES) return Response.json({ error: "The file can be up to 5 MB." }, { status: 400 });
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) input = { pdf: Buffer.from(await file.arrayBuffer()) };
    else if (TEXT_FILE.test(file.name)) input = { text: await file.text() };
    else return Response.json({ error: "Use a PDF, TXT, CSV, TSV, JSON or Markdown file. Save other formats as PDF first." }, { status: 400 });
  } else input = { text: String(form.get("text") ?? "") };
  if ("text" in input) {
    input.text = input.text.trim();
    if (input.text.length < 3) return Response.json({ error: "Add a file, or paste the product information." }, { status: 400 });
    if (input.text.length > MAX_TEXT) return Response.json({ error: "That's too long to read at once. Keep it to one product." }, { status: 400 });
  }
  try {
    return Response.json({ info: await extractProductInfo(input) });
  } catch (error) {
    console.error("Reading product information failed", error);
    return Response.json({ error: "That couldn't be read. You can still type the details in." }, { status: 502 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!can(await getRole(), "run")) return Response.json({ error: "Only producers and owners can edit product information." }, { status: 403 });
  const { id } = await params;
  const parsed = productDetailsSchema.safeParse(await req.json());
  if (!parsed.success) return Response.json({ error: `Check ${parsed.error.issues[0].path.join(" ") || "the product information"}: it's too long or incomplete.` }, { status: 400 });
  const { data, error } = await db().from("products").update({ details: parsed.data } as never).eq("id", id).select("id");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data?.length) return Response.json({ error: "Product not found." }, { status: 404 });
  return Response.json({ details: parsed.data });
}
