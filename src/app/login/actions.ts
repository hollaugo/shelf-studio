"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkLogin, createSession, safeNext, SESSION_COOKIE, SESSION_SECONDS } from "@/lib/auth/session";

export async function login(_state: { error: string } | null, form: FormData) {
  const env = { username: process.env.DEMO_USERNAME, password: process.env.DEMO_PASSWORD, secret: process.env.AUTH_SECRET };
  if (!env.username || !env.password || !env.secret) return { error: "Sign-in isn't set up on this server." };
  if (!(await checkLogin(String(form.get("username") ?? ""), String(form.get("password") ?? ""), env))) {
    await new Promise((resolve) => setTimeout(resolve, 500)); // Slows down guessing.
    return { error: "That username and password don't match." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSession(env.secret), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  redirect(safeNext(form.get("next")));
}
