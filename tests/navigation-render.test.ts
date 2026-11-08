import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/supabase/browser", () => ({ createSupabaseBrowserClient: () => ({ auth: {} }) }));
import { AuthButtons } from "@/components/auth-buttons";
import { Nav } from "@/components/nav";
import type { Profile } from "@/lib/types";

describe("simple login and role-aware navigation", () => {
  it("shows password login and recovery without any Google action", () => {
    const html = renderToStaticMarkup(createElement(AuthButtons));
    expect(html).toContain("E-Mail-Adresse");
    expect(html).toContain("Passwort vergessen?");
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).not.toContain("Google");
  });
  it.each(["user", "schlichter"] as const)("shows management only for Schlichter, role %s", (role) => {
    const html = renderToStaticMarkup(createElement(Nav, { profile: { role } as Profile }));
    expect(html.includes("Verwaltung")).toBe(role === "schlichter");
    expect(html).toContain("Jahresplanung");
  });
});
