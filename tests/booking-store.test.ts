import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingSaveError, saveBooking } from "@/lib/booking-store";

describe("transactional booking persistence", () => {
  it("passes the actor and revision to the atomic save and propagates failures", async () => {
    const error = { code: "P0001", message: "Die Buchung wurde inzwischen geändert. Bitte lade die Seite erneut." };
    const rpc = vi.fn().mockResolvedValue({ data: null, error });
    const supabase = { rpc } as unknown as SupabaseClient;
    const result = await saveBooking(supabase, {
      bookingId: "booking", actorId: "actor", changes: { end_date: "2026-12-14" }, expectedUpdatedAt: "2026-11-08T12:00:00Z"
    });
    expect(rpc).toHaveBeenCalledWith("save_booking", expect.objectContaining({
      p_actor_id: "actor", p_expected_updated_at: "2026-11-08T12:00:00Z", p_management: false
    }));
    expect(result).toEqual({ result: null, error });
    expect(bookingSaveError(error).status).toBe(409);
  });

  it("maps a confirmed priority overlap to HTTP 409", () => {
    expect(bookingSaveError({ code: "P0001", message: "Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt." }).status).toBe(409);
  });

  it("does not expose internal database errors", () => {
    expect(bookingSaveError({ code: "XX000", message: "sensitive internal details" })).toEqual({
      status: 500, error: "Die Buchung konnte nicht gespeichert werden."
    });
  });
});
