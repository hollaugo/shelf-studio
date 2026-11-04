import { Suspense } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { listAllProducts, listSiteProducts, publicationLog } from "@/lib/data/site";
import { publicUrl } from "@/lib/supabase/server";
import { CHANNEL_LABEL, SHOT_LABEL } from "@/lib/domain/types";

export const metadata = { title: { absolute: "Site content · VERDA" }, robots: { index: false } };

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const SLOTS = [["hero", "Main image"], ["lifestyle", "Lifestyle"], ["inUse", "In-use"], ["claim", "Claim card"], ["video", "Video"], ["copy", "Copy"]] as const;

async function Content() {
  const [all, live, log] = await Promise.all([listAllProducts(), listSiteProducts(), publicationLog()]);
  const byId = new Map(live.map((p) => [p.product.id, p]));
  return (
    <div className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8">
      <h1 className="font-display text-4xl font-medium">Site content</h1>
      <p className="mt-2 max-w-xl text-[var(--verda-muted)]">Pages fill themselves from what&apos;s published in Shelf Studio. Nothing reaches the site without approval.</p>
      <div className="mt-8 overflow-x-auto border border-[var(--verda-stone)]/70 bg-white">
        <table className="w-full min-w-[820px] border-collapse text-sm">
          <thead><tr className="text-left text-xs tracking-[0.06em] text-[var(--verda-muted)]"><th className="px-4 py-3 font-medium">PAGE</th><th className="px-4 py-3 font-medium">STATUS</th><th className="px-4 py-3 font-medium">FILLED SLOTS</th><th className="px-4 py-3 font-medium">LAST PUBLISHED</th></tr></thead>
          <tbody>
            {all.map((p) => {
              const site = byId.get(p.id);
              return (
                <tr key={p.id} className="border-t border-[var(--verda-stone)]/50">
                  <td className="px-4 py-3">{site ? <Link href={`/verda/${p.slug}`} className="underline underline-offset-2">{p.name}</Link> : p.name}<span className="block text-xs text-[var(--verda-muted)]">/verda/{p.slug}</span></td>
                  <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 text-xs ${site ? "bg-[var(--verda-sage)] text-white" : "bg-[var(--verda-cream)]"}`}>{site ? "Live" : "Draft"}</span></td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      {SLOTS.map(([key, label]) => <span key={key} className={`px-1.5 py-0.5 text-xs ${site?.[key] ? "bg-[var(--verda-cream)]" : "text-[var(--verda-muted)] line-through opacity-60"}`}>{label}</span>)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--verda-muted)]">{site ? when(site.publishedAt) : "Not published"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="mt-12 font-display text-3xl font-medium">Publication log</h2>
      {log.length === 0 ? <p className="mt-3 text-[var(--verda-muted)]">Nothing has been published yet.</p> : (
        <ul className="mt-4">
          {log.map((row) => {
            const url = publicUrl("outputs", row.asset?.storage_path);
            const image = url && row.asset?.shot_key !== "video";
            return (
              <li key={row.id} className="flex items-center gap-4 border-t border-[var(--verda-stone)]/50 py-3 text-sm">
                <span className="relative size-12 flex-none overflow-hidden bg-[var(--verda-cream)]">{image && <NextImage src={url} alt="" fill sizes="48px" className="object-cover" />}</span>
                <span className="min-w-0 flex-1">{row.asset ? SHOT_LABEL[row.asset.shot_key] : "Asset"}{row.asset && row.asset.version > 1 && ` v${row.asset.version}`} <span className="text-[var(--verda-muted)]">· {CHANNEL_LABEL[row.channel]} rendition · by {row.published_by}</span></span>
                <span className="whitespace-nowrap text-xs text-[var(--verda-muted)]">{when(row.published_at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function ContentPage() {
  return <Suspense fallback={<div className="mx-auto h-96 max-w-[1240px]" />}><Content /></Suspense>;
}
