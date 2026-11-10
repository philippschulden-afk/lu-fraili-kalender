import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingSaveResult } from "@/lib/booking-store";
import type { Booking, Profile } from "@/lib/types";
import { bookingEmailEnabled, cleanSubjectPart, getNotificationRecipients, loadMailProfiles, sendEmail, type EmailResult } from "@/lib/email";
import { buildBookingEmail, emailMessage, type BookingEmailType } from "@/lib/email-messages";

type SaveOptions = { previous?: Booking; autoConfirmed?: boolean; deleted?: boolean };

export function bookingEmailType(saved: BookingSaveResult, options: SaveOptions = {}, hasDisplacement = false): BookingEmailType | null {
  if (!saved.changed) return null;
  const { booking } = saved;
  if (options.deleted) return "deleted";
  if (hasDisplacement && booking.status === "klaerung") return "displacement";
  if (options.autoConfirmed) return booking.status === "klaerung" ? "auto_clarification" : booking.status === "bestaetigt" ? "auto_confirmed" : null;
  if (!options.previous) return "requested";
  if (saved.new_request) return "requested_again";
  if (options.previous.status !== booking.status) {
    return ({ angefragt: "requested_again", bestaetigt: "confirmed", klaerung: "clarification", storniert: "cancelled", abgelehnt: "rejected" } as const)[booking.status];
  }
  return "changed";
}

async function recordEmailResult(client: SupabaseClient, id: string, actorId: string | null, result: EmailResult, type: BookingEmailType) {
  if (result.skipped) return;
  try {
    const { error } = await client.from("booking_events").insert({
      booking_id: id,
      created_by: actorId,
      event_type: `email_${type}${result.ok ? "" : "_failed"}`,
      message: result.ok
        ? `E-Mail von Resend zum Versand angenommen (${result.count ?? 0} Empfänger).`
        : "Die E-Mail-Benachrichtigung konnte nicht bestätigt werden. Bitte informiere die Familie bei Bedarf direkt."
    });
    if (error) console.error("E-Mail-Verlauf konnte nicht gespeichert werden.", error.code);
  } catch {
    console.error("E-Mail-Verlauf konnte nicht gespeichert werden.");
  }
}

export async function notifyBookingSave(client: SupabaseClient, saved: BookingSaveResult, actorId: string | null, options: SaveOptions = {}) {
  if (!bookingEmailEnabled() || !saved.changed) return;
  const { booking } = saved;
  let type = bookingEmailType(saved, options);
  try {
    const profiles = await loadMailProfiles(client);
    const actorName = actorId ? profiles.find((p) => p.user_id === actorId)?.full_name || "Ein Familienmitglied" : "App";
    let affectedParties: string[] = [];
    if (!options.deleted && booking.is_priority && booking.status === "klaerung") {
      // Match the displacement events written by this exact save, not older overlaps.
      const { data, error } = await client.from("booking_events").select("bookings(family_parties(name))")
        .eq("created_at", booking.updated_at).eq("event_type", "priority_displacement")
        .like("message", `%Betroffene P-Buchung: ${booking.id}.%`);
      if (error) console.error("Betroffene Familienparteien konnten nicht geladen werden.", error.code);
      affectedParties = [...new Set(((data ?? []) as unknown as { bookings?: Pick<Booking, "family_parties"> | null }[])
        .map((row) => row.bookings?.family_parties?.name).filter((name): name is string => Boolean(name)))];
      type = bookingEmailType(saved, options, Boolean(data?.length));
    }
    const to = getNotificationRecipients(profiles, actorId);
    if (type) {
      const result = await sendEmail({ to, ...buildBookingEmail({ type, booking, actorName, previous: options.previous, affectedParties }),
        eventKey: `booking:${booking.id}:${booking.updated_at}:${type}` });
      if (!options.deleted) await recordEmailResult(client, booking.id, actorId, result, type);
    }
    if (saved.forfeited_days > 0) {
      const original = options.previous ?? booking;
      const result = await sendEmail({ to, ...buildBookingEmail({ type: "forfeited", booking: { ...original, status: booking.status }, actorName, forfeitedDays: saved.forfeited_days }),
        eventKey: `booking:${booking.id}:${booking.updated_at}:forfeited` });
      await recordEmailResult(client, booking.id, actorId, result, "forfeited");
    }
  } catch {
    console.error("Buchung gespeichert; Benachrichtigung konnte nicht vorbereitet werden.");
    if (!options.deleted && type) await recordEmailResult(client, booking.id, actorId, { ok: false }, type);
  }
}

export async function notifyBookingObjection(client: SupabaseClient, booking: Booking, actorId: string, reason: string) {
  if (!bookingEmailEnabled()) return;
  let result: EmailResult = { ok: false };
  try {
    const { data, error } = await client.from("objections").select("id").eq("booking_id", booking.id)
      .eq("created_by", actorId).eq("reason", reason).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data?.id) throw new Error("Widerspruch nicht lesbar");
    const profiles = await loadMailProfiles(client);
    const actorName = profiles.find((p) => p.user_id === actorId)?.full_name || "Ein Familienmitglied";
    const to = getNotificationRecipients(profiles, actorId, (p) => p.role === "schlichter" || p.user_id === booking.created_by || p.family_party_id === booking.family_party_id);
    result = await sendEmail({ to, ...buildBookingEmail({ type: "objection", booking, actorName, reason }), eventKey: `objection:${data.id}` });
  } catch {
    console.error("Widerspruch gespeichert; Benachrichtigung konnte nicht vorbereitet werden.");
  }
  await recordEmailResult(client, booking.id, actorId, result, "objection");
}

export async function notifyUnassignedProfile(client: SupabaseClient, profile: Profile, actorId: string | null) {
  if (!bookingEmailEnabled() || profile.family_party_id || !profile.user_id) return;
  try {
    const profiles = await loadMailProfiles(client);
    const actorName = cleanSubjectPart(profiles.find((p) => p.user_id === actorId && actorId)?.full_name ?? "Verwaltung");
    const name = cleanSubjectPart(profile.full_name ?? "Neues Familienmitglied");
    const to = getNotificationRecipients(profiles, actorId, (p) => p.role === "schlichter");
    await sendEmail({ to, eventKey: `unassigned:${profile.id}`, ...emailMessage(`Lu Fraili: ${actorName} hat ${name} ohne Familienpartei angelegt`,
      [`${name} wartet auf die Zuordnung zu einer Familienpartei.`], "/verwaltung", "Zur Verwaltung") });
  } catch {
    console.error("Profil gespeichert; Benachrichtigung konnte nicht vorbereitet werden.");
  }
}

export async function notifyBookingComment(client: SupabaseClient, bookingId: string, eventId: string, actorId: string | null) {
  if (!bookingEmailEnabled()) return;
  let result: EmailResult = { ok: false };
  try {
    const { data, error } = await client.from("bookings").select("*, family_parties(*)").eq("id", bookingId).single();
    if (error || !data) throw new Error("Buchung nicht lesbar");
    const booking = data as Booking;
    const profiles = await loadMailProfiles(client);
    const actorName = profiles.find((p) => p.user_id === actorId && actorId)?.full_name || "Schlichter";
    const to = getNotificationRecipients(profiles, actorId, (p) => p.role === "schlichter" || p.family_party_id === booking.family_party_id);
    result = await sendEmail({ to, ...buildBookingEmail({ type: "commented", booking, actorName }), eventKey: `comment:${eventId}` });
  } catch {
    console.error("Kommentar gespeichert; Benachrichtigung konnte nicht vorbereitet werden.");
  }
  await recordEmailResult(client, bookingId, actorId, result, "commented");
}
