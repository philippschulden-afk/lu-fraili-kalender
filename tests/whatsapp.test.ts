import { describe, expect, it } from "vitest";
import { buildWhatsAppMessage, buildWhatsAppShareUrl, type WhatsAppBookingShareInput } from "@/lib/whatsapp";

const booking: WhatsAppBookingShareInput = {
  type: "new_request", bookingId: "private-booking-id", familyPartyName: "Peter",
  startDate: "2027-06-13", endDate: "2027-06-20", isPriority: true, status: "angefragt"
};

describe("manual WhatsApp sharing", () => {
  it("builds a share link containing the prepared German request", () => {
    const url = buildWhatsAppShareUrl(booking);
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    const message = new URL(url).searchParams.get("text");
    expect(message).toBe(buildWhatsAppMessage(booking));
    expect(message).toContain("Neue Buchungsanfrage Lu Fraili");
    expect(message).toContain("Peter");
    expect(message).toContain("P-Zeit: Ja");
    expect(message).toContain("in 3 Tagen automatisch bestätigt");
  });

  it.each(["new_request", "confirmed", "cancelled", "generic"] as const)("does not include private links in %s messages", (type) => {
    const message = buildWhatsAppMessage({ ...booking, type });
    expect(message).not.toMatch(/https?:\/\//);
    expect(message).not.toContain(booking.bookingId);
  });

  it("retains the warning for an affected normal booking", () => {
    expect(buildWhatsAppMessage({ ...booking, priorityDisplacementPartyName: "Teresa" }))
      .toContain("normalen Buchung von Teresa. Bitte stimmt euch dazu ab.");
  });

  it("never promises automatic confirmation for a clarification case", () => {
    const message = buildWhatsAppMessage({ ...booking, status: "klaerung", priorityDisplacementPartyName: "Teresa" });
    expect(message).toContain("Klärung erforderlich");
    expect(message).toContain("keine automatische Bestätigung");
    expect(message).not.toContain("in 3 Tagen automatisch bestätigt");
  });
});
