import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { sendCancellationEmail } from "@/lib/email";
import type { Booking, Profile } from "@/lib/types";

const allowedStatuses = ["bestaetigt", "storniert", "abgelehnt", "klaerung"] as const;

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
  const status = String(body.status);
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

  const update: Record<string, string> = { status };
  if (status === "bestaetigt") update.confirmed_at = new Date().toISOString();
  if (status === "storniert") update.cancelled_at = new Date().toISOString();

  await supabase.from("bookings").update(update).eq("id", booking.id);
  await supabase.from("booking_events").insert({
    booking_id: booking.id,
    event_type: status,
    message: status === "klaerung" ? "Klärung als erledigt markiert." : `Status geändert: ${status}`,
    created_by: user.id
  });

  if (status === "storniert") {
    const { data: recipientsData } = await supabase.from("profiles").select("email").returns<Pick<Profile, "email">[]>();
    const recipients = recipientsData ?? [];
    await sendCancellationEmail(recipients.map((recipient) => recipient.email), booking, booking.family_parties?.name ?? "Familienpartei");
  }

  return NextResponse.json({ ok: true });
}
