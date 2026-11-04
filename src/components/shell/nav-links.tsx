"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/products", label: "Products" },
  { href: "/review", label: "Review board" },
  { href: "/lab", label: "Evals" },
  { href: "/metrics", label: "Metrics" },
  { href: "/settings", label: "Settings" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-6">
      {LINKS.map((l) => {
        const on = path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={on ? "page" : undefined} className={on ? "font-semibold text-fg" : "text-muted hover:text-fg"}>
            {l.label}
          </Link>
        );
      })}
      <Link href="/verda" className="text-muted hover:text-fg">Website</Link>
    </nav>
  );
}
