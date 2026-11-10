import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";
import { saveBooking, bookingSaveError } from "@/lib/booking-store";
import { notifyBookingSave } from "@/lib/booking-notifications";
import { calculateBookingDays, getTotalPriorityDaysUsedIncludingForfeitures, validatePriorityQuota, validateMaxSinglePriorityBooking } from "@/lib/rules";
import type { Booking, BookingStatus, PriorityDayForfeiture } from "@/lib/types";

const statuses: BookingStatus[] = ["angefragt", "bestaetigt", "klaerung", "storniert", "abgelehnt"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json();
  const status = String(body.status ?? "angefragt") as BookingStatus;
  const start = String(body.start_date ?? "");
  const end = String(body.end_date ?? "");
  const partyId = String(body.family_party_id ?? "");
  const days = calculateBookingDays(start, end);
  if (!Number.isFinite(days) || days <= 0 || !partyId || !statuses.includes(status)) {
    return NextResponse.json({ error: "Bitte prüfe Zeitraum, Familienpartei und Status." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error: readError } = await admin.from("bookings").select("*, family_parties(*)");
  if (readError) return NextResponse.json({ error: "Die Buchungen konnten nicht geladen werden." }, { status: 500 });
  const bookings = (data ?? []) as Booking[];
  const previous = bookings.find((booking) => booking.id === id);
  if (!previous) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });
  const { data: forfeitures, error: forfeitureError } = await admin.from("priority_day_forfeitures").select("*");
  if (forfeitureError) return NextResponse.json({ error: "Die P-Tage konnten nicht geprüft werden." }, { status: 500 });
  const used = getTotalPriorityDaysUsedIncludingForfeitures(bookings.filter((booking) => booking.id !== id),
    (forfeitures ?? []) as PriorityDayForfeiture[], partyId, Number(start.slice(0, 4)));
  const override = Boolean(body.is_priority) && (!validatePriorityQuota({ requestedDays: days, usedDays: used }).valid || !validateMaxSinglePriorityBooking(days).valid);
  const { result, error } = await saveBooking(admin, {
    bookingId: id, actorId: context.user!.id, management: true, expectedUpdatedAt: previous.updated_at,
    changes: {
      family_party_id: partyId, start_date: start, end_date: end, status,
      is_priority: Boolean(body.is_priority), shared_stay_allowed: Boolean(body.shared_stay_allowed),
      comment: body.comment ? String(body.comment) : null
    }
  });
  if (error || !result) {
    const failure = bookingSaveError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
  if (override && result.changed) {
    await admin.from("booking_events").insert({ booking_id: id, created_by: context.user!.id,
      event_type: "schlichter_override", message: "Diese Änderung überschreibt die normale Regelprüfung für P-Tage." });
  }
  await notifyBookingSave(admin, result, context.user!.id, { previous });
  const { data: updatedForfeitures, error: forfeituresReadError } = await admin.from("priority_day_forfeitures").select("*").eq("booking_id", id);
  return NextResponse.json({
    booking: result.booking,
    forfeitures: forfeituresReadError ? undefined : updatedForfeitures ?? [],
    message: result.new_request ? "Änderung wurde als neue Anfrage gesendet." : "Änderung gespeichert.",
    warning: forfeituresReadError ? "Änderung gespeichert. Die P-Tage konnten nicht neu geladen werden. Bitte lade die Seite erneut." : override ? "Diese Änderung überschreibt die normale Regelprüfung." : null
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });
  const admin = createSupabaseAdminClient();
  // Related objections, events and forfeitures are removed by database cascades.
  const { error } = await admin.from("bookings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Die Buchung konnte nicht gelöscht werden." }, { status: error.code === "P0001" ? 409 : 500 });
  return NextResponse.json({ message: "Änderung gespeichert." });
}
