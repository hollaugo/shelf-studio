import { describe, expect, it } from "vitest";
import { checkLogin, createSession, safeNext, SESSION_SECONDS, verifySession } from "./session";

describe("sessions", () => {
  it("accepts its own token until it expires", async () => {
    const token = await createSession("secret", 1000);
    expect(await verifySession(token, "secret", 1000)).toBe(true);
    expect(await verifySession(token, "secret", 1000 + SESSION_SECONDS * 1000)).toBe(false);
  });

  it("rejects another secret, a changed expiry and junk", async () => {
    const token = await createSession("secret", 1000);
    const [, signature] = token.split(".");
    expect(await verifySession(token, "other", 1000)).toBe(false);
    expect(await verifySession(`99999999999999.${signature}`, "secret", 1000)).toBe(false);
    for (const junk of [undefined, "", "abc", "1.2.3", "99999999999999.zz", "99999999999999."]) expect(await verifySession(junk, "secret", 1000)).toBe(false);
  });

  it("fails closed with no secret", async () => {
    expect(await verifySession(await createSession("secret"), undefined)).toBe(false);
  });
});

describe("checkLogin", () => {
  const env = { username: "demo", password: "right", secret: "secret" };

  it("needs both the username and the password", async () => {
    expect(await checkLogin("demo", "right", env)).toBe(true);
    expect(await checkLogin("demo", "wrong", env)).toBe(false);
    expect(await checkLogin("other", "right", env)).toBe(false);
  });

  it("lets nobody in when it isn't configured", async () => {
    expect(await checkLogin("demo", "right", { ...env, password: undefined })).toBe(false);
    expect(await checkLogin("", "", { username: "", password: "", secret: "" })).toBe(false);
  });
});

describe("safeNext", () => {
  it("keeps paths on this site and nothing else", () => {
    expect(safeNext("/review?x=1")).toBe("/review?x=1");
    for (const bad of ["//evil.test", "/\\evil.test", "/\t/evil.test", "/\n/evil.test", "https://evil.test", "", null, undefined]) expect(safeNext(bad)).toBe("/products");
  });
});
