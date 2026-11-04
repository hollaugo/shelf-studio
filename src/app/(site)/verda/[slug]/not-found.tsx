import Link from "next/link";

export default function NotFound() {
  return (
    <section className="mx-auto max-w-[640px] px-5 py-32 text-center">
      <h1 className="font-display text-4xl font-medium">This page isn&apos;t live</h1>
      <p className="mt-3 text-[var(--verda-muted)]">It may not have been published yet.</p>
      <Link href="/verda" className="mt-6 inline-block border-b border-[var(--verda-ink)] pb-0.5 text-sm">Back to the shop</Link>
    </section>
  );
}
