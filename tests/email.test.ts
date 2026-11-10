import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getNotificationRecipients, sendEmail } from "@/lib/email";
import { buildBookingEmail, type BookingEmailType } from "@/lib/email-messages";
import { bookingEmailType, notifyBookingSave } from "@/lib/booking-notifications";
import type { Booking } from "@/lib/types";

const booking: Booking = {
  id: "booking", created_by: "peter", family_party_id: "party", start_date: "2027-06-01", end_date: "2027-06-08",
  is_priority: true, shared_stay_allowed: false, status: "angefragt", comment: null, confirmed_at: null,
  cancelled_at: null, notice_period_ends_at: null, created_at: "2026-11-10T00:00:00Z", updated_at: "2026-11-10T00:00:00Z",
  family_parties: { id: "party", name: "Peter", created_at: "2026-01-01" }
};
const saved = { booking, changed: true, new_request: true, forfeited_days: 0 };
const profiles = [
  { user_id: "philipp", email: "Actor@example.com", role: "schlichter" as const, family_party_id: "a", full_name: "Philipp" },
  { user_id: "peter", email: " Peter@example.com ", role: "user" as const, family_party_id: "party", full_name: "Peter" },
  { user_id: "duplicate", email: "peter@example.com", role: "user" as const, family_party_id: "party", full_name: "Other Peter" },
  { user_id: "unassigned", email: "not-approved@example.com", role: "user" as const, family_party_id: null, full_name: "Unassigned" },
  { user_id: null, email: "inactive@example.com", role: "user" as const, family_party_id: "party", full_name: "Inactive" },
];
const mail = { to: ["a@example.com", "b@example.com"], subject: "Test", text: "Test", html: "<p>Test</p>", eventKey: "booking:1:requested" };
const resend = vi.fn();

beforeEach(() => {
  vi.stubEnv("BOOKING_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "test-only-key");
  vi.stubEnv("EMAIL_FROM", "Lu Fraili <booking@example.com>");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lu-fraili.example.com");
  vi.stubGlobal("fetch", resend);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); resend.mockReset(); });

describe("Resend transport", () => {
  it("does not call Resend with the switch off", async () => {
    vi.stubEnv("BOOKING_EMAIL_ENABLED", "false");
    expect(await sendEmail(mail)).toEqual({ ok: true, skipped: true });
    expect(resend).not.toHaveBeenCalled();
  });
  it.each(["", "dummy"])("does not contact Resend with missing or dummy key %s", async (key) => {
    vi.stubEnv("RESEND_API_KEY", key);
    expect(await sendEmail(mail)).toEqual({ ok: false });
    expect(resend).not.toHaveBeenCalled();
  });
  it("batches private individual deliveries with a stable idempotency key", async () => {
    resend.mockImplementation(async () => Response.json({ data: [{ id: "1" }, { id: "2" }] }));
    expect(await sendEmail(mail)).toEqual({ ok: true, count: 2 });
    await sendEmail(mail);
    const [url, request] = resend.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails/batch");
    expect(JSON.parse(request.body).map((message: { to: string[] }) => message.to)).toEqual([["a@example.com"], ["b@example.com"]]);
    expect(request.headers["Idempotency-Key"]).toBe(resend.mock.calls[1][1].headers["Idempotency-Key"]);
  });
  it("reports limits and network failures without throwing or retrying", async () => {
    resend.mockResolvedValueOnce(new Response(null, { status: 429 })).mockRejectedValueOnce(new Error("offline"));
    expect(await sendEmail(mail)).toEqual({ ok: false });
    expect(await sendEmail(mail)).toEqual({ ok: false });
    expect(resend).toHaveBeenCalledTimes(2);
  });
  it("does not report a partial batch as successful", async () => {
    resend.mockResolvedValueOnce(Response.json({ data: [{ id: "1" }] }));
    expect(await sendEmail(mail)).toEqual({ ok: false });
  });
});

describe("booking notifications", () => {
  it("filters approved profiles and deduplicates addresses without including the actor", () => {
    expect(getNotificationRecipients(profiles, "philipp")).toEqual(["peter@example.com"]);
    expect(getNotificationRecipients(profiles, null, (profile) => profile.role === "schlichter")).toEqual(["actor@example.com"]);
  });
  it("gives each event an identifiable subject with party and date range", () => {
    const types: BookingEmailType[] = ["requested", "requested_again", "changed", "confirmed", "auto_confirmed", "rejected", "cancelled", "objection", "clarification", "auto_clarification", "displacement", "forfeited", "deleted", "commented"];
    const subjects = types.map((type) => buildBookingEmail({ type, booking, actorName: "Philipp", forfeitedDays: 2, affectedParties: ["Teresa"] }).subject);
    expect(new Set(subjects).size).toBe(types.length);
    subjects.forEach((subject, i) => {
      expect(subject).toContain(types[i].startsWith("auto_") ? "App" : "Philipp");
      expect(subject).toContain("Peter");
      expect(subject).toContain("01.06.2027 bis 08.06.2027");
    });
    expect(subjects).toContain("Lu Fraili: Philipp widerspricht der Buchung | Peter | 01.06.2027 bis 08.06.2027");
  });
  it("escapes objection reasons and uses an authenticated booking link", () => {
    const message = buildBookingEmail({ type: "objection", booking, actorName: "Philipp\nBcc: injected", reason: "<img src=x>" });
    expect(message.subject).not.toContain("\n");
    expect(message.html).toContain("&lt;img src=x&gt;");
    expect(message.html).toContain("https://lu-fraili.example.com/buchung/booking");
    expect(message.text).toContain("Klärung erforderlich");
  });
  it("distinguishes a new request, re-request, change and automatic clarification", () => {
    expect(bookingEmailType(saved)).toBe("requested");
    expect(bookingEmailType(saved, { previous: booking })).toBe("requested_again");
    expect(bookingEmailType({ ...saved, new_request: false }, { previous: booking })).toBe("changed");
    const clarification = { ...saved, booking: { ...booking, status: "klaerung" as const } };
    expect(bookingEmailType(clarification, { autoConfirmed: true })).toBe("auto_clarification");
    expect(bookingEmailType(clarification, {}, true)).toBe("displacement");
  });
  it("does not query or send for no-op changes", async () => {
    const from = vi.fn();
    await notifyBookingSave({ from } as unknown as SupabaseClient, { ...saved, changed: false }, "philipp");
    expect(from).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });
  it("writes an honest failure to history without failing a saved booking", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: (table: string) => table === "profiles" ? { select: async () => ({ data: profiles, error: null }) } : { insert } } as unknown as SupabaseClient;
    resend.mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(notifyBookingSave(client, saved, "philipp")).resolves.toBeUndefined();
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: "email_requested_failed", booking_id: booking.id }));
  });
  it("uses the matching displacement event to name the affected party", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const eventQuery = { eq: vi.fn().mockReturnThis(), like: vi.fn().mockResolvedValue({ data: [{ bookings: { family_parties: { name: "Teresa" } } }], error: null }) };
    const client = { from: (table: string) => table === "profiles" ? { select: async () => ({ data: profiles, error: null }) } : { select: () => eventQuery, insert } } as unknown as SupabaseClient;
    resend.mockResolvedValueOnce(Response.json({ data: [{ id: "1" }] }));
    await notifyBookingSave(client, { ...saved, booking: { ...booking, status: "klaerung" } }, "philipp");
    expect(eventQuery.eq).toHaveBeenCalledWith("created_at", booking.updated_at);
    expect(JSON.parse(resend.mock.calls[0][1].body)[0].subject).toContain("Philipp: P-Zeit betrifft normale Buchung | Peter / Teresa");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: "email_displacement" }));
  });
});
