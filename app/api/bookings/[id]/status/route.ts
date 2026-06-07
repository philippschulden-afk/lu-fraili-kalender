import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getNotificationRecipients, sendBookingNotification } from "@/lib/email";
import { createPriorityDayForfeitureIfNeeded } from "@/lib/priority-forfeitures";
import { shouldForfeitPriorityDaysOnCancel } from "@/lib/rules";
import type { Booking, BookingStatus, Profile } from "@/lib/types";

const allowedStatuses = ["bestaetigt", "storniert", "abgelehnt"] as const;

type SelectedBookingRow = Pick<
  Booking,
  | "id"
  | "family_party_id"
  | "status"
  | "start_date"
  | "end_date"
  | "created_by"
  | "is_priority"
  | "shared_stay_allowed"
  | "comment"
  | "notice_period_ends_at"
  | "confirmed_at"
  | "cancelled_at"
  | "created_at"
  | "updated_at"
> & {
  family_parties?: Booking["family_parties"];
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });

  const body = await request.json();
  const status = String(body.status) as BookingStatus;
  if (!allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
    return NextResponse.json({ error: "Unbekannter Status." }, { status: 400 });
  }

  const { data: profileData } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
  const profile = profileData as Profile | null;
  const { data: bookingData } = await supabase.from("bookings").select("*, family_parties(*)").eq("id", params.id).single();
  const booking = bookingData as SelectedBookingRow | null;
  if (!profile || !booking) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });

  const isOwnBooking = booking.created_by === user.id;
  const isSchlichter = profile.role === "schlichter";
  if (status === "storniert" && !isOwnBooking && !isSchlichter) {
    return NextResponse.json({ error: "Du kannst nur deine eigenen Buchungen stornieren." }, { status: 403 });
  }
  if (status !== "storniert" && !isSchlichter) {
    return NextResponse.json({ error: "Nur Schlichter können diese Änderung vornehmen." }, { status: 403 });
  }
  if (["bestaetigt", "abgelehnt"].includes(status)) {
    const { count: objectionCount } = await supabase
      .from("objections")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", booking.id);
    if (booking.status !== "angefragt" || (objectionCount ?? 0) === 0) {
      return NextResponse.json({ error: "Diese Buchung kann hier nicht bestätigt oder abgelehnt werden." }, { status: 400 });
    }
  }

  const update: Record<string, string> = { status };
  if (status === "bestaetigt") update.confirmed_at = new Date().toISOString();
  if (status === "storniert") update.cancelled_at = new Date().toISOString();

  const previousStatus = booking.status;
  await supabase.from("bookings").update(update).eq("id", booking.id);
  await supabase.from("booking_events").insert({
    booking_id: booking.id,
    event_type: status,
    message: `Status auf ${status} geändert.`,
    created_by: user.id
  });

  if (previousStatus !== status) {
    const recipients = await getNotificationRecipients(supabase, { excludeUserId: user.id });
    await sendBookingNotification({
      to: recipients,
      type: status === "storniert" ? "cancelled" : "status_changed",
      booking: { ...booking, status },
      partyName: booking.family_parties?.name ?? "Familienpartei",
      newStatus: status
    });
    await supabase.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "email_status_changed",
      message: status === "storniert" ? "E-Mail wegen Stornierung versendet." : "E-Mail wegen Statusänderung versendet.",
      created_by: user.id
    });
  }

  if (status === "storniert" && shouldForfeitPriorityDaysOnCancel(booking)) {
    const admin = createSupabaseAdminClient();
    const reason = "P-Zeit weniger als einen Monat vor Beginn storniert";
    const forfeiture = await createPriorityDayForfeitureIfNeeded({
      admin,
      booking,
      reason,
      createdBy: user.id
    });
    if (forfeiture.created) {
      const recipients = await getNotificationRecipients(admin);
      await sendBookingNotification({
        to: recipients,
        type: "priority_days_forfeited",
        booking,
        partyName: booking.family_parties?.name ?? "Familienpartei",
        forfeitedDays: forfeiture.forfeitedDays
      });
      await admin.from("booking_events").insert({
        booking_id: booking.id,
        event_type: "email_priority_days_forfeited",
        message: "E-Mail wegen verfallener P-Tage versendet.",
        created_by: user.id
      });
    }
  }

  return NextResponse.json({ ok: true });
}
