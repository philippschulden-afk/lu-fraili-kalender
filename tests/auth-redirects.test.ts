import { describe, expect, it } from "vitest";
import {
  buildPasswordSetupCallbackRedirectUrl,
  buildPasswordSetupRedirectUrl,
  getSafeNextPath,
  passwordSetupPath
} from "@/lib/auth-redirects";

describe("auth redirects", () => {
  it("callback preserves a safe password setup next path", () => {
    expect(getSafeNextPath(passwordSetupPath)).toBe("/auth/passwort-setzen");
  });

  it("callback rejects unsafe next paths", () => {
    expect(getSafeNextPath("https://example.com/auth/passwort-setzen")).toBeNull();
    expect(getSafeNextPath("//example.com/auth/passwort-setzen")).toBeNull();
    expect(getSafeNextPath("/\\example.com")).toBeNull();
    expect(getSafeNextPath("/\n/example.com")).toBeNull();
    expect(getSafeNextPath("/\t/example.com")).toBeNull();
  });

  it("retains local query parameters but normalizes path traversal", () => {
    expect(getSafeNextPath("/dashboard?year=2027")).toBe("/dashboard?year=2027");
    expect(getSafeNextPath("/auth/../dashboard")).toBe("/dashboard");
  });

  it("password reset and invite links go directly to password setup", () => {
    expect(buildPasswordSetupRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/passwort-setzen"
    );
  });

  it("callback links can still preserve password setup as next target", () => {
    expect(buildPasswordSetupCallbackRedirectUrl("http://localhost:3000")).toBe(
      "http://localhost:3000/auth/callback?next=/auth/passwort-setzen"
    );
  });
});
