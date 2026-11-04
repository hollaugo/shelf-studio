"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice } from "@/components/ui";

export function BaselineForm({ initial }: { initial: number | null }) {
  const router = useRouter();
  const [days, setDays] = useState(initial == null ? "" : String(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      setError(null);
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "baseline_turnaround_days", value: Number(days) }) });
      if (!res.ok) return setError((await res.json()).error);
      router.refresh();
    });
  };
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-3 rounded-[14px] border border-line bg-raised px-5 py-4">
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        Previous turnaround, in days per PDP
        <input type="number" min="0.1" max="365" step="0.1" required value={days} onChange={(e) => setDays(e.target.value)} className="w-40 rounded-[10px] border border-line-strong bg-well px-3 py-2 text-fg" />
      </label>
      <Button type="submit" pending={pending}>Save</Button>
      {error && <div className="w-full"><Notice title="Couldn't save this">{error}</Notice></div>}
    </form>
  );
}
