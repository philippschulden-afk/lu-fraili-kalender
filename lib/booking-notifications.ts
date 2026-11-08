import type { SupabaseClient } from "@supabase/supabase-js";
import { findBookingConflicts } from "@/lib/conflicts";
import { EMAIL_NOTIFICATIONS_ENABLED, getNotificationRecipients, sendBookingNotification, type EmailResult } from "@/lib/email";
import type { BookingSaveResult } from "@/lib/booking-store";
import type { Booking } from "@/lib/types";

export async function recordEmailResult(supabase: SupabaseClient, bookingId: string, actorId: string | null, result: EmailResult, eventType: string) {
  if (!EMAIL_NOTIFICATIONS_ENABLED) return;
  const message = !result.ok ? "E-Mail-Versand fehlgeschlagen."
    : result.skipped ? "E-Mail-Versand wurde übersprungen." : "E-Mail wurde zum Versand angenommen.";
  const { error } = await supabase.from("booking_events").insert({ booking_id: bookingId, created_by: actorId, event_type: eventType, message });
  if (error) console.error("E-Mail-Ergebnis konnte nicht im Buchungsverlauf gespeichert werden.");
}

export async function notifyBookingSave(
  supabase: SupabaseClient,
  saved: BookingSaveResult,
  actorId: string | null,
  options: { previous?: Booking; autoConfirmed?: boolean } = {}
) {
  if (!EMAIL_NOTIFICATIONS_ENABLED || !saved.changed) return;
  const { booking } = saved;
  const partyName = booking.family_parties?.name ?? "Familienpartei";
  try {
    const recipients = await getNotificationRecipients(supabase, { excludeUserId: actorId });
    const type = options.autoConfirmed ? "auto_confirmed" : saved.new_request ? "new_request"
      : booking.status === "storniert" ? "cancelled"
      : options.previous && options.previous.status !== booking.status ? "status_changed" : "booking_changed";
    const result = await sendBookingNotification({ to: recipients, type, booking, partyName, newStatus: booking.status });
    await recordEmailResult(supabase, booking.id, actorId, result, `email_${type}`);
    if (saved.forfeited_days > 0) {
      const allRecipients = await getNotificationRecipients(supabase);
      const result = await sendBookingNotification({
        to: allRecipients, type: "priority_days_forfeited", booking: options.previous ?? booking,
        partyName, forfeitedDays: saved.forfeited_days
      });
      await recordEmailResult(supabase, booking.id, actorId, result, "email_priority_days_forfeited");
    }
    const previous = options.previous;
    const periodChanged = !previous || previous.start_date !== booking.start_date || previous.end_date !== booking.end_date
      || previous.is_priority !== booking.is_priority || previous.family_party_id !== booking.family_party_id;
    if (!periodChanged || !booking.is_priority || ["storniert", "abgelehnt"].includes(booking.status)) return;
    const { data, error } = await supabase.from("bookings").select("*, family_parties(*)")
      .neq("id", booking.id).lte("start_date", booking.end_date).gte("end_date", booking.start_date);
    if (error) throw new Error("Überschneidungen konnten nicht geladen werden.");
    const conflicts = findBookingConflicts({ requested: booking, existingBookings: (data ?? []) as Booking[] });
    for (const { booking: affected } of conflicts.filter((conflict) => conflict.kind === "priority_displacement")) {
      const affectedRecipients = await getNotificationRecipients(supabase, { familyPartyIds: [affected.family_party_id] });
      const schlichter = await getNotificationRecipients(supabase, { onlySchlichter: true });
      const result = await sendBookingNotification({
        to: [...affectedRecipients, ...schlichter], type: "priority_displacement", booking, partyName,
        affectedBooking: affected, affectedPartyName: affected.family_parties?.name ?? "Betroffene Partei"
      });
      await recordEmailResult(supabase, booking.id, actorId, result, "email_priority_displacement");
    }
  } catch {
    console.error("Buchung gespeichert; Benachrichtigung konnte nicht abgeschlossen werden.");
    try { await recordEmailResult(supabase, booking.id, actorId, { ok: false }, "email_failed"); }
    catch { console.error("Fehlender E-Mail-Versand konnte nicht protokolliert werden."); }
  }
}
