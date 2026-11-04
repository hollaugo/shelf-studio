"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Advances the pipeline and refreshes server data while work is in flight. */
export function LiveRefresh({ interval = 2500 }: { interval?: number }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const loop = async () => {
      while (!stop) {
        await fetch("/api/pipeline/tick", { method: "POST" }).catch(() => undefined);
        if (stop) return;
        router.refresh();
        await new Promise((r) => setTimeout(r, interval));
      }
    };
    loop();
    return () => { stop = true; };
  }, [router, interval]);
  return null;
}
