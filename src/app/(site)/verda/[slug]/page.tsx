import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import NextImage from "next/image";
import { notFound } from "next/navigation";
import { getSiteProduct } from "@/lib/data/site";

export async function generateMetadata({ params }: PageProps<"/verda/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteProduct(slug);
  if (!site) return { title: "Product not found" };
  const title = site.copy?.metaTitle ?? site.product.name;
  const description = site.copy?.metaDescription ?? site.copy?.description?.slice(0, 155);
  const image = (site.lifestyle ?? site.hero)?.url;
  return { title: { absolute: title }, description, openGraph: { title, description, images: image ? [image] : undefined } };
}

async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getSiteProduct(slug);
  if (!site) notFound();
  const { product, copy } = site;
  const gallery = [site.hero, site.lifestyle, site.inUse, site.claim].filter(Boolean) as NonNullable<typeof site.hero>[];
  const main = gallery[0];
  // Structured data repeats exactly what's visible, which is what answer engines rely on.
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "Product", name: copy?.title ?? product.name, sku: product.sku, brand: { "@type": "Brand", name: "VERDA" }, description: copy?.description, image: gallery.map((g) => g.url), size: product.size ?? undefined },
    ...(copy?.faq?.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: copy.faq.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }] : []),
  ];
  return (
    <article className="mx-auto max-w-[1240px] px-5 py-8 sm:px-8 md:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-6 text-sm text-[var(--verda-muted)]"><Link href="/verda" className="hover:text-[var(--verda-ink)]">Shop</Link> / {product.name}</nav>
      <div className="grid gap-10 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          {main && <div className="relative aspect-square overflow-hidden bg-white"><NextImage src={main.url} alt={main.alt} fill priority sizes="(min-width: 768px) 640px, 100vw" className="object-contain" /></div>}
          <div className="grid grid-cols-2 gap-3">
            {gallery.slice(1).map((g) => <div key={g.id} className="relative aspect-square overflow-hidden bg-white"><NextImage src={g.url} alt={g.alt} fill sizes="320px" className="object-cover" /></div>)}
            {site.video && <video src={site.video.url} aria-label={`${product.name} video`} autoPlay muted loop playsInline className="col-span-1 aspect-[9/16] w-full bg-[var(--verda-cream)] object-cover" />}
          </div>
        </div>
        <div className="md:sticky md:top-8 md:self-start">
          {product.primary_claim && <p className="text-sm text-[var(--verda-sage)]">{product.primary_claim}</p>}
          <h1 className="mt-2 font-display text-[44px] font-medium leading-[1.08]">{copy?.title ?? product.name}</h1>
          {product.size && <p className="mt-2 text-sm text-[var(--verda-muted)]">{product.size}</p>}
          {copy?.description && <div className="mt-6 space-y-3">{copy.description.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}</div>}
          {!!copy?.bullets?.length && <ul className="mt-6 space-y-2 border-t border-[var(--verda-stone)]/60 pt-6">{copy.bullets.map((b, i) => <li key={i} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-1.5 flex-none rounded-full bg-[var(--verda-sage)]" />{b}</li>)}</ul>}
          {!copy && <p className="mt-6 text-[var(--verda-muted)]">Product details are on their way.</p>}
          <p className="mt-8 text-xs text-[var(--verda-muted)]">Pricing and checkout aren&apos;t part of this sample site.</p>
        </div>
      </div>
      {!!copy?.faq?.length && (
        <section className="mt-16 max-w-[760px]">
          <h2 className="font-display text-3xl font-medium">Questions</h2>
          <dl className="mt-5">
            {copy.faq.map((f, i) => <div key={i} className="border-t border-[var(--verda-stone)]/60 py-4"><dt className="font-medium">{f.question}</dt><dd className="mt-1 text-[var(--verda-muted)]">{f.answer}</dd></div>)}
          </dl>
        </section>
      )}
    </article>
  );
}

export default function Page({ params }: PageProps<"/verda/[slug]">) {
  return <Suspense fallback={<div className="mx-auto h-[80vh] max-w-[1240px]" />}><ProductPage params={params as Promise<{ slug: string }>} /></Suspense>;
}
