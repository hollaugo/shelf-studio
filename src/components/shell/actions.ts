"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/auth/session";

export async function setRole(formData: FormData) {
  const role = String(formData.get("role"));
  if (!["producer", "reviewer", "owner"].includes(role)) return;
  (await cookies()).set("role", role, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
