import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ getAuthContext: mocks.context }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
import { POST } from "@/app/api/verwaltung/profiles/[id]/password/route";

const password = "Chosen-test-password-9";
const profile = { id: "profile-id", user_id: "auth-id", full_name: "Franziska", email: "franzi@example.com", family_party_id: "party-id", role: "user" };
const params = { params: Promise.resolve({ id: profile.id }) };
const request = (body: unknown = { password }) => new Request("http://localhost/api/verwaltung/profiles/profile-id/password", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
});

function adminClient(row: typeof profile | null = profile) {
  const getUserById = vi.fn().mockResolvedValue({ data: { user: { id: "auth-id", email_confirmed_at: "2026-11-08" } }, error: null });
  const updateUserById = vi.fn().mockResolvedValue({ data: { user: { id: "auth-id" } }, error: null });
  const createUser = vi.fn().mockResolvedValue({ data: { user: { id: "new-auth-id" } }, error: null });
  const listUsers = vi.fn().mockResolvedValue({ data: { users: [] }, error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: row }), update };
  const client = { from: vi.fn().mockReturnValue(query), auth: { admin: { getUserById, updateUserById, createUser, listUsers } } };
  mocks.admin.mockReturnValue(client);
  return { ...client.auth.admin, update };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.context.mockResolvedValue({ user: { id: "schlichter-id" }, profile: { role: "schlichter" } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("Schlichter sets a personally chosen start password", () => {
  it.each([
    [{ user: null, profile: null }, 401],
    [{ user: { id: "normal-id" }, profile: { role: "user" } }, 403],
    [{ user: { id: "unassigned-id" }, profile: null }, 403]
  ])("rejects unauthorized access before reading passwords or using the service client", async (context, status) => {
    mocks.context.mockResolvedValue(context);
    expect((await POST(request(), params)).status).toBe(status);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each([{}, null, { password: 12345678 }, { password: "short" }, { password: "x".repeat(73) }])("rejects invalid password input %j", async (body) => {
    expect((await POST(request(body), params)).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON without touching Auth", async () => {
    const malformed = new Request("http://localhost", { method: "POST", body: "{" });
    expect((await POST(malformed, params)).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it("uses the chosen password, confirms an invited account and never echoes the password", async () => {
    vi.stubEnv("DEFAULT_USER_PASSWORD", "obsolete-password");
    const admin = adminClient();
    admin.getUserById.mockResolvedValueOnce({ data: { user: { id: "auth-id", invited_at: "2026-11-01", email_confirmed_at: null } }, error: null });
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(admin.updateUserById).toHaveBeenCalledWith("auth-id", expect.objectContaining({ password, email_confirm: true }));
    expect(admin.update).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain(password);
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain(password);
  });

  it("creates missing Auth users and updates only the profile link", async () => {
    const admin = adminClient();
    admin.getUserById.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: profile.email, password, email_confirm: true }));
    expect(admin.update).toHaveBeenCalledWith({ user_id: "new-auth-id" });
  });

  it("reuses an existing Auth user found by email instead of creating a duplicate", async () => {
    const admin = adminClient();
    admin.getUserById.mockResolvedValueOnce({ data: { user: null }, error: null });
    admin.listUsers.mockResolvedValue({ data: { users: [{ id: "found-id", email: profile.email }] }, error: null });
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(admin.updateUserById).toHaveBeenCalledWith("found-id", expect.objectContaining({ password, email_confirm: true }));
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.update).toHaveBeenCalledWith({ user_id: "found-id" });
  });

  it("does not expose password or provider details when Auth rejects the update", async () => {
    const admin = adminClient();
    admin.updateUserById.mockResolvedValue({ data: null, error: { message: "private details" } });
    const response = await POST(request(), params);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Startpasswort konnte nicht gesetzt werden." });
  });
});
