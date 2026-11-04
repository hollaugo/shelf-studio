import { Suspense } from "react";
import Link from "next/link";
import { getRole } from "@/lib/role";
import { db } from "@/lib/supabase/server";
import { NavLinks } from "./nav-links";
import { RoleSwitcher } from "./role-switcher";
import { NotificationBell } from "./notification-bell";

async function HeaderStatus() {
  const [role, used] = await Promise.all([
    getRole(),
    db().from("generations").select("credits").then(({ data }) => ((data ?? []) as { credits: number }[]).reduce((sum, g) => sum + g.credits, 0)),
  ]);
  return (
    <div className="flex items-center gap-4 text-[13px] text-muted">
      <span>Credits used <b className="text-fg">{used.toLocaleString()}</b></span>
      <NotificationBell key={role} />
      <RoleSwitcher role={role} />
    </div>
  );
}

export function AppHeader() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line-header px-8 py-4">
      <div className="flex flex-wrap items-center gap-8">
        <Link href="/products" className="text-base font-bold tracking-[-0.01em]">
          Shelf Studio <span className="font-medium text-muted">· VERDA</span>
        </Link>
        <Suspense fallback={<div className="h-5 w-72" />}><NavLinks /></Suspense>
      </div>
      <Suspense fallback={<div className="h-8" />}>
        <HeaderStatus />
      </Suspense>
    </header>
  );
}
