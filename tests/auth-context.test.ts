import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ server: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.server }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/family-login", () => ({ isFamilyLoginModeEnabled: () => false }));
import { getAuthContext } from "@/lib/auth-context";

function configure(profile: unknown, error: unknown = null, loggedIn = true) {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: profile, error }) };
  const from = vi.fn().mockReturnValue(query);
  mocks.server.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: loggedIn ? { id: "user-id", email: "member@example.com" } : null } }) }, from });
  return from;
}
beforeEach(() => vi.resetAllMocks());
describe("family access context", () => {
  it("does not query profiles without verified login", async () => {
    const from = configure(null, null, false);
    expect((await getAuthContext()).user).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it("does not authorize an unassigned profile", async () => {
    configure({ role: "user", family_party_id: null });
    expect((await getAuthContext()).profile).toBeNull();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it.each([{ role: "user", family_party_id: "party" }, { role: "schlichter", family_party_id: null }])("allows assigned members and Schlichter", async (profile) => {
    configure(profile);
    expect((await getAuthContext()).profile).toEqual(profile);
  });
  it("does not treat database errors as an unassigned account", async () => {
    configure(null, { code: "XX000" });
    await expect(getAuthContext()).rejects.toThrow("Zugang konnte nicht geprüft");
  });
});
