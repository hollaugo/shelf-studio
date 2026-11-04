/**
 * The demo sign-in. A session is an expiry time signed with AUTH_SECRET, so there's nothing to store, and rotating
 * the secret signs everyone out. It uses Web Crypto so that the proxy can verify it too.
 */
export const SESSION_COOKIE = "shelf_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

const key = (secret: string) => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => (/^([0-9a-f]{2})+$/.test(hex) ? Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16)) : null);

export async function createSession(secret: string, now = Date.now()) {
  const expires = String(now + SESSION_SECONDS * 1000);
  return `${expires}.${toHex(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(expires)))}`;
}

export async function verifySession(token: string | undefined, secret: string | undefined, now = Date.now()) {
  if (!token || !secret) return false;
  const [expires, signature, ...rest] = token.split(".");
  const bytes = signature ? fromHex(signature) : null;
  if (!bytes || rest.length || !/^\d+$/.test(expires) || Number(expires) <= now) return false;
  return crypto.subtle.verify("HMAC", await key(secret), bytes, encoder.encode(expires));
}

/** Compares signatures rather than the text itself, so the time taken says nothing about how close a guess was. */
async function same(a: string, b: string, signing: CryptoKey) {
  const expected = await crypto.subtle.sign("HMAC", signing, encoder.encode(b));
  return crypto.subtle.verify("HMAC", signing, expected, encoder.encode(a));
}

export async function checkLogin(username: string, password: string, env: { username?: string; password?: string; secret?: string }) {
  if (!env.username || !env.password || !env.secret) return false;
  const signing = await key(env.secret);
  const [user, pass] = await Promise.all([same(username, env.username, signing), same(password, env.password, signing)]);
  return user && pass;
}

/** Only ever a path on this site, so a crafted link can't send someone elsewhere after they sign in. */
export function safeNext(next: unknown) {
  // Browsers strip tabs and newlines from URLs, so "/\t/evil.test" would otherwise become "//evil.test".
  if (typeof next !== "string" || !next.startsWith("/") || /[\x00-\x1f\\]/.test(next)) return "/products";
  const base = "http://local.invalid";
  const url = URL.canParse(next, base) ? new URL(next, base) : null;
  // Normalizing can create a new "//": "/.//evil.test" resolves to the path "//evil.test".
  return url?.origin === base && !url.pathname.startsWith("//") ? `${url.pathname}${url.search}${url.hash}` : "/products";
}
