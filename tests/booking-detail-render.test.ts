import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/components/page-shell", () => ({ PageShell: ({ children }: { children: ReactNode }) => children, requireProfile: mocks.context }));
vi.mock("@/components/booking-actions", () => ({ BookingActions: () => null }));
import BookingDetailPage from "@/app/buchung/[id]/page";

describe("booking detail overlaps", () => {
  it("excludes same-day turnover from the overlap query", async () => {
    const booking = { id: "booking", start_date: "2026-06-13", end_date: "2026-06-20", status: "bestaetigt", is_priority: true, family_parties: { name: "Peter" } };
    const query = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), neq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(), gt: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: booking, error: null }),
      returns: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.context.mockResolvedValue({ supabase: { from: () => query }, profile: { user_id: "actor", role: "user" } });
    const html = renderToStaticMarkup(await BookingDetailPage({ params: Promise.resolve({ id: "booking" }) }));
    expect(query.lt).toHaveBeenCalledWith("start_date", "2026-06-20");
    expect(query.gt).toHaveBeenCalledWith("end_date", "2026-06-13");
    expect(html).toContain("Keine Überschneidungen.");
  });
});
