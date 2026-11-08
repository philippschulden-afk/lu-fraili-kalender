import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestPasswordReset } from "@/lib/password-reset";
import { initializePasswordSession } from "@/lib/password-session";

describe("password recovery", () => {
  it("uses the correct reset URL and reports accepted requests", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
    expect(await requestPasswordReset({ resetPasswordForEmail }, " family@example.com ", "https://house.example/")).toBe(true);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("family@example.com", { redirectTo: "https://house.example/auth/passwort-setzen" });
  });
  it.each(["rate_limit", "smtp_error"])("does not report success on %s", async (code) => {
    expect(await requestPasswordReset({ resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { code } }) }, "family@example.com", "https://house.example")).toBe(false);
  });
  it("handles network failures safely", async () => {
    expect(await requestPasswordReset({ resetPasswordForEmail: vi.fn().mockRejectedValue(new Error("network")) }, "family@example.com", "https://house.example")).toBe(false);
  });

  function client() {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    const setSession = vi.fn().mockResolvedValue({ error: null });
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });
    const auth = { getSession, setSession, exchangeCodeForSession } as unknown as SupabaseClient["auth"];
    return { auth, getSession, setSession, exchangeCodeForSession, clear: vi.fn() };
  }
  it("does not redeem a code twice after SDK initialization", async () => {
    const c = client(); c.getSession.mockResolvedValue({ data: { session: { user: { id: "test" } } }, error: null });
    expect(await initializePasswordSession(c.auth, new URL("https://house.example/auth/passwort-setzen?code=secret-code"), c.clear)).toBe(true);
    expect(c.exchangeCodeForSession).not.toHaveBeenCalled(); expect(c.clear).toHaveBeenCalledOnce();
  });
  it("supports direct PKCE code fallback", async () => {
    const c = client(); c.getSession.mockResolvedValueOnce({ data: { session: null }, error: null }).mockResolvedValueOnce({ data: { session: {} }, error: null });
    expect(await initializePasswordSession(c.auth, new URL("https://house.example/auth/passwort-setzen?code=test-code"), c.clear)).toBe(true);
    expect(c.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
  });
  it("supports hash tokens and removes them from the address bar", async () => {
    const c = client(); c.getSession.mockResolvedValueOnce({ data: { session: null }, error: null }).mockResolvedValueOnce({ data: { session: {} }, error: null });
    expect(await initializePasswordSession(c.auth, new URL("https://house.example/auth/passwort-setzen#access_token=test-access&refresh_token=test-refresh&type=recovery"), c.clear)).toBe(true);
    expect(c.setSession).toHaveBeenCalledWith({ access_token: "test-access", refresh_token: "test-refresh" });
    expect(c.clear).toHaveBeenCalledOnce();
  });
  it("rejects expired codes without leaving sensitive URL data", async () => {
    const c = client(); c.exchangeCodeForSession.mockResolvedValue({ error: { message: "expired" } });
    expect(await initializePasswordSession(c.auth, new URL("https://house.example/auth/passwort-setzen?code=old"), c.clear)).toBe(false);
    expect(c.clear).toHaveBeenCalledOnce();
  });
  it("rejects explicit error links even if a session already exists", async () => {
    const c = client(); c.getSession.mockResolvedValue({ data: { session: {} }, error: null });
    expect(await initializePasswordSession(c.auth, new URL("https://house.example/auth/passwort-setzen?error=link"), c.clear)).toBe(false);
  });
  it("has a rejecting, settled failure path on network errors", async () => {
    const c = client(); c.getSession.mockRejectedValue(new Error("network"));
    await expect(initializePasswordSession(c.auth, new URL("https://house.example/auth/passwort-setzen#access_token=x"), c.clear)).rejects.toThrow("network");
    expect(c.clear).toHaveBeenCalledOnce();
  });
  it("does not create a session without valid credentials", async () => {
    const c = client();
    expect(await initializePasswordSession(c.auth, new URL("https://house.example/auth/passwort-setzen"), c.clear)).toBe(false);
    expect(c.setSession).not.toHaveBeenCalled();
  });
});
