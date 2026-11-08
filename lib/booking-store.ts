import type { SupabaseClient } from "@supabase/supabase-js";
import type { Booking } from "@/lib/types";

export type BookingSaveResult = {
  booking: Booking;
  changed: boolean;
  new_request: boolean;
  forfeited_days: number;
};

export async function saveBooking(
  supabase: SupabaseClient,
  input: {
    bookingId?: string;
    actorId?: string;
    changes: Partial<Pick<Booking, "family_party_id" | "start_date" | "end_date" | "is_priority" | "shared_stay_allowed" | "status" | "comment">>;
    management?: boolean;
    autoConfirm?: boolean;
    expectedUpdatedAt?: string;
  }
) {
  const { data, error } = await supabase.rpc("save_booking", {
    p_booking_id: input.bookingId ?? null,
    p_actor_id: input.actorId ?? null,
    p_changes: input.changes,
    p_management: input.management ?? false,
    p_auto_confirm: input.autoConfirm ?? false,
    p_expected_updated_at: input.expectedUpdatedAt ?? null
  });
  return { result: data as BookingSaveResult | null, error };
}

export function bookingSaveError(error: { code: string; message: string } | null) {
  if (error?.code === "P0001") {
    return { error: error.message, status: /belegt|inzwischen geändert/.test(error.message) ? 409 : 400 };
  }
  if (error?.code === "PGRST202") console.error("Buchungsverwaltung: Datenbank-Migration 004 fehlt.");
  return { error: "Die Buchung konnte nicht gespeichert werden.", status: 500 };
}
