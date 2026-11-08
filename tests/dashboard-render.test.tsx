import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: ReactNode }) => children,
  requireProfile: mocks.context,
}));

import DashboardPage from "@/app/dashboard/page";

beforeEach(() => vi.resetAllMocks());

describe("dashboard welcome", () => {
  it("shows the house, personal greeting and planning actions with empty data", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      returns: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.context.mockResolvedValue({
      supabase: { from: () => query },
      profile: { full_name: "Philipp", family_party_id: "party" },
    });

    const html = renderToStaticMarkup(await DashboardPage());

    expect(html).toContain("lu-fraili-haus.webp");
    expect(html).toContain("Unser Ferienhaus in Lu Fraili");
    expect(html).toContain("Bene bènnidos, Philipp");
    expect(html).toContain("Willkommen in Lu Fraili.");
    expect(html).toContain("Zur Jahresplanung");
    expect(html).toContain("Neue Buchung anfragen");
    expect(html).toContain("Meine verbleibenden P-Tage");
  });
});
