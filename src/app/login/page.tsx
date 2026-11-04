import { Suspense } from "react";
import { safeNext } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <LoginForm next={safeNext((await searchParams).next)} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-surface p-6">
        <h1 className="text-xl font-bold tracking-[-0.01em]">Shelf Studio <span className="font-medium text-muted">· VERDA</span></h1>
        <p className="mb-5 mt-1 text-muted">Sign in with the demo account.</p>
        <Suspense fallback={<div className="h-52" />}><Form searchParams={searchParams} /></Suspense>
      </div>
    </main>
  );
}
