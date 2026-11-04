"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CoverageChip } from "@/components/ui";
import { Img } from "@/components/ui/image";
import { COVERAGE_LABEL } from "@/lib/domain/status";
import { CHANNELS, CHANNEL_LABEL, type Channel } from "@/lib/domain/types";
import { COVERAGE_TONE } from "./coverage";
import type { ProductRow } from "@/lib/data/products";

export function ProductTable({ products, canRun }: { products: ProductRow[]; canRun: boolean }) {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<Channel | "all">("all");
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => (channel === "all" || p.channels.includes(channel)) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));
  }, [products, search, channel]);

  return (
    <>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
        <label className="flex max-w-[360px] flex-[1_1_280px] items-center gap-2 rounded-[10px] border border-line-strong bg-raised px-3.5 py-2.5 text-muted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <span className="sr-only">Search products</span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or SKU" className="min-w-0 flex-1 bg-transparent text-fg outline-none" />
        </label>
        <div className="flex flex-wrap gap-2">
          {(["all", ...CHANNELS] as const).map((c) => (
            <button key={c} type="button" onClick={() => setChannel(c)} aria-pressed={channel === c} className={`rounded-full border px-3.5 py-2 text-[13px] ${channel === c ? "border-fg bg-fg text-canvas" : "border-line-strong text-body hover:border-muted"}`}>
              {c === "all" ? "All channels" : CHANNEL_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-line bg-table p-12 text-center">
          <h2 className="text-xl font-semibold">{products.length === 0 ? "No products yet" : `No products match "${search}"`}</h2>
          <p className="mt-1 text-muted">{products.length === 0 ? "Upload a product image to start." : "Try a name or SKU, or clear the channel filter."}</p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-line bg-table">
          <table className="w-full min-w-[960px] border-collapse">
            <thead>
              <tr className="text-left text-xs tracking-[0.08em] text-muted">
                {["PRODUCT", "SIZE", "PRIMARY CLAIM", "CHANNEL COVERAGE", "APPROVED", ""].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-raised">
                  <td className="px-4 py-3.5">
                    <Link href={`/products/${p.sku}`} className="flex items-center gap-3">
                      {p.frontUrl ? <Img src={p.frontUrl} alt="" className="size-11 flex-none rounded-lg bg-white" sizes="44px" /> : <span aria-hidden="true" className="size-11 flex-none rounded-lg border border-dashed border-line-dashed bg-placeholder" />}
                      <span>
                        <span className="block font-semibold">{p.name}</span>
                        <span className="block text-xs text-muted">{p.sku}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-body">{p.size}</td>
                  <td className="px-4 py-3.5 text-body">{p.primary_claim}</td>
                  <td className="px-4 py-3.5">
                    <span className="flex flex-wrap gap-1.5">
                      {p.coverage.map((c) => <CoverageChip key={c.channel} channel={CHANNEL_LABEL[c.channel]} label={COVERAGE_LABEL[c.status]} tone={COVERAGE_TONE[c.status]} />)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-body">{p.assets.length ? `${p.approved} of ${p.assets.length}` : "Not started"}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right">
                    {!p.frontUrl && canRun
                      ? <Link href={`/products/new?product=${p.id}`} className="rounded-lg border border-line-strong bg-control px-3 py-2 text-[13px] text-fg hover:border-muted">Upload image</Link>
                      : <Link href={`/products/${p.sku}`} className="rounded-lg border border-line-strong bg-control px-3 py-2 text-[13px] text-fg hover:border-muted">{p.assets.length ? "Open" : p.frontUrl ? "Generate" : "View"}</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
