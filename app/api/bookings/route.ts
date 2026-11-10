import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { bookingSaveError, saveBooking } from "@/lib/booking-store";
import { notifyBookingSave } from "@/lib/booking-notifications";
import { calculateBookingDays } from "@/lib/rules";

export async function POST(request: Request) {
  const { user, profile } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
  if (!profile?.family_party_id) return NextResponse.json({ error: "Dein Konto ist noch keiner Familienpartei zugeordnet." }, { status: 400 });
  const body = await request.json();
  const start = String(body.start_date ?? "");
  const end = String(body.end_date ?? "");
  const days = calculateBookingDays(start, end);
  if (!Number.isFinite(days) || days <= 0) {
    return NextResponse.json({ error: "Bitte wähle ein gültiges Start- und Enddatum." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  const { result, error } = await saveBooking(admin, {
    actorId: user.id,
    changes: {
      start_date: start, end_date: end, is_priority: Boolean(body.is_priority),
      shared_stay_allowed: Boolean(body.shared_stay_allowed), comment: body.comment ? String(body.comment) : null
    }
  });
  if (error || !result) {
    const failure = bookingSaveError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
  await notifyBookingSave(admin, result, user.id);
  return NextResponse.json({ id: result.booking.id, status: result.booking.status });
}
