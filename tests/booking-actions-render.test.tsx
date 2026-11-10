import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Booking, Profile } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/whatsapp-share-button", () => ({ WhatsAppShareButton: () => null }));
import { BookingActions } from "@/components/booking-actions";

const profile: Profile = { id: "profile", user_id: "actor", full_name: "Schlichter", email: "test@example.invalid", role: "schlichter", family_party_id: "party", created_at: "2026-01-01" };
const booking: Booking = {
  id: "booking", created_by: "owner", family_party_id: "other-party",
  start_date: "2026-06-13", end_date: "2026-06-20", is_priority: true,
  shared_stay_allowed: false, status: "klaerung", comment: null,
  notice_period_ends_at: null, confirmed_at: null, cancelled_at: null,
  created_at: "2026-01-01", updated_at: "2026-01-01",
};

describe("booking decisions", () => {
  it("lets moderators decide automatic clarification without an objection", () => {
    const html = renderToStaticMarkup(<BookingActions booking={booking} profile={profile} objectionCount={0} />);
    expect(html).toContain(">Bestätigen</button>");
    expect(html).toContain(">Ablehnen</button>");
  });

  it.each(["bestaetigt", "storniert", "abgelehnt"] as const)("does not offer decisions on %s bookings", (status) => {
    const html = renderToStaticMarkup(<BookingActions booking={{ ...booking, status }} profile={profile} objectionCount={1} />);
    expect(html).not.toContain(">Bestätigen</button>");
    expect(html).not.toContain(">Ablehnen</button>");
  });

  it("never offers decisions to normal users", () => {
    const html = renderToStaticMarkup(<BookingActions booking={booking} profile={{ ...profile, role: "user" }} objectionCount={1} />);
    expect(html).not.toContain(">Bestätigen</button>");
    expect(html).not.toContain(">Ablehnen</button>");
  });

  it("warns the owner about priority-day loss after the stay started", () => {
    const html = renderToStaticMarkup(<BookingActions booking={{ ...booking, created_by: "actor", status: "bestaetigt" }} profile={{ ...profile, role: "user" }} objectionCount={0} />);
    expect(html).toContain("hat bereits begonnen");
    expect(html).toContain("Jahreskontingent");
    expect(html).toContain(">Stornieren</button>");
  });
});
