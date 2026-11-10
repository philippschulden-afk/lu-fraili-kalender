import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { saveBooking } from "@/lib/booking-store";
import { notifyBookingSave } from "@/lib/booking-notifications";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 401 });
  }
  const admin = createSupabaseAdminClient();
  const { data, error: readError } = await admin.from("bookings").select("id")
    .eq("status", "angefragt").lte("notice_period_ends_at", new Date().toISOString()).order("created_at");
  if (readError) return NextResponse.json({ error: "Die Anfragen konnten nicht geprüft werden." }, { status: 500 });
  let confirmed = 0;
  let clarification = 0;
  let failed = 0;
  for (const booking of data ?? []) {
    const { result, error } = await saveBooking(admin, { bookingId: booking.id, changes: {}, autoConfirm: true });
    if (error || !result) {
      failed += 1;
      console.error("Automatische Bestätigung fehlgeschlagen:", booking.id, error?.code);
      continue;
    }
    if (!result.changed) continue;
    if (result.booking.status === "klaerung") {
      clarification += 1;
      continue;
    }
    if (result.booking.status !== "bestaetigt") continue;
    confirmed += 1;
    await notifyBookingSave(admin, result, null, { autoConfirmed: true });
  }
  return NextResponse.json({ confirmed, clarification, failed }, { status: failed > 0 ? 500 : 200 });
}
