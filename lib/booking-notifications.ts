import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingSaveResult } from "@/lib/booking-store";
import type { Booking } from "@/lib/types";
import type { EmailResult } from "@/lib/email";

// Retain safe no-ops for existing server callers; never create email history.
export async function recordEmailResult(_client: SupabaseClient, _id: string, _actor: string | null, _result: EmailResult, _type: string) {}
export async function notifyBookingSave(
  _client: SupabaseClient, _saved: BookingSaveResult, _actor: string | null,
  _options: { previous?: Booking; autoConfirmed?: boolean } = {}
) {}
