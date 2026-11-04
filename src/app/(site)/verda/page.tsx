import { Suspense } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { listSiteProducts } from "@/lib/data/site";

export const metadata = { title: { absolute: "VERDA · Calm, botanical hair care" } };

async function Catalog() {
  const products = await listSiteProducts();
  const lead = products.find((p) => p.lifestyle);
  if (!products.length)
    return (
      <section className="mx-auto max-w-[640px] px-5 py-32 text-center">
        <h1 className="font-display text-4xl font-medium">Nothing here yet</h1>
        <p className="mt-3 text-[var(--verda-muted)]">Products appear here when they&apos;re approved and published from Shelf Studio.</p>
        <Link href="/products" className="mt-6 inline-block border-b border-[var(--verda-ink)] pb-0.5 text-sm">Open Shelf Studio</Link>
      </section>
    );
  return (
    <>
      {lead?.lifestyle && (
        <section className="mx-auto grid max-w-[1240px] items-center gap-10 px-5 py-10 sm:px-8 md:grid-cols-2 md:py-16">
          <div className="order-2 md:order-1">
            <p className="text-sm text-[var(--verda-muted)]">{lead.product.primary_claim}</p>
            <h1 className="mt-3 font-display text-5xl font-medium leading-[1.05] md:text-6xl">{lead.copy?.title?.replace(/^VERDA\s+/, "").split(",")[0] ?? lead.product.name}</h1>
            <p className="mt-5 max-w-md text-[var(--verda-muted)]">{lead.copy?.description?.split(/(?<=\.)\s/)[0]}</p>
            <Link href={`/verda/${lead.product.slug}`} className="mt-7 inline-block bg-[var(--verda-ink)] px-7 py-3.5 text-sm text-[var(--verda-cream)] hover:bg-[var(--verda-sage)]">View product</Link>
          </div>
          <div className="relative order-1 aspect-square overflow-hidden md:order-2">
            <NextImage src={lead.lifestyle.url} alt={lead.lifestyle.alt} fill priority sizes="(min-width: 768px) 600px, 100vw" className="object-cover" />
          </div>
        </section>
      )}
      <section className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8">
        <h2 className="font-display text-3xl font-medium">Shop</h2>
        <ul className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const img = p.hero ?? p.lifestyle ?? p.claim;
            return (
              <li key={p.product.id}>
                <Link href={`/verda/${p.product.slug}`} className="group block">
                  <span className="relative block aspect-square overflow-hidden bg-white">
                    {img && <NextImage src={img.url} alt={img.alt} fill sizes="(min-width: 1024px) 400px, 50vw" className="object-contain transition-transform duration-500 group-hover:scale-[1.02]" />}
                  </span>
                  <span className="mt-3 block text-[17px]">{p.product.name}</span>
                  <span className="block text-sm text-[var(--verda-muted)]">{[p.product.primary_claim, p.product.size].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

export default function VerdaHome() {
  return <Suspense fallback={<div className="mx-auto h-96 max-w-[1240px] animate-pulse" />}><Catalog /></Suspense>;
}
