import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bookingSaveError, saveBooking } from "@/lib/booking-store";
import { notifyBookingSave } from "@/lib/booking-notifications";
import { calculateBookingDays } from "@/lib/rules";
import type { Booking } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getAuthContext();
  if (!user || !profile) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
  const body = await request.json();
  const start = String(body.start_date ?? "");
  const end = String(body.end_date ?? "");
  const days = calculateBookingDays(start, end);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "Bitte wähle ein gültiges Start- und Enddatum." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error: readError } = await admin.from("bookings").select("*, family_parties(*)").eq("id", id).single();
  const previous = data as Booking | null;
  if (readError || !previous) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });
  if (previous.created_by !== user.id && previous.family_party_id !== profile.family_party_id && profile.role !== "schlichter") {
    return NextResponse.json({ error: "Du kannst diese Buchung nicht bearbeiten." }, { status: 403 });
  }
  const { result, error } = await saveBooking(admin, {
    bookingId: id, actorId: user.id, expectedUpdatedAt: previous.updated_at,
    changes: { start_date: start, end_date: end, shared_stay_allowed: Boolean(body.shared_stay_allowed), comment: body.comment ? String(body.comment) : null }
  });
  if (error || !result) {
    const failure = bookingSaveError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
  await notifyBookingSave(admin, result, user.id, { previous });
  return NextResponse.json({
    message: result.booking.status === "klaerung" ? "Änderung gespeichert. Klärung erforderlich – bitte mit den betroffenen Parteien und Schlichtern abstimmen." : result.new_request ? "Änderung wurde als neue Anfrage gesendet." : "Änderung gespeichert.",
    requiresNewRequest: result.new_request
  });
}
