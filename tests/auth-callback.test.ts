import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession: mocks.exchange } }) }));
import { GET } from "@/app/auth/callback/route";
beforeEach(() => { vi.resetAllMocks(); mocks.exchange.mockResolvedValue({ error: null }); });
describe("auth callback", () => {
  it("keeps the password setup target after code exchange", async () => {
    const response = await GET(new Request("https://house.example/auth/callback?code=test&next=/auth/passwort-setzen"));
    expect(response.headers.get("location")).toBe("https://house.example/auth/passwort-setzen");
    expect(mocks.exchange).toHaveBeenCalledWith("test");
  });
  it("rejects the previously exploitable external target", async () => {
    const response = await GET(new Request("https://house.example/auth/callback?next=%2F%5Cexample.invalid"));
    expect(response.headers.get("location")).toBe("https://house.example/dashboard");
  });
  it("shows invalid-link handling when code exchange fails", async () => {
    mocks.exchange.mockResolvedValue({ error: { message: "expired" } });
    const response = await GET(new Request("https://house.example/auth/callback?code=old"));
    expect(response.headers.get("location")).toBe("https://house.example/auth/passwort-setzen?error=link");
  });
});
