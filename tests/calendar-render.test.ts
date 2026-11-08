import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/components/page-shell", () => ({ PageShell: ({ children }: { children: ReactNode }) => children, requireProfile: mocks.context }));
import CalendarPage from "@/app/kalender/page";

beforeEach(() => vi.resetAllMocks());
describe("month calendar rendering", () => {
  it("loads the complete displayed grid and renders an adjacent-month booking", async () => {
    const query = {
      select: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data: [{ id: "booking", start_date: "2026-08-31", end_date: "2026-08-31", status: "bestaetigt", is_priority: true, family_parties: { name: "Randtag Familie" } }], error: null })
    };
    mocks.context.mockResolvedValue({ supabase: { from: () => query }, profile: { family_party_id: "party" } });
    const html = renderToStaticMarkup(await CalendarPage({ searchParams: Promise.resolve({ month: "2026-09", day: "2026-08-31" }) }));
    expect(query.lte).toHaveBeenCalledWith("start_date", "2026-10-04");
    expect(query.gte).toHaveBeenCalledWith("end_date", "2026-08-31");
    expect(html).toContain("September 2026");
    expect(html).toContain("Vorheriger Monat");
    expect(html).toContain("Nächster Monat");
    expect(html).toContain("Randtag Familie");
    expect(html).toContain("Buchungen am 31.08.2026");
  });

  it("does not render a failed read as a free month", async () => {
    const query = { select: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), returns: vi.fn().mockResolvedValue({ data: null, error: { code: "failed" } }) };
    mocks.context.mockResolvedValue({ supabase: { from: () => query }, profile: {} });
    await expect(CalendarPage({ searchParams: Promise.resolve({ month: "2026-09" }) })).rejects.toThrow("Kalender konnte nicht geladen");
  });
});
