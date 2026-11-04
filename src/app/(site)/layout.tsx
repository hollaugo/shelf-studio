import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: { default: "VERDA", template: "%s · VERDA" }, description: "Calm, botanical hair care." };

const SITE = { "--verda-ink": "#2f3a2b", "--verda-sage": "#7d9073", "--verda-cream": "#f1eddf", "--verda-paper": "#faf8f2", "--verda-stone": "#d8cbb3", "--verda-muted": "#5f6a58" } as React.CSSProperties;

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={SITE} className="flex min-h-screen flex-1 flex-col bg-[var(--verda-paper)] font-brand text-[15px] leading-relaxed text-[var(--verda-ink)]">
      <div className="bg-[var(--verda-ink)] px-4 py-1.5 text-center text-xs text-[var(--verda-cream)]">
        Sample website for this demo. <Link href="/products" className="underline underline-offset-2">Back to Shelf Studio</Link>
      </div>
      <header className="border-b border-[var(--verda-stone)]/60">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/verda" aria-label="VERDA home" className="font-display text-[28px] font-medium leading-none tracking-[0.28em]">VERDA</Link>
          <nav className="flex items-center gap-7 text-sm">
            <Link href="/verda" className="hover:text-[var(--verda-sage)]">Shop</Link>
            <Link href="/verda/content" className="hover:text-[var(--verda-sage)]">Site content</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-20 border-t border-[var(--verda-stone)]/60">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-3 px-5 py-8 text-xs text-[var(--verda-muted)] sm:px-8">
          <span className="font-display text-lg tracking-[0.24em] text-[var(--verda-ink)]">VERDA</span>
          <span>Every image and word here was approved in Shelf Studio before it went live.</span>
        </div>
      </footer>
    </div>
  );
}
