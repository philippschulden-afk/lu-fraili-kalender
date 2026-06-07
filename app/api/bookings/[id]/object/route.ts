import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getNotificationRecipients, sendBookingNotification } from "@/lib/email";
import type { Booking, Profile } from "@/lib/types";

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
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) return NextResponse.json({ error: "Bitte gib einen kurzen Grund ein." }, { status: 400 });

  const { data: profileData } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
  const profile = profileData as Profile | null;
  const { data: bookingData } = await supabase.from("bookings").select("*, family_parties(*)").eq("id", params.id).single();
  const booking = bookingData as SelectedBookingRow | null;
  if (!profile || !booking) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });
  if (booking.family_party_id === profile.family_party_id) return NextResponse.json({ error: "Du kannst deiner eigenen Buchung nicht widersprechen." }, { status: 400 });
  if (booking.status !== "angefragt") return NextResponse.json({ error: "Dieser Buchung kann nicht mehr widersprochen werden." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  await admin.from("objections").insert({ booking_id: booking.id, created_by: user.id, reason });
  await admin.from("bookings").update({ status: "klaerung" }).eq("id", booking.id);
  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "objected",
    message: `Widerspruch angelegt. Grund: ${reason}`,
    created_by: user.id
  });

  const recipients = await getNotificationRecipients(admin, { excludeUserId: user.id });
  await sendBookingNotification({
    to: recipients,
    type: "objection_created",
    booking,
    partyName: booking.family_parties?.name ?? "Familienpartei",
    reason
  });
  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "email_objection",
    message: "E-Mail wegen Widerspruch versendet.",
    created_by: user.id
  });

  return NextResponse.json({ ok: true });
}
