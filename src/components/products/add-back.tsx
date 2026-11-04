"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";

/** Uploads the back of pack, then re-reads the product so its text can inform copy too. */
export function AddBack({ productId, replace }: { productId: string; replace?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const upload = (file: File) => start(async () => {
    setError(null);
    setStatus("Uploading");
    const data = new FormData();
    data.set("file", file);
    const res = await fetch(`/api/products/${productId}/back`, { method: "POST", body: data });
    if (!res.ok) {
      setStatus(null);
      return setError((await res.json()).error);
    }
    setStatus("Reading the back of the pack");
    await fetch(`/api/products/${productId}/analyze`, { method: "POST" }).then((r) => r.text()).catch(() => undefined);
    setStatus(null);
    router.refresh();
  });
  return (
    <div>
      <Button pending={pending} onClick={() => input.current?.click()}>{status ?? (replace ? "Replace back image" : "Add back image")}</Button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Back of pack image" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      {error && <div className="mt-2"><Notice title="That didn't upload">{error}</Notice></div>}
    </div>
  );
}
