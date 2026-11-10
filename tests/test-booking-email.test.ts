import { afterEach, expect, it, vi } from "vitest";
import { sendTestBookingEmail } from "@/app/verwaltung/test-booking-email";
import { sendEmail } from "@/lib/email";
import { getSchlichterContext } from "@/lib/schlichter";

vi.mock("@/lib/schlichter", () => ({ getSchlichterContext: vi.fn() }));
vi.mock("@/lib/email", async (original) => ({ ...await original<typeof import("@/lib/email")>(), sendEmail: vi.fn() }));

const context = vi.mocked(getSchlichterContext);
const transport = vi.mocked(sendEmail);
const profile = {
  id: "profile", user_id: "account", full_name: "Philipp", email: "philipp@example.com",
  family_party_id: null, role: "schlichter" as const, created_at: "2026-01-01"
};
const allowed = { supabase: {} as Awaited<ReturnType<typeof getSchlichterContext>>["supabase"], user: { id: "account", email: "auth@example.com" }, profile, error: null, status: 200 };

afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

it("sends a labelled booking sample only to the authenticated profile address", async () => {
  vi.stubEnv("BOOKING_EMAIL_ENABLED", "true");
  context.mockResolvedValue(allowed);
  transport.mockResolvedValue({ ok: true, count: 1 });
  expect((await sendTestBookingEmail()).ok).toBe(true);
  expect(transport).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    to: ["philipp@example.com"], subject: expect.stringMatching(/^Testmail: Lu Fraili: Philipp fragt an/),
    text: expect.stringContaining("Es wurde keine Buchung angelegt")
  }));
});

it("does not send when authorization is denied or sending is disabled", async () => {
  vi.stubEnv("BOOKING_EMAIL_ENABLED", "true");
  context.mockResolvedValueOnce({ ...allowed, error: "Nicht erlaubt", status: 403 });
  expect((await sendTestBookingEmail()).ok).toBe(false);
  vi.stubEnv("BOOKING_EMAIL_ENABLED", "false");
  context.mockResolvedValueOnce(allowed);
  expect((await sendTestBookingEmail()).ok).toBe(false);
  expect(transport).not.toHaveBeenCalled();
});
