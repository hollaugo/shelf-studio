import { NextResponse, type NextRequest } from "next/server";
import { safeNext, SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/** The sample website only shows published assets, so shoppers don't need to sign in. Its content log is for staff. */
const isPublic = (path: string, method: string) =>
  ((path === "/verda" || path.startsWith("/verda/")) && !/^\/verda\/content(\/|$)/.test(path))
  // Cron calls this with its own secret, which the route checks.
  || (path === "/api/pipeline/tick" && method === "GET");

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.AUTH_SECRET);
  if (pathname === "/login") return signedIn ? NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url)) : NextResponse.next();
  if (signedIn || isPublic(pathname, req.method)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  const login = new URL("/login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
