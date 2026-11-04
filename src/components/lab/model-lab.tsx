"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Notice, Panel, Spinner } from "@/components/ui";
import { can } from "@/lib/domain/permissions";
import { IMAGE_MODELS, VIDEO_MODELS, imageModel, videoModel } from "@/lib/runway/model-registry";
import type { Role } from "@/lib/domain/types";

type Result = { id: string; model: string; kind: "image" | "video"; status: "queued" | "running" | "done" | "failed"; runwayStatus: string | null; prompt: string | null; credits: number; error: string | null; errorCode: string | null; startedAt: string | null; finishedAt: string | null; sceneUrl: string | null; compositeUrl: string | null };

const pill = (on: boolean) => `rounded-full border px-3.5 py-2 text-[13px] ${on ? "border-info bg-info-bg text-info-strong" : "border-line-strong text-body hover:border-muted"}`;

function seconds(r: Result, now: number) {
  if (!r.startedAt) return null;
  const end = r.finishedAt ? new Date(r.finishedAt).getTime() : now;
  return Math.max(0, Math.round((end - new Date(r.startedAt).getTime()) / 1000));
}

export function ModelLab({ role, products, currentImage, currentVideo, initialBatch, creditBalance }: { role: Role; products: { id: string; sku: string; name: string }[]; currentImage: string | null; currentVideo: string | null; initialBatch: string | null; creditBalance: number | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<"image" | "video">("image");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [shot, setShot] = useState<"lifestyle" | "in_use">("lifestyle");
  const [ratio, setRatio] = useState<"square" | "wide">("square");
  const [direction, setDirection] = useState("");
  const [picked, setPicked] = useState<string[]>(["gemini_image3.1_flash", "gemini_image3_pro", "gpt_image_2_5_sunburst"]);
  const [pickedVideo, setPickedVideo] = useState<string[]>(["gen4.5", "klingO3_pro", "veo3.1"]);
  const [batch, setBatch] = useState(initialBatch);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [pending, start] = useTransition();
  const stop = useRef(false);

  const models = kind === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const chosen = kind === "image" ? picked : pickedVideo;
  const total = useMemo(() => models.filter((m) => chosen.includes(m.id)).reduce((sum, m) => sum + m.credits, 0), [models, chosen]);
  const running = results.some((r) => r.status === "queued" || r.status === "running");
  const canRun = can(role, "run");

  useEffect(() => {
    if (!batch) return;
    stop.current = false;
    const loop = async () => {
      while (!stop.current) {
        const res = await fetch(`/api/lab/${batch}`, { method: "POST" }).catch(() => null);
        if (stop.current) return;
        if (res?.ok) {
          const body = await res.json();
          setResults(body.results);
          const list = body.results as Result[];
          const busy = list.some((r) => r.status === "queued" || r.status === "running");
          const compositing = list.some((r) => r.kind === "image" && r.status === "done" && !r.compositeUrl);
          if (!busy && !compositing) return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    };
    loop();
    return () => { stop.current = true; };
  }, [batch]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const toggle = (id: string) => (kind === "image" ? setPicked : setPickedVideo)((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const begin = () => start(async () => {
    setError(null);
    setSaved(null);
    const res = await fetch("/api/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, kind, shot, ratio, models: chosen, direction: direction || undefined }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setResults([]);
    setBatch(body.batch);
  });
  const makeDefault = (r: Result) => start(async () => {
    setError(null);
    const res = await fetch("/api/lab/use", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: r.kind, model: r.model }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error);
    setSaved(r.model);
    router.refresh();
  });

  if (!products.length) return <Notice tone="info" title="No products are ready">Upload a product image first, so there is a real pack to composite.</Notice>;

  return (
    <>
      <Panel title="SET UP A COMPARISON">
        <div role="tablist" aria-label="Type" className="mb-4 flex gap-2">
          <button type="button" role="tab" aria-selected={kind === "image"} className={pill(kind === "image")} onClick={() => setKind("image")}>Images</button>
          <button type="button" role="tab" aria-selected={kind === "video"} className={pill(kind === "video")} onClick={() => setKind("video")}>Video</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="lab-product" className="text-xs text-muted">Product</label>
            <select id="lab-product" value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg">
              {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
            </select>
          </div>
          {kind === "image" && (
            <>
              <div>
                <label htmlFor="lab-shot" className="text-xs text-muted">Shot</label>
                <select id="lab-shot" value={shot} onChange={(e) => setShot(e.target.value as typeof shot)} className="mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg">
                  <option value="lifestyle">Lifestyle</option>
                  <option value="in_use">In-use</option>
                </select>
              </div>
              <div>
                <label htmlFor="lab-ratio" className="text-xs text-muted">Shape</label>
                <select id="lab-ratio" value={ratio} onChange={(e) => setRatio(e.target.value as typeof ratio)} className="mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg">
                  <option value="square">Square, for marketplaces</option>
                  <option value="wide">Wide, for verda.com</option>
                </select>
              </div>
            </>
          )}
        </div>
        <div className="mt-3">
          <label htmlFor="lab-direction" className="text-xs text-muted">{kind === "image" ? "Direction for the scene. Optional" : "Motion prompt. Optional, otherwise a locked-off shot with shifting light"}</label>
          <input id="lab-direction" value={direction} onChange={(e) => setDirection(e.target.value)} placeholder={kind === "image" ? "e.g. warmer morning light, a little steam" : "e.g. light shifts across the shelf, camera stays still"} className="mt-1.5 w-full rounded-[10px] border border-line-strong bg-well px-3 py-2.5 text-fg" />
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs text-muted">Models</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {models.map((m) => {
              const on = chosen.includes(m.id);
              const current = m.id === (kind === "image" ? currentImage : currentVideo);
              return (
                <label key={m.id} className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border p-3 ${on ? "border-info bg-info-bg/40" : "border-line-strong"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(m.id)} className="mt-0.5 size-4 flex-none accent-[#9fb3ff]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{m.label}</span><span className="text-xs text-muted">{m.credits} credits</span></span>
                    <span className="block text-xs leading-4 text-muted">{current ? "Current default" : m.note}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {error && <div className="mt-3"><Notice title="That didn't start">{error}</Notice></div>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" pending={pending} disabled={!canRun || chosen.length === 0 || running} onClick={begin}>{running ? "Comparison running" : `Start comparison · est. ${total} credits`}</Button>
          <span className="text-[13px] text-muted">{canRun ? (creditBalance !== null ? `${creditBalance.toLocaleString()} credits available.` : "") : "Switch to the Producer or Owner role to start."}{kind === "image" ? " The agent writes one prompt, and every model gets it." : ""}</span>
        </div>
      </Panel>

      {results.length > 0 && (
        <section aria-live="polite" className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold leading-7 tracking-[-0.01em]">Results</h2>
          {saved && <Notice tone="info" title={`${imageModel(saved)?.label ?? videoModel(saved)?.label} is now the default`}>New generations use it. Existing assets stay as they are until you regenerate them.</Notice>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(380px,100%),1fr))] gap-4">
            {results.map((r) => {
              const meta = imageModel(r.model) ?? videoModel(r.model);
              const time = seconds(r, now);
              const isCurrent = r.model === (r.kind === "image" ? currentImage : currentVideo);
              const working = r.status === "queued" || r.status === "running" || (r.kind === "image" && r.status === "done" && !r.compositeUrl);
              return (
                <article key={r.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0"><div className="font-semibold">{meta?.label ?? r.model}</div><div className="text-xs leading-4 text-muted">{time !== null ? `${time} s` : "Waiting"}{r.status === "done" ? ` · ${r.credits} credits` : meta ? ` · est. ${meta.credits} credits` : ""}</div></div>
                    {r.status === "failed" ? <Chip tone="danger">Failed</Chip> : working ? <Chip tone="info" spin>{r.status === "queued" || r.runwayStatus === "THROTTLED" ? "Queued" : r.status === "done" ? "Compositing" : "Generating"}</Chip> : <Chip tone="ok">Done</Chip>}
                  </div>
                  {r.status === "failed" && <Notice title={r.errorCode ?? "Failed"}>{r.error}</Notice>}
                  {r.kind === "video" && r.sceneUrl && <video src={r.sceneUrl} controls loop playsInline className="mx-auto max-h-[560px] rounded-[10px] bg-canvas" />}
                  {r.kind === "image" && (r.compositeUrl
                    // eslint-disable-next-line @next/next/no-img-element -- judging quality needs the original pixels, not an optimised copy
                    ? <a href={r.compositeUrl} target="_blank" rel="noreferrer" className="block"><img src={r.compositeUrl} alt={`${meta?.label} result with the real pack`} className="w-full rounded-[10px]" /><span className="mt-1 block text-xs text-muted">With the real pack. Open full size</span></a>
                    : r.status !== "failed" && <div className="shimmer flex aspect-square items-center justify-center rounded-[10px] text-xs text-muted"><Spinner /></div>)}
                  {r.kind === "image" && r.sceneUrl && (
                    <a href={r.sceneUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 text-xs text-muted hover:text-fg">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a small preview of the model's raw output */}
                      <img src={r.sceneUrl} alt="" className="size-12 rounded-md object-cover" />
                      Raw scene from the model
                    </a>
                  )}
                  {r.status === "done" && !working && (isCurrent ? <p className="text-xs text-muted">This is the current default.</p> : <Button variant="card" className="flex-none" pending={pending} disabled={!can(role, "edit_settings")} onClick={() => makeDefault(r)}>{can(role, "edit_settings") ? "Make this the default" : "Switch to Owner to make this the default"}</Button>)}
                </article>
              );
            })}
          </div>
          {results[0]?.prompt && <details className="rounded-[14px] border border-line bg-surface p-4"><summary className="cursor-pointer font-medium">The prompt every model received</summary><p className="mt-2 text-[13px] leading-[18px] text-body">{results[0].prompt}</p></details>}
        </section>
      )}
    </>
  );
}
