import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth-context";
import { getNotificationRecipients, sendBookingNotification } from "@/lib/email";
import { recordEmailResult } from "@/lib/booking-notifications";
import { bookingSaveError } from "@/lib/booking-store";
import type { Booking } from "@/lib/types";

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
  const { supabase, user, profile } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });

  const body = await request.json();
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) return NextResponse.json({ error: "Bitte gib einen kurzen Grund ein." }, { status: 400 });

  const { data: bookingData } = await supabase.from("bookings").select("*, family_parties(*)").eq("id", params.id).single();
  const booking = bookingData as SelectedBookingRow | null;
  if (!profile || !booking) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });
  if (booking.family_party_id === profile.family_party_id) return NextResponse.json({ error: "Du kannst deiner eigenen Buchung nicht widersprechen." }, { status: 400 });
  if (booking.status !== "angefragt") return NextResponse.json({ error: "Dieser Buchung kann nicht mehr widersprochen werden." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("add_booking_objection", {
    p_booking_id: booking.id, p_actor_id: user.id, p_reason: reason
  });
  if (error) {
    const failure = bookingSaveError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
  try {
    const recipients = await getNotificationRecipients(admin, { excludeUserId: user.id });
    const result = await sendBookingNotification({ to: recipients, type: "objection_created", booking,
      partyName: booking.family_parties?.name ?? "Familienpartei", reason });
    await recordEmailResult(admin, booking.id, user.id, result, "email_objection");
  } catch {
    console.error("Widerspruch gespeichert; E-Mail konnte nicht versendet werden.");
  }

  return NextResponse.json({ ok: true });
}
