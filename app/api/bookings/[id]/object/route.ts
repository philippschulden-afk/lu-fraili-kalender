import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendObjectionEmail } from "@/lib/email";
import type { Booking, Profile } from "@/lib/types";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });

  const body = await request.json();
  const reason = String(body.reason ?? "").trim();
  if (reason.length < 3) return NextResponse.json({ error: "Bitte gib einen kurzen Grund ein." }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).returns<Profile>().single();
  const { data: booking } = await supabase.from("bookings").select("*, family_parties(*)").eq("id", params.id).returns<Booking>().single();
  if (!profile || !booking) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });
  if (booking.family_party_id === profile.family_party_id) return NextResponse.json({ error: "Du kannst deiner eigenen Buchung nicht widersprechen." }, { status: 400 });
  if (booking.status !== "angefragt") return NextResponse.json({ error: "Dieser Buchung kann nicht mehr widersprochen werden." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  await admin.from("objections").insert({ booking_id: booking.id, created_by: user.id, reason });
  await admin.from("bookings").update({ status: "klaerung" }).eq("id", booking.id);
  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "objected",
    message: `Widerspruch: ${reason}`,
    created_by: user.id
  });

  const { data: recipients = [] } = await supabase.from("profiles").select("email").eq("role", "schlichter").returns<Pick<Profile, "email">[]>();
  await sendObjectionEmail(recipients.map((recipient) => recipient.email), booking, booking.family_parties?.name ?? "Familienpartei", reason);

  return NextResponse.json({ ok: true });
}
