"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, DataRow, Notice, Panel, Spinner } from "@/components/ui";
import { hasDetails, mergeDetails, type ExtractedInfo, type ProductDetails } from "@/lib/domain/product-info";
import { CHANNEL_LABEL, type Product } from "@/lib/domain/types";

const field = "mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg";

/** Sends a file or pasted text to be read. Returns the fields, for a person to confirm. */
export async function readProductInfo(productId: string, source: { file: File | null; text: string }) {
  const data = new FormData();
  if (source.file) data.set("file", source.file);
  else data.set("text", source.text);
  const res = await fetch(`/api/products/${productId}/info`, { method: "POST", body: data });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body.info as ExtractedInfo;
}

export function InfoSource({ file, text, onFile, onText }: { file: File | null; text: string; onFile: (file: File | null) => void; onText: (text: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => input.current?.click()}>{file ? "Choose another file" : "Upload a file"}</Button>
        {file && <span className="flex min-w-0 items-center gap-2 text-[13px] text-body"><span className="truncate">{file.name}</span><button type="button" className="text-muted hover:text-fg" onClick={() => onFile(null)}>Remove</button></span>}
        <input ref={input} type="file" accept=".pdf,.txt,.csv,.tsv,.json,.md" className="sr-only" aria-label="Product information file" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </div>
      <p className="mt-1.5 text-xs leading-4 text-muted">PDF, TXT, CSV, JSON or Markdown, up to 5 MB.</p>
      {!file && (
        <>
          <label htmlFor="info-text" className="mt-3 block text-xs text-muted">Or paste it</label>
          <textarea id="info-text" rows={5} value={text} onChange={(e) => onText(e.target.value)} placeholder="Description, benefits, ingredients, directions, warnings…" className={`${field} resize-y`} />
        </>
      )}
    </div>
  );
}

const lines = (v: string) => v.split("\n").map((l) => l.trim()).filter(Boolean);

export function DetailsFields({ value, onChange }: { value: ProductDetails; onChange: (next: ProductDetails) => void }) {
  const set = (patch: ProductDetails) => onChange({ ...value, ...patch });
  // Kept as typed, so a line can be started or left blank while editing.
  const [benefits, setBenefits] = useState((value.benefits ?? []).join("\n"));
  const [synced, setSynced] = useState(value.benefits);
  if (synced !== value.benefits) {
    setSynced(value.benefits);
    if (lines(benefits).join("\n") !== (value.benefits ?? []).join("\n")) setBenefits((value.benefits ?? []).join("\n"));
  }
  const input = (id: keyof ProductDetails, label: string) => (
    <label className="block text-xs text-muted">{label}<input value={(value[id] as string | null | undefined) ?? ""} onChange={(e) => set({ [id]: e.target.value })} className={field} /></label>
  );
  const area = (id: keyof ProductDetails, label: string, rows = 3) => (
    <label className="block text-xs text-muted sm:col-span-2">{label}<textarea rows={rows} value={(value[id] as string | null | undefined) ?? ""} onChange={(e) => set({ [id]: e.target.value })} className={`${field} resize-y`} /></label>
  );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {input("brand", "Brand")}
      {input("category", "Category")}
      {input("price", "Price")}
      {input("gtin", "GTIN or UPC")}
      {area("description", "Description", 4)}
      <label className="block text-xs text-muted sm:col-span-2">Benefits, one per line<textarea rows={4} value={benefits} onChange={(e) => { setBenefits(e.target.value); set({ benefits: lines(e.target.value) }); }} className={`${field} resize-y`} /></label>
      {area("ingredients", "Ingredients")}
      {area("directions", "How to use")}
      {area("warnings", "Warnings")}
    </div>
  );
}

/** The product database, on the product page. */
export function ProductDataPanel({ product, canEdit }: { product: Product; canEdit: boolean }) {
  const router = useRouter();
  const details = product.details ?? {};
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProductDetails>(details);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [reading, setReading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const read = async () => {
    setError(null);
    setReading(true);
    try {
      setForm(mergeDetails(form, await readProductInfo(product.id, { file, text })));
      setFile(null);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That couldn't be read.");
    }
    setReading(false);
  };
  const save = () => start(async () => {
    setError(null);
    const res = await fetch(`/api/products/${product.id}/info`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) return setError((await res.json()).error);
    setEditing(false);
    setSaved(true);
    router.refresh();
  });
  if (editing)
    return (
      <Panel title="EDIT PRODUCT INFORMATION" className="md:col-span-3">
        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <h3 className="mb-2 font-medium">Fill in from a file</h3>
            <InfoSource file={file} text={text} onFile={setFile} onText={setText} />
            <div className="mt-3"><Button pending={reading} disabled={!file && text.trim().length < 3} onClick={read}>{reading ? "Reading" : "Read into the form"}</Button></div>
          </div>
          <DetailsFields value={form} onChange={setForm} />
        </div>
        {error && <div className="mt-3"><Notice title="That didn't work">{error}</Notice></div>}
        <div className="mt-4 flex flex-wrap gap-2"><Button variant="primary" pending={pending} onClick={save}>Save product information</Button><Button onClick={() => { setForm(details); setEditing(false); }}>Cancel</Button></div>
      </Panel>
    );
  return (
    <Panel title="PRODUCT DATABASE">
      <DataRow label="Name">{product.name}</DataRow>
      <DataRow label="Size">{product.size}</DataRow>
      <DataRow label="Primary claim">{product.primary_claim} {product.source === "sku_sheet" && <span className="text-xs text-muted">· locked</span>}</DataRow>
      <DataRow label="Channels">{product.channels.map((c) => CHANNEL_LABEL[c]).join(" · ")}</DataRow>
      {details.price && <DataRow label="Price">{details.price}</DataRow>}
      {details.description && <DataRow label="Description"><span className="line-clamp-3 text-left">{details.description}</span></DataRow>}
      {!!details.benefits?.length && <DataRow label="Benefits">{details.benefits.length}</DataRow>}
      {details.ingredients && <DataRow label="Ingredients"><span className="line-clamp-2 text-left">{details.ingredients}</span></DataRow>}
      {details.directions && <DataRow label="How to use"><span className="line-clamp-2 text-left">{details.directions}</span></DataRow>}
      {!hasDetails(details) && <p className="border-t border-line-soft pt-2.5 text-[13px] leading-[18px] text-muted">No description, ingredients or directions yet, so listings can only use the name, size, claim and what&apos;s on the pack.</p>}
      {saved && <p className="mt-2 text-[13px] leading-[18px] text-ok">Saved. Regenerate a listing to use it.</p>}
      {canEdit && <div className="mt-3"><Button onClick={() => { setForm(details); setSaved(false); setEditing(true); }}>{hasDetails(details) ? "Edit product information" : "Add product information"}</Button></div>}
      {pending && <Spinner />}
    </Panel>
  );
}
