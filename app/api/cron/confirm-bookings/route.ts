import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canAutoConfirmBooking } from "@/lib/rules";
import { getNotificationRecipients, sendBookingNotification } from "@/lib/email";
import type { Booking, Objection, Profile } from "@/lib/types";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Nicht erlaubt." }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .eq("status", "angefragt")
    .returns<Booking[]>();
  const { data: objectionsData } = await supabase.from("objections").select("*").returns<Objection[]>();
  const bookings = bookingsData ?? [];
  const objections = objectionsData ?? [];
  const recipients = await getNotificationRecipients(supabase);
  let confirmed = 0;

  for (const booking of bookings) {
    const objectionCount = objections.filter((objection) => objection.booking_id === booking.id).length;
    if (!canAutoConfirmBooking({ status: booking.status, noticePeriodEndsAt: booking.notice_period_ends_at, objectionCount })) {
      continue;
    }

    await supabase
      .from("bookings")
      .update({ status: "bestaetigt", confirmed_at: new Date().toISOString() })
      .eq("id", booking.id);
    await supabase.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "auto_confirmed",
      message: "Buchung wurde automatisch bestätigt.",
      created_by: null
    });
    await sendBookingNotification({
      to: recipients,
      type: "auto_confirmed",
      booking: { ...booking, status: "bestaetigt" },
      partyName: booking.family_parties?.name ?? "Familienpartei"
    });
    await supabase.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "email_auto_confirmed",
      message: "E-Mail wegen automatischer Bestätigung versendet.",
      created_by: null
    });
    confirmed += 1;
  }

  return NextResponse.json({ confirmed });
}
