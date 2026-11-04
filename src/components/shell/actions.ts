"use server";

import { cookies } from "next/headers";

export async function setRole(formData: FormData) {
  const role = String(formData.get("role"));
  if (!["producer", "reviewer", "owner"].includes(role)) return;
  (await cookies()).set("role", role, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}
