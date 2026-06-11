import { addDays } from "date-fns";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { findBookingConflicts, hasBlockingPriorityConflict } from "@/lib/conflicts";
import { calculateBookingDays, checkOverlaps, validateMaxSinglePriorityBooking, validatePriorityQuota, getTotalPriorityDaysUsedIncludingForfeitures } from "@/lib/rules";
import { getNotificationRecipients, sendBookingNotification } from "@/lib/email";
import type { Booking, PriorityDayForfeiture } from "@/lib/types";

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
  const { supabase, user, profile } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });

  if (!profile?.family_party_id) return NextResponse.json({ error: "Dein Konto ist noch keiner Familienpartei zugeordnet." }, { status: 400 });

  const body = await request.json();
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  const days = calculateBookingDays(startDate, endDate);
  if (!startDate || !endDate || days <= 0) return NextResponse.json({ error: "Bitte wähle ein gültiges Start- und Enddatum." }, { status: 400 });

  const { data: existingData } = await supabase.from("bookings").select("*, family_parties(*)").returns<Booking[]>();
  const { data: forfeituresData } = await supabase.from("priority_day_forfeitures").select("*").returns<PriorityDayForfeiture[]>();
  const existing = existingData ?? [];
  const forfeitures = forfeituresData ?? [];
  const requestedBooking = {
    family_party_id: profile.family_party_id,
    start_date: startDate,
    end_date: endDate,
    is_priority: Boolean(body.is_priority),
    shared_stay_allowed: Boolean(body.shared_stay_allowed)
  };

  if (hasBlockingPriorityConflict({ requested: requestedBooking, existingBookings: existing })) {
    return NextResponse.json(
      { error: "Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt." },
      { status: 409 }
    );
  }

  if (body.is_priority) {
    const usedDays = getTotalPriorityDaysUsedIncludingForfeitures(existing, forfeitures, profile.family_party_id, new Date(`${startDate}T00:00:00`).getFullYear());
    const quota = validatePriorityQuota({ requestedDays: days, usedDays });
    if (!quota.valid) return NextResponse.json({ error: quota.message }, { status: 400 });
    const maxSingle = validateMaxSinglePriorityBooking(days);
    if (!maxSingle.valid) return NextResponse.json({ error: maxSingle.message }, { status: 400 });
  }

  const overlap = checkOverlaps({
    requested: requestedBooking,
    existingBookings: existing
  });
  if (!overlap.allowed) return NextResponse.json({ error: overlap.message }, { status: 409 });

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

  const recipients = await getNotificationRecipients(supabase, { excludeUserId: user.id });
  await sendBookingNotification({
    to: recipients,
    type: "new_request",
    booking,
    partyName: booking.family_parties?.name ?? "Eine Familienpartei"
  });
  await supabase.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "email_new_request",
    message: "E-Mail wegen neuer Buchungsanfrage versendet.",
    created_by: user.id
  });

  const conflicts = findBookingConflicts({
    requested: requestedBooking,
    existingBookings: existing
  });

  for (const conflict of conflicts.filter((item) => item.kind === "priority_displacement")) {
    const affectedRecipients = await getNotificationRecipients(supabase, {
      familyPartyIds: [conflict.booking.family_party_id]
    });
    const schlichterRecipients = await getNotificationRecipients(supabase, { onlySchlichter: true });
    await sendBookingNotification({
      to: [...affectedRecipients, ...schlichterRecipients],
      type: "priority_displacement",
      booking,
      partyName: booking.family_parties?.name ?? "Familienpartei",
      affectedBooking: conflict.booking,
      affectedPartyName: conflict.booking.family_parties?.name ?? "Betroffene Partei"
    });
    await supabase.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "priority_displacement",
      message: "P-Zeit überschneidet sich mit normaler Buchung.",
      created_by: user.id
    });
  }

  return NextResponse.json({ id: booking.id, warning: overlap.warning });
}
