"use client";

import type { Asset, Role } from "@/lib/domain/types";

/** Publishing arrives with the website. */
export function PublishPanel(_: { asset: Asset; publications: unknown[]; role: Role; onDone: () => void }) {
  return null;
}
