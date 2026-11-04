"use client";

import { useState } from "react";
import type { Listing } from "@/lib/agent/channel-rules";
import type { AssetView } from "@/lib/data/detail";
import { CHANNEL_LABEL, SHOT_LABEL, type Channel, type Product } from "@/lib/domain/types";
import { Button } from "@/components/ui";

type Skin = { bar: string; barText: string; accent: string; link: string; cta: string; ctaText: string; ctaAlt?: string; radius: string; bulletsTitle: string; font: string };

/** Each retailer's general look, for judging how content reads in place. No logos, and it always says it's a preview. */
const SKINS: Record<Channel, Skin> = {
  amazon: { bar: "#131921", barText: "#ffffff", accent: "#232f3e", link: "#007185", cta: "#ffd814", ctaText: "#0f1111", ctaAlt: "#ffa41c", radius: "9999px", bulletsTitle: "About this item", font: "Arial, Helvetica, sans-serif" },
  walmart: { bar: "#0071dc", barText: "#ffffff", accent: "#004f9a", link: "#004f9a", cta: "#0071dc", ctaText: "#ffffff", radius: "9999px", bulletsTitle: "Key item features", font: "Arial, Helvetica, sans-serif" },
  target: { bar: "#ffffff", barText: "#cc0000", accent: "#cc0000", link: "#cc0000", cta: "#cc0000", ctaText: "#ffffff", radius: "8px", bulletsTitle: "Highlights", font: "Helvetica, Arial, sans-serif" },
  verda: { bar: "#27362a", barText: "#f1eddf", accent: "#4f6147", link: "#4f6147", cta: "#27362a", ctaText: "#f1eddf", radius: "2px", bulletsTitle: "Why you'll love it", font: "var(--font-jost, Jost), Arial, sans-serif" },
};

const GALLERY = ["hero", "lifestyle", "in_use", "claim_card", "video"] as const;

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="flex h-full w-full items-center justify-center bg-[#f4f4f2] p-2 text-center text-[12px] leading-4 text-[#6b6b66]">{children}</span>;
}

export function ChannelPreview({ channel, product, views, canWrite, writing, onWriteCopy }: { channel: Channel; product: Product; views: AssetView[]; canWrite: boolean; writing: boolean; onWriteCopy: () => void }) {
  const skin = SKINS[channel];
  const [width, setWidth] = useState<"desktop" | "phone">("desktop");
  const media = GALLERY.map((shot) => views.find((v) => v.asset.shot_key === shot)).filter((v): v is AssetView => !!v);
  const ready = media.filter((v) => v.url);
  const [chosen, setChosen] = useState<string | null>(null);
  const main = ready.find((v) => v.asset.id === chosen) ?? ready[0];
  const copyView = views.find((v) => v.asset.shot_key === "copy");
  const listing = copyView?.asset.content as Listing | null | undefined;
  const a = product.analysis;
  const brand = a?.brand ?? "VERDA";
  const live = views.filter((v) => ["approved", "published"].includes(v.asset.state)).length;
  const scene = (shot: string) => ready.find((v) => v.asset.shot_key === shot);
  const modules = (["lifestyle", "in_use", "claim_card"] as const).map(scene).filter((v): v is AssetView => !!v);
  const video = scene("video");
  const details: [string, string | null | undefined][] = [["Brand", brand], ["Size", product.size], ["Product", a?.productType], ["Container", a?.packaging?.form], ["Closure", a?.packaging?.closure], ["SKU", product.sku]];

  return (
    <section aria-label={`${CHANNEL_LABEL[channel]} page preview`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">How this could look on {CHANNEL_LABEL[channel]}, using the current version of each asset. {live} of {views.length} approved. {channel === "verda" ? "" : "It's a layout preview, not a live retailer page."}</p>
        <div role="group" aria-label="Preview width" className="flex rounded-[10px] border border-line-strong p-0.5">
          {(["desktop", "phone"] as const).map((w) => <button key={w} type="button" aria-pressed={width === w} onClick={() => setWidth(w)} className={`rounded-lg px-3 py-1.5 text-[13px] capitalize ${width === w ? "bg-control font-semibold text-fg" : "text-muted"}`}>{w}</button>)}
        </div>
      </div>

      <div className={`@container mx-auto w-full overflow-hidden rounded-xl bg-white text-[#0f1111] shadow-lg ${width === "phone" ? "max-w-[390px]" : ""}`} style={{ fontFamily: skin.font }}>
        <div aria-hidden="true" className="flex items-center gap-4 px-4 py-2.5" style={{ background: skin.bar, color: skin.barText, borderBottom: channel === "target" ? "1px solid #e5e5e5" : undefined }}>
          <span className="whitespace-nowrap text-[15px] font-bold tracking-tight">{CHANNEL_LABEL[channel]}</span>
          <span className="hidden min-w-0 flex-1 truncate rounded-md bg-white px-3 py-1.5 text-[13px] text-[#6b6b66] @2xl:block">{a?.productType ?? product.name}</span>
          <span className="ml-auto whitespace-nowrap rounded-full border border-current px-2.5 py-0.5 text-[11px] font-semibold">Preview</span>
        </div>

        <div className="grid gap-6 p-4 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @5xl:grid-cols-[minmax(0,5fr)_minmax(0,5fr)_250px] @3xl:p-6">
          <div className="flex min-w-0 flex-col-reverse gap-3 @2xl:flex-row">
            <div className="flex gap-2 overflow-x-auto @2xl:flex-col @2xl:overflow-visible">
              {media.map((v) => {
                const isMain = main?.asset.id === v.asset.id;
                return (
                  <button key={v.asset.id} type="button" disabled={!v.url} onClick={() => setChosen(v.asset.id)} aria-label={`Show ${SHOT_LABEL[v.asset.shot_key]}`} aria-pressed={isMain} className="relative size-14 flex-none overflow-hidden rounded-md border-2 bg-white" style={{ borderColor: isMain ? skin.link : "#d5d9d9" }}>
                    {!v.url ? <Missing>{v.asset.shot_key === "video" ? "Video" : "Soon"}</Missing>
                      : v.asset.shot_key === "video" ? <span className="flex h-full items-center justify-center bg-[#111] text-white"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>
                      // eslint-disable-next-line @next/next/no-img-element -- previews should show the exact published file
                      : <img src={v.url} alt="" className="h-full w-full object-contain" />}
                  </button>
                );
              })}
            </div>
            <div className="relative aspect-square min-w-0 flex-1 overflow-hidden rounded-md bg-white">
              {!main ? <Missing>Images appear here once they&apos;re generated</Missing>
                : main.asset.shot_key === "video" ? <video key={main.url} src={main.url!} controls loop playsInline className="h-full w-full bg-black object-contain" />
                // eslint-disable-next-line @next/next/no-img-element -- previews should show the exact published file
                : <img src={main.url!} alt={main.asset.alt_text ?? SHOT_LABEL[main.asset.shot_key]} className="h-full w-full object-contain" />}
            </div>
          </div>

          <div className="min-w-0">
            <h3 className={`font-normal leading-snug ${channel === "verda" ? "text-[30px]" : "text-[22px]"}`} style={channel === "verda" ? { fontFamily: "var(--font-cormorant, 'Cormorant Garamond'), Georgia, serif" } : undefined}>{listing?.title ?? product.name}</h3>
            <p className="mt-1 text-[14px]" style={{ color: skin.link }}>{channel === "verda" ? product.primary_claim : `Visit the ${brand} store`}</p>
            {channel !== "verda" && <p className="mt-1 text-[13px] text-[#565959]">No ratings yet</p>}
            <hr className="my-3 border-[#e5e5e5]" />
            <p className="text-[14px] text-[#565959]">Price set at listing</p>
            {(listing?.itemHighlights || listing?.shortDescription) && <p className="mt-3 text-[14px] leading-5">{listing.itemHighlights ?? listing.shortDescription}</p>}
            {listing ? (
              <>
                <h4 className="mt-4 text-[16px] font-bold">{skin.bulletsTitle}</h4>
                <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-[14px] leading-5">{listing.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
              </>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-[#c9c9c4] bg-[#fafaf8] p-4 text-[14px]">
                <p className="font-semibold">{writing ? "The agent is writing this listing" : "The listing hasn't been written yet"}</p>
                <p className="mt-1 text-[#565959]">{writing ? "The title, bullets and description appear here when it's done." : `The agent writes ${CHANNEL_LABEL[channel]} copy from approved product data.`}</p>
                {canWrite && !writing && <div className="mt-3"><Button variant="primary" onClick={onWriteCopy}>Write the listing</Button></div>}
              </div>
            )}
          </div>

          <aside aria-label="Purchase box preview" className="h-fit min-w-0 rounded-lg border border-[#d5d9d9] p-4 @3xl:col-span-2 @5xl:col-span-1">
            <p className="text-[14px] text-[#565959]">Price set at listing</p>
            {product.size && <p className="mt-1 text-[13px]">Size: <b>{product.size}</b></p>}
            <div aria-hidden="true" className="mt-3 flex flex-col gap-2">
              <span className="py-2 text-center text-[14px] font-medium" style={{ background: skin.cta, color: skin.ctaText, borderRadius: skin.radius }}>Add to cart</span>
              {skin.ctaAlt && <span className="py-2 text-center text-[14px] font-medium" style={{ background: skin.ctaAlt, color: skin.ctaText, borderRadius: skin.radius }}>Buy now</span>}
            </div>
            <p className="mt-3 text-[12px] leading-4 text-[#565959]">Buttons are part of the preview and do nothing.</p>
          </aside>
        </div>

        {(modules.length > 0 || listing || video) && (
          <div className="flex flex-col gap-6 border-t border-[#e5e5e5] p-4 @3xl:p-6">
            {modules.length > 0 && (
              <section>
                <h4 className="text-[20px] font-bold">{channel === "amazon" ? `From the brand` : `See it in use`}</h4>
                <div className="mt-3 grid gap-3 @2xl:grid-cols-3">
                  {modules.map((v) => (
                    // eslint-disable-next-line @next/next/no-img-element -- previews should show the exact published file
                    <img key={v.asset.id} src={v.url!} alt={v.asset.alt_text ?? SHOT_LABEL[v.asset.shot_key]} className="aspect-square w-full rounded-md object-cover" />
                  ))}
                </div>
              </section>
            )}
            {video && (
              <section>
                <h4 className="text-[20px] font-bold">Video</h4>
                <video src={video.url!} controls loop playsInline preload="metadata" className="mt-3 max-h-[480px] rounded-md bg-black" />
              </section>
            )}
            {listing && (
              <section>
                <h4 className="text-[20px] font-bold">Product description</h4>
                <p className="mt-2 max-w-[75ch] whitespace-pre-wrap text-[14px] leading-6">{listing.description}</p>
              </section>
            )}
            <section>
              <h4 className="text-[20px] font-bold">Product details</h4>
              <table className="mt-2 w-full max-w-[520px] border-collapse text-[14px]">
                <tbody>{details.filter(([, v]) => v).map(([k, v]) => <tr key={k} className="border-b border-[#e5e5e5]"><th scope="row" className="w-40 py-2 pr-4 text-left font-semibold">{k}</th><td className="py-2">{v}</td></tr>)}</tbody>
              </table>
            </section>
            {!!listing?.faq?.length && (
              <section>
                <h4 className="text-[20px] font-bold">Questions</h4>
                <dl className="mt-2 max-w-[75ch] space-y-3 text-[14px] leading-5">{listing.faq.map((f) => <div key={f.question}><dt className="font-semibold">{f.question}</dt><dd className="text-[#3f3f3c]">{f.answer}</dd></div>)}</dl>
              </section>
            )}
          </div>
        )}
      </div>

      {(listing?.metaTitle || listing?.searchTerms) && (
        <div className={`grid gap-3 ${listing.metaTitle && listing.searchTerms ? "md:grid-cols-2" : ""}`}>
          {listing.metaTitle && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="text-xs font-semibold tracking-[0.1em] text-muted">IN SEARCH RESULTS</div>
              <div className="mt-2 rounded-lg bg-white p-3 text-[#202124]">
                <div className="text-[12px] text-[#4d5156]">verda.com › {product.slug}</div>
                <div className="mt-0.5 text-[18px] leading-6 text-[#1a0dab]">{listing.metaTitle}</div>
                <div className="mt-0.5 text-[13px] leading-5 text-[#4d5156]">{listing.metaDescription}</div>
              </div>
            </div>
          )}
          {listing.searchTerms && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="text-xs font-semibold tracking-[0.1em] text-muted">BEHIND THE SCENES · NOT SHOWN TO SHOPPERS</div>
              <p className="mt-2 text-[13px] leading-5 text-body"><span className="text-muted">Search terms: </span>{listing.searchTerms}</p>
              <p className="mt-1.5 text-[13px] leading-5 text-body"><span className="text-muted">Image alt text: </span>{listing.altText}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
