"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/lib/domain/types";
import { setRole } from "./actions";

export function RoleSwitcher({ role }: { role: Role }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Viewing as</span>
      <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-full bg-accent font-semibold uppercase text-white">{role[0]}</span>
      <select
        value={role}
        disabled={pending}
        onChange={(e) => {
          const data = new FormData();
          data.set("role", e.target.value);
          start(async () => {
            await setRole(data);
            router.refresh();
          });
        }}
        className="rounded-lg border border-line-strong bg-raised px-2 py-1.5 text-[13px] text-fg"
      >
        <option value="producer">Producer</option>
        <option value="reviewer">Reviewer</option>
        <option value="owner">Owner</option>
      </select>
    </label>
  );
}
