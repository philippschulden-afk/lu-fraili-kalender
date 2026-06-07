import { addDays } from "date-fns";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { calculateBookingDays, checkOverlaps, validateMaxSinglePriorityBooking, validatePriorityQuota, getPriorityDaysUsed } from "@/lib/rules";
import { sendNewBookingEmail } from "@/lib/email";
import type { Booking, Profile } from "@/lib/types";

type CreatedBookingRow = Pick<
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

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });

  const { data: profileData } = await supabase.from("profiles").select("*, family_parties(*)").eq("user_id", user.id).single();
  const profile = profileData as Profile | null;
  if (!profile?.family_party_id) return NextResponse.json({ error: "Dein Konto ist noch keiner Familienpartei zugeordnet." }, { status: 400 });

  const body = await request.json();
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  const days = calculateBookingDays(startDate, endDate);
  if (!startDate || !endDate || days <= 0) return NextResponse.json({ error: "Bitte wähle ein gültiges Start- und Enddatum." }, { status: 400 });

  const { data: existingData } = await supabase.from("bookings").select("*").returns<Booking[]>();
  const existing = existingData ?? [];

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
  const { data: bookingData, error } = await supabase
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
    .single();
  const booking = bookingData as CreatedBookingRow | null;

  if (error || !booking) return NextResponse.json({ error: "Die Buchungsanfrage konnte nicht gespeichert werden." }, { status: 500 });

  await supabase.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "created",
    message: "Buchungsanfrage wurde erstellt.",
    created_by: user.id
  });

  const { data: recipientsData } = await supabase
    .from("profiles")
    .select("email")
    .neq("family_party_id", profile.family_party_id)
    .returns<Pick<Profile, "email">[]>();
  const recipients = recipientsData ?? [];
  await sendNewBookingEmail(recipients.map((recipient) => recipient.email), booking, booking.family_parties?.name ?? "Eine Familienpartei");

  return NextResponse.json({ id: booking.id, warning: overlap.warning });
}
