"use client";

import { Button } from "@/components/ui";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-24 text-center">
      <h1 className="text-xl font-semibold">This page didn&apos;t load</h1>
      <p className="text-muted">Anything already generating is still running. Try again, or come back in a moment.</p>
      <div className="mt-2"><Button variant="primary" onClick={reset}>Try again</Button></div>
    </div>
  );
}
