"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { experimental_useObject as useObject } from "@ai-sdk/react";
import { Button, Chip, DataRow, Notice, Panel, Spinner } from "@/components/ui";
import { analysisSchema, type AnalysisOutput } from "@/lib/pipeline/analysis-schema";
import { CHANNELS, CHANNEL_LABEL, type Channel, type Product } from "@/lib/domain/types";

type Step = "choose" | "working" | "confirm";

export function UploadFlow({ products, initialProductId }: { products: Product[]; initialProductId: string }) {
  const router = useRouter();
  const [productId, setProductId] = useState(initialProductId);
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [cutout, setCutout] = useState<{ status: "idle" | "running" | "done" | "failed"; url?: string; error?: string }>({ status: "idle" });
  const [front, setFront] = useState<{ file: File; url: string } | null>(null);
  const [back, setBack] = useState<{ file: File; url: string } | null>(null);

  const analysis = useObject({
    api: "",
    schema: analysisSchema,
    fetch: (_url, init) => fetch(`/api/products/${currentId.current}/analyze`, init),
    onFinish: ({ object, error: e }) => {
      if (e || !object) setError("The analysis didn't finish. Try again.");
      else if (object) seedForm(object);
    },
    onError: () => setError("The analysis didn't finish. Try again."),
  });
  const currentId = useRef("");

  const [form, setForm] = useState({ name: "", size: "", primary_claim: "", channels: [] as Channel[] });
  const [saving, setSaving] = useState(false);

  function seedForm(a: AnalysisOutput) {
    setForm((f) => ({
      ...f,
      name: f.name && f.name !== "New product" ? f.name : [a.brand, a.productName].filter(Boolean).join(" ") || a.productType,
      size: f.size || a.size || "",
      primary_claim: f.primary_claim || a.claimsOnPack[0] || "",
    }));
    setStep("confirm");
  }

  async function runCutout(id: string) {
    setCutout({ status: "running" });
    const res = await fetch(`/api/products/${id}/cutout`, { method: "POST" });
    const body = await res.json();
    if (res.ok) setCutout({ status: "done", url: body.cutoutUrl });
    else setCutout({ status: "failed", error: body.error });
  }

  async function begin() {
    if (!front) return;
    setError(null);
    setPreview(front.url);
    setStep("working");
    const data = new FormData();
    data.set("file", front.file);
    if (back) data.set("back", back.file);
    if (productId) data.set("productId", productId);
    const res = await fetch("/api/products", { method: "POST", body: data });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error);
      setStep("choose");
      return;
    }
    const p = body.product as Product;
    setProduct(p);
    currentId.current = p.id;
    setForm({ name: p.source === "sku_sheet" ? p.name : "", size: p.size ?? "", primary_claim: p.primary_claim ?? "", channels: p.channels.length ? p.channels : ["amazon", "verda"] });
    analysis.submit({});
    runCutout(p.id);
  }

  async function save() {
    if (!product) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, size: form.size || null, primary_claim: form.primary_claim || null, approved_claims: form.primary_claim ? [form.primary_claim] : [] }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) return setError(body.error);
    router.push(`/products/${body.product.sku}`);
  }

  const a = analysis.object;
  const locked = product?.source === "sku_sheet";

  if (step === "choose")
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {error && <div className="mb-4"><Notice title="That didn't upload">{error}</Notice></div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <ImageSlot label="Front of pack" hint="Required. On a plain background works best. Used for every image." image={front} onChange={setFront} />
            <ImageSlot label="Back of pack" hint="Recommended. Lets videos show the real rear label, and its text informs the copy." image={back} onChange={setBack} />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-muted">JPEG, PNG or WebP, at least 512 × 512 pixels and up to 20 MB each.</span>
            <Button variant="primary" disabled={!front} onClick={begin}>Analyse and cut out</Button>
          </div>
        </div>
        <Panel title="WHICH PRODUCT IS THIS?">
          <label htmlFor="product" className="text-xs text-muted">Attach to a SKU, or create a new product</label>
          <select id="product" value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg">
            <option value="">New product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
          </select>
          <p className="mt-3 text-xs leading-4 text-muted">SKU sheet products keep their approved name and claims. The image only adds what the pipeline needs to know visually.</p>
        </Panel>
      </div>
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4">
        <Panel title={back ? "YOUR IMAGES" : "YOUR IMAGE"}>
          <div className={back ? "grid grid-cols-2 gap-2.5" : ""}>
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL can't go through the image optimiser
              <img src={preview} alt="Front of pack" className="aspect-square w-full rounded-[10px] bg-white object-contain" />
            )}
            {back && (
              // eslint-disable-next-line @next/next/no-img-element -- a local object URL can't go through the image optimiser
              <img src={back.url} alt="Back of pack" className="aspect-square w-full rounded-[10px] bg-white object-contain" />
            )}
          </div>
        </Panel>
        <Panel title="REAL PACK CUTOUT">
          {cutout.status === "running" && <p className="flex items-center gap-2 text-info"><Spinner size={14} /> Cutting out the real pack</p>}
          {cutout.status === "done" && cutout.url && (
            <>
              <div className="flex aspect-square items-center justify-center rounded-[10px] bg-[#1b5e4b] p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- transparency has to show exactly as stored */}
                <img src={cutout.url} alt="Product cut out from its background" className="max-h-full max-w-full object-contain" />
              </div>
              <p className="mt-2 text-xs leading-4 text-muted">Original pixels, shown on a test colour. A model drew only the mask. 11 credits.</p>
            </>
          )}
          {cutout.status === "failed" && (
            <>
              <Notice title="Couldn't cut out the pack">{cutout.error}</Notice>
              <div className="mt-3"><Button onClick={() => product && runCutout(product.id)}>Try again</Button></div>
            </>
          )}
        </Panel>
      </aside>
      <div className="flex flex-col gap-4">
        {error && <Notice title="Something went wrong">{error}</Notice>}
        <Panel title={<span className="flex items-center justify-between">WHAT THE AGENT UNDERSTOOD {analysis.isLoading && <Chip tone="info" spin>Analysing</Chip>}</span>}>
          <div>
            <DataRow label="Product">{a?.productType ?? "…"}</DataRow>
            <DataRow label="Name on pack">{[a?.brand, a?.productName].filter(Boolean).join(" ") || "…"}</DataRow>
            <DataRow label="Size">{a?.size ?? "…"}</DataRow>
            <DataRow label="Packaging">{a?.packaging ? [a.packaging.form, a.packaging.material, a.packaging.finish, a.packaging.closure].filter(Boolean).join(" · ") : "…"}</DataRow>
            <DataRow label="Lighting">{a?.lighting ?? "…"}</DataRow>
            <DataRow label="Mood">{a?.brandMood?.join(", ") ?? "…"}</DataRow>
            <div className="flex items-center justify-between gap-3 border-t border-line-soft py-2.5">
              <span className="text-muted">Colours</span>
              <span className="flex flex-wrap justify-end gap-2">
                {a?.palette?.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs text-body">
                    <span aria-hidden="true" className="size-3.5 rounded-full border border-line-strong" style={{ background: c?.hex }} />
                    {c?.name}
                  </span>
                ))}
              </span>
            </div>
            <DataRow label="Settings that suit it">{a?.scenePrompting?.suggestedSettings?.join(" · ") ?? "…"}</DataRow>
            <DataRow label="Text on pack">{a?.visibleText?.join(" / ") ?? "…"}</DataRow>
            {a?.issues && a.issues.length > 0 && <DataRow label="Image issues"><span className="text-warn">{a.issues.join(" · ")}</span></DataRow>}
          </div>
        </Panel>
        {step === "confirm" && (
          <Panel title="CONFIRM PRODUCT DATA">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField id="name" label="Name" value={form.name} disabled={locked} onChange={(name) => setForm({ ...form, name })} />
              <TextField id="size" label="Size" value={form.size} disabled={locked} onChange={(size) => setForm({ ...form, size })} />
              <div className="sm:col-span-2">
                <TextField id="claim" label={locked ? "Primary claim · locked by the SKU sheet" : "Primary claim. Only add one you can substantiate"} value={form.primary_claim} disabled={locked} onChange={(primary_claim) => setForm({ ...form, primary_claim })} />
              </div>
            </div>
            <fieldset className="mt-4">
              <legend className="text-xs text-muted">Channels</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHANNELS.map((c) => {
                  const on = form.channels.includes(c);
                  return (
                    <label key={c} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] border px-3 ${on ? "border-info bg-info-bg text-info-strong" : "border-line-strong text-body"}`}>
                      <input type="checkbox" checked={on} className="size-4 accent-[#9fb3ff]" onChange={() => setForm({ ...form, channels: on ? form.channels.filter((x) => x !== c) : [...form.channels, c] })} />
                      {CHANNEL_LABEL[c]}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <div className="mt-4 flex justify-end">
              <Button variant="primary" pending={saving} disabled={cutout.status !== "done"} onClick={save}>{cutout.status === "done" ? "Save and continue" : "Waiting for the cutout"}</Button>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function ImageSlot({ label, hint, image, onChange }: { label: string; hint: string; image: { file: File; url: string } | null; onChange: (image: { file: File; url: string } | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const pick = (file?: File) => { if (file) onChange({ file, url: URL.createObjectURL(file) }); };
  return (
    <div>
      <button
        type="button"
        aria-label={image ? `Replace ${label.toLowerCase()} image` : `Choose ${label.toLowerCase()} image`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={`flex aspect-square w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed p-6 text-center ${drag ? "border-info bg-info-bg/30" : image ? "border-line bg-white" : "border-line-dashed bg-placeholder hover:border-muted"}`}
      >
        {image
          // eslint-disable-next-line @next/next/no-img-element -- a local object URL can't go through the image optimiser
          ? <img src={image.url} alt="" className="h-full w-full object-contain" />
          : <><span className="text-lg font-semibold">{label}</span><span className="text-[13px] leading-[18px] text-muted">Drop an image here, or browse</span></>}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`${label} image`} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      <p className="mt-2 text-xs leading-4 text-muted"><b className="font-medium text-body">{label}.</b> {hint}</p>
    </div>
  );
}

function TextField({ id, label, value, disabled, onChange }: { id: string; label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs leading-4 text-muted">{label}</label>
      <input id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg disabled:text-muted" />
    </div>
  );
}
