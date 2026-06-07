import { addDays } from "date-fns";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateBookingDays, checkOverlaps, validateMaxSinglePriorityBooking, validatePriorityQuota, getPriorityDaysUsed } from "@/lib/rules";
import { sendNewBookingEmail } from "@/lib/email";
import type { Booking, Profile } from "@/lib/types";

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("*, family_parties(*)").eq("user_id", user.id).returns<Profile>().single();
  if (!profile?.family_party_id) return NextResponse.json({ error: "Dein Konto ist noch keiner Familienpartei zugeordnet." }, { status: 400 });

  const body = await request.json();
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  const days = calculateBookingDays(startDate, endDate);
  if (!startDate || !endDate || days <= 0) return NextResponse.json({ error: "Bitte wähle ein gültiges Start- und Enddatum." }, { status: 400 });

  const { data: existing = [] } = await supabase.from("bookings").select("*").returns<Booking[]>();

  if (body.is_priority) {
    const usedDays = getPriorityDaysUsed(existing, profile.family_party_id, new Date(`${startDate}T00:00:00`).getFullYear());
    const quota = validatePriorityQuota({ requestedDays: days, usedDays });
    if (!quota.valid) return NextResponse.json({ error: quota.message }, { status: 400 });
    const maxSingle = validateMaxSinglePriorityBooking(days);
    if (!maxSingle.valid) return NextResponse.json({ error: maxSingle.message }, { status: 400 });
  }

  const overlap = checkOverlaps({
    requested: {
      family_party_id: profile.family_party_id,
      start_date: startDate,
      end_date: endDate,
      is_priority: Boolean(body.is_priority),
      shared_stay_allowed: Boolean(body.shared_stay_allowed)
    },
    existingBookings: existing
  });
  if (!overlap.allowed) return NextResponse.json({ error: overlap.message }, { status: 400 });

  const noticeEnds = addDays(new Date(), 3).toISOString();
  const { data: booking, error } = await supabase
    .from("bookings")
    .insert({
      family_party_id: profile.family_party_id,
      created_by: user.id,
      start_date: startDate,
      end_date: endDate,
      is_priority: Boolean(body.is_priority),
      shared_stay_allowed: Boolean(body.shared_stay_allowed),
      status: "angefragt",
      comment: body.comment ? String(body.comment) : null,
      notice_period_ends_at: noticeEnds
    })
    .select("*, family_parties(*)")
    .returns<Booking>()
    .single();

  if (error || !booking) return NextResponse.json({ error: "Die Buchungsanfrage konnte nicht gespeichert werden." }, { status: 500 });

  await supabase.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "created",
    message: "Buchungsanfrage wurde erstellt.",
    created_by: user.id
  });

  const { data: recipients = [] } = await supabase
    .from("profiles")
    .select("email")
    .neq("family_party_id", profile.family_party_id)
    .returns<Pick<Profile, "email">[]>();
  await sendNewBookingEmail(recipients.map((recipient) => recipient.email), booking, booking.family_parties?.name ?? "Eine Familienpartei");

  return NextResponse.json({ id: booking.id, warning: overlap.warning });
}
