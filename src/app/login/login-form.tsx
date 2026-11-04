"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { login } from "./actions";

const FIELD = "w-full rounded-[10px] border border-line-strong bg-control px-3 py-2.5 text-fg";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        Username
        <input name="username" autoComplete="username" required autoFocus className={FIELD} />
      </label>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">
        Password
        <input name="password" type="password" autoComplete="current-password" required className={FIELD} />
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{state.error}</p>}
      <Button type="submit" variant="primary" pending={pending}>Sign in</Button>
    </form>
  );
}
