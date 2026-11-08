import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bookingSaveError, saveBooking } from "@/lib/booking-store";
import { notifyBookingSave } from "@/lib/booking-notifications";
import type { Booking, BookingStatus } from "@/lib/types";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, profile } = await getAuthContext();
  if (!user || !profile) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
  const body = await request.json();
  const status = String(body.status) as BookingStatus;
  if (!["bestaetigt", "storniert", "abgelehnt"].includes(status)) {
    return NextResponse.json({ error: "Unbekannter Status." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error: readError } = await admin.from("bookings").select("*, family_parties(*)").eq("id", params.id).single();
  const previous = data as Booking | null;
  if (readError || !previous) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });
  if (profile.role !== "schlichter" && (status !== "storniert" || previous.created_by !== user.id)) {
    return NextResponse.json({ error: "Du darfst diese Buchung nicht ändern." }, { status: 403 });
  }
  const { result, error } = await saveBooking(admin, {
    bookingId: params.id, actorId: user.id, changes: { status }, expectedUpdatedAt: previous.updated_at
  });
  if (error || !result) {
    const failure = bookingSaveError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
  await notifyBookingSave(admin, result, user.id, { previous });
  return NextResponse.json({ ok: true });
}
