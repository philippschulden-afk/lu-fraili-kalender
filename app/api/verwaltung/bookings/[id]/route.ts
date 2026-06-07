import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getNotificationRecipients, sendBookingNotification } from "@/lib/email";
import { getSchlichterContext } from "@/lib/schlichter";
import {
  calculateBookingDays,
  checkOverlaps,
  getPriorityDaysUsed,
  validateMaxSinglePriorityBooking,
  validatePriorityQuota
} from "@/lib/rules";
import type { Booking, BookingStatus } from "@/lib/types";

const allowedStatuses: BookingStatus[] = ["angefragt", "bestaetigt", "klaerung", "storniert", "abgelehnt"];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  const familyPartyId = String(body.family_party_id ?? "");
  const status = String(body.status ?? "angefragt") as BookingStatus;

  if (!startDate || !endDate || calculateBookingDays(startDate, endDate) <= 0) {
    return NextResponse.json({ error: "Bitte wähle ein gültiges Start- und Enddatum." }, { status: 400 });
  }
  if (!familyPartyId) return NextResponse.json({ error: "Bitte wähle eine Familienpartei." }, { status: 400 });
  if (!allowedStatuses.includes(status)) return NextResponse.json({ error: "Bitte wähle einen gültigen Status." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: existingData } = await admin.from("bookings").select("*, family_parties(*)").returns<Booking[]>();
  const existingBookings = existingData ?? [];
  const currentBooking = existingBookings.find((booking) => booking.id === params.id);
  if (!currentBooking) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });

  const otherBookings = existingBookings.filter((booking) => booking.id !== params.id);
  const days = calculateBookingDays(startDate, endDate);
  const warnings: string[] = [];

  if (Boolean(body.is_priority)) {
    const usedDays = getPriorityDaysUsed(otherBookings, familyPartyId, new Date(`${startDate}T00:00:00`).getFullYear());
    const quota = validatePriorityQuota({ requestedDays: days, usedDays });
    if (!quota.valid && quota.message) warnings.push(quota.message);
    const single = validateMaxSinglePriorityBooking(days);
    if (!single.valid && single.message) warnings.push(single.message);
  }

  const overlap = checkOverlaps({
    requested: {
      family_party_id: familyPartyId,
      start_date: startDate,
      end_date: endDate,
      is_priority: Boolean(body.is_priority),
      shared_stay_allowed: Boolean(body.shared_stay_allowed)
    },
    existingBookings: otherBookings
  });
  if (!overlap.allowed && overlap.message) warnings.push(overlap.message);
  if (overlap.warning) warnings.push(overlap.warning);

  const update: Record<string, string | boolean | null> = {
    family_party_id: familyPartyId,
    start_date: startDate,
    end_date: endDate,
    is_priority: Boolean(body.is_priority),
    shared_stay_allowed: Boolean(body.shared_stay_allowed),
    status,
    comment: body.comment ? String(body.comment) : null
  };

  if (status === "bestaetigt" && !currentBooking.confirmed_at) update.confirmed_at = new Date().toISOString();
  if (status === "storniert" && !currentBooking.cancelled_at) update.cancelled_at = new Date().toISOString();
  const bookingChanged =
    currentBooking.family_party_id !== familyPartyId ||
    currentBooking.start_date !== startDate ||
    currentBooking.end_date !== endDate ||
    currentBooking.is_priority !== Boolean(body.is_priority) ||
    currentBooking.shared_stay_allowed !== Boolean(body.shared_stay_allowed) ||
    (currentBooking.comment ?? "") !== (body.comment ? String(body.comment) : "");
  const statusChanged = currentBooking.status !== status;

  const { error } = await admin.from("bookings").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Die Buchung konnte nicht gespeichert werden." }, { status: 500 });

  await admin.from("booking_events").insert({
    booking_id: params.id,
    event_type: "schlichter_update",
    message: warnings.length
      ? `Buchung wurde durch Schlichter geändert. Diese Änderung überschreibt die normale Regelprüfung. Hinweise: ${warnings.join(" ")}`
      : "Buchung wurde durch Schlichter geändert.",
    created_by: context.user?.id ?? null
  });

  const updatedBooking = { ...currentBooking, ...update, status } as Booking;
  const recipients = await getNotificationRecipients(admin, { excludeUserId: context.user?.id ?? null });
  if (statusChanged) {
    await sendBookingNotification({
      to: recipients,
      type: status === "storniert" ? "cancelled" : "status_changed",
      booking: updatedBooking,
      partyName: currentBooking.family_parties?.name ?? "Familienpartei",
      newStatus: status
    });
    await admin.from("booking_events").insert({
      booking_id: params.id,
      event_type: "email_status_changed",
      message: status === "storniert" ? "E-Mail wegen Stornierung versendet." : "E-Mail wegen Statusänderung versendet.",
      created_by: context.user?.id ?? null
    });
  } else if (bookingChanged) {
    await sendBookingNotification({
      to: recipients,
      type: "booking_changed",
      booking: updatedBooking,
      partyName: currentBooking.family_parties?.name ?? "Familienpartei"
    });
    await admin.from("booking_events").insert({
      booking_id: params.id,
      event_type: "email_booking_changed",
      message: "E-Mail wegen geänderter Buchung versendet.",
      created_by: context.user?.id ?? null
    });
  }

  return NextResponse.json({
    message: "Änderung gespeichert.",
    warning: warnings.length ? "Diese Änderung überschreibt die normale Regelprüfung." : null
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const admin = createSupabaseAdminClient();
  await admin.from("objections").delete().eq("booking_id", params.id);
  await admin.from("booking_events").delete().eq("booking_id", params.id);
  const { error } = await admin.from("bookings").delete().eq("id", params.id);

  if (error) return NextResponse.json({ error: "Die Buchung konnte nicht gelöscht werden." }, { status: 500 });
  return NextResponse.json({ message: "Änderung gespeichert." });
}
