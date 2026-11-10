import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";
import { saveBooking, bookingSaveError } from "@/lib/booking-store";
import { notifyBookingSave } from "@/lib/booking-notifications";
import { calculateBookingDays } from "@/lib/rules";
import type { Booking, BookingStatus } from "@/lib/types";

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
  await notifyBookingSave(admin, result, context.user!.id, { previous });
  const { data: updatedForfeitures, error: forfeituresReadError } = await admin.from("priority_day_forfeitures").select("*").eq("booking_id", id);
  return NextResponse.json({
    booking: result.booking,
    forfeitures: forfeituresReadError ? undefined : updatedForfeitures ?? [],
    message: result.booking.status === "klaerung" ? "Änderung gespeichert. Klärung erforderlich – bitte mit den betroffenen Parteien abstimmen." : result.new_request ? "Änderung wurde als neue Anfrage gesendet." : "Änderung gespeichert.",
    warning: forfeituresReadError ? "Änderung gespeichert. Die P-Tage konnten nicht neu geladen werden. Bitte lade die Seite erneut." : null
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });
  const admin = createSupabaseAdminClient();
  // Related objections, events and forfeitures are removed by database cascades.
  const { data, error } = await admin.from("bookings").delete().eq("id", id).select("*, family_parties(*)").maybeSingle();
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message : "Die Buchung konnte nicht gelöscht werden." }, { status: error.code === "P0001" ? 409 : 500 });
  if (data) await notifyBookingSave(admin, { booking: data as Booking, changed: true, new_request: false, forfeited_days: 0 }, context.user!.id, { deleted: true });
  return NextResponse.json({ message: "Änderung gespeichert." });
}
