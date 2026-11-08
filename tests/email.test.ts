import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
import { getNotificationRecipients, sendEmail } from "@/lib/email";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); send.mockReset(); });

describe("email delivery", () => {
  const email = { to: ["peter@example.com"], subject: "Test", html: "<p>Test</p>" };

  it.each(["", "dummy"])("skips sending when key is %s", async (key) => {
    vi.stubEnv("RESEND_API_KEY", key);
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await sendEmail(email)).toEqual({ ok: true, skipped: true });
    expect(send).not.toHaveBeenCalled();
  });

  it("recognizes an API error returned without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockResolvedValue({ data: null, error: { name: "validation_error" } });
    expect((await sendEmail(email)).ok).toBe(false);
  });

  it("returns a safe failure when the connection throws", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("Connection failed"));
    expect((await sendEmail(email)).ok).toBe(false);
  });

  it("deduplicates real recipients and excludes synthetic family profiles", async () => {
    const supabase = { from: () => ({ select: async () => ({ data: [
      { email: "peter@example.com", role: "user" },
      { email: "peter@example.com", role: "user" },
      { email: "philipp@familie.lu-fraili.local", role: "schlichter" },
      { email: "inactive@example.com", is_active: false },
      { email: "", role: "user" }
    ], error: null }) }) };
    expect(await getNotificationRecipients(supabase)).toEqual(["peter@example.com"]);
  });

  it("does not treat a recipient query error as an empty mailing list", async () => {
    const supabase = { from: () => ({ select: async () => ({ data: null, error: { code: "failed" } }) }) };
    await expect(getNotificationRecipients(supabase)).rejects.toThrow("Empfänger");
  });
});
