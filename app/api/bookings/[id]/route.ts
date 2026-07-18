import { addDays } from "date-fns";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { findBookingConflicts, hasBlockingPriorityConflict } from "@/lib/conflicts";
import { getNotificationRecipients, sendBookingNotification } from "@/lib/email";
import { createPriorityDayForfeitureIfNeeded } from "@/lib/priority-forfeitures";
import {
  calculateBookingDays,
  calculateDateRangeDeltaDays,
  calculateForfeitedDaysOnEdit,
  checkOverlaps,
  getTotalPriorityDaysUsedIncludingForfeitures,
  shouldForfeitPriorityDaysOnChange,
  validateMaxSinglePriorityBooking,
  validatePriorityQuota
} from "@/lib/rules";
import type { Booking, PriorityDayForfeiture } from "@/lib/types";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const { user, profile } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Bitte zuerst anmelden." }, { status: 401 });
  if (!profile) return NextResponse.json({ error: "Dein Konto wurde nicht gefunden." }, { status: 404 });

  const body = await request.json();
  const startDate = String(body.start_date ?? "");
  const endDate = String(body.end_date ?? "");
  const days = calculateBookingDays(startDate, endDate);
  if (!startDate || !endDate || days <= 0) {
    return NextResponse.json({ error: "Bitte wähle ein gültiges Start- und Enddatum." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: bookingsData } = await admin.from("bookings").select("*, family_parties(*)").returns<Booking[]>();
  const bookings = bookingsData ?? [];
  const booking = bookings.find((item) => item.id === params.id);
  if (!booking) return NextResponse.json({ error: "Die Buchung wurde nicht gefunden." }, { status: 404 });

  const canEdit = booking.created_by === user.id || booking.family_party_id === profile.family_party_id || profile.role === "schlichter";
  if (!canEdit) return NextResponse.json({ error: "Du kannst diese Buchung nicht bearbeiten." }, { status: 403 });
  if (["storniert", "abgelehnt"].includes(booking.status)) {
    return NextResponse.json({ error: "Diese Buchung kann nicht mehr bearbeitet werden." }, { status: 400 });
  }

  const otherBookings = bookings.filter((item) => item.id !== booking.id);
  const requestedBooking = {
    family_party_id: booking.family_party_id,
    start_date: startDate,
    end_date: endDate,
    is_priority: booking.is_priority,
    shared_stay_allowed: Boolean(body.shared_stay_allowed)
  };

  if (hasBlockingPriorityConflict({ requested: requestedBooking, existingBookings: otherBookings })) {
    return NextResponse.json({ error: "Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt." }, { status: 409 });
  }

  const { data: forfeituresData } = await admin.from("priority_day_forfeitures").select("*").returns<PriorityDayForfeiture[]>();
  const forfeitures = forfeituresData ?? [];
  if (booking.is_priority) {
    const year = new Date(`${startDate}T00:00:00`).getFullYear();
    const usedDays = getTotalPriorityDaysUsedIncludingForfeitures(otherBookings, forfeitures, booking.family_party_id, year);
    const quota = validatePriorityQuota({ requestedDays: days, usedDays });
    if (!quota.valid) return NextResponse.json({ error: quota.message }, { status: 400 });
    const maxSingle = validateMaxSinglePriorityBooking(days);
    if (!maxSingle.valid) return NextResponse.json({ error: maxSingle.message }, { status: 400 });
  }

  const overlap = checkOverlaps({ requested: requestedBooking, existingBookings: otherBookings });
  if (!overlap.allowed) return NextResponse.json({ error: overlap.message }, { status: 409 });

  const dateChanged = booking.start_date !== startDate || booking.end_date !== endDate;
  const rangeDeltaDays = dateChanged ? calculateDateRangeDeltaDays(booking.start_date, booking.end_date, startDate, endDate) : 0;
  const requiresNewRequest = dateChanged && rangeDeltaDays > 3;
  const status = requiresNewRequest ? "angefragt" : booking.status;
  const update: Record<string, string | boolean | null> = {
    start_date: startDate,
    end_date: endDate,
    shared_stay_allowed: Boolean(body.shared_stay_allowed),
    comment: body.comment ? String(body.comment) : null,
    status
  };

  if (requiresNewRequest) {
    update.notice_period_ends_at = addDays(new Date(), 3).toISOString();
    update.confirmed_at = null;
  }

  const { error } = await admin.from("bookings").update(update).eq("id", booking.id);
  if (error) return NextResponse.json({ error: "Die Buchung konnte nicht gespeichert werden." }, { status: 500 });

  if (requiresNewRequest) {
    await admin.from("objections").delete().eq("booking_id", booking.id);
  }

  const updatedBooking = { ...booking, ...update, status } as Booking;
  const eventMessage = requiresNewRequest
    ? "Buchung wurde geändert und als neue Anfrage gesendet."
    : "Buchung wurde bearbeitet.";
  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: requiresNewRequest ? "booking_changed_new_request" : "booking_changed",
    message: eventMessage,
    created_by: user.id
  });

  const recipients = await getNotificationRecipients(admin, { excludeUserId: user.id });
  await sendBookingNotification({
    to: recipients,
    type: requiresNewRequest ? "new_request" : "booking_changed",
    booking: updatedBooking,
    partyName: booking.family_parties?.name ?? "Familienpartei"
  });
  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: requiresNewRequest ? "email_new_request" : "email_booking_changed",
    message: requiresNewRequest ? "E-Mail wegen neuer Buchungsanfrage versendet." : "E-Mail wegen geänderter Buchung versendet.",
    created_by: user.id
  });

  const shouldForfeitOnChange = shouldForfeitPriorityDaysOnChange({
    original: booking,
    updated: {
      start_date: startDate,
      end_date: endDate,
      is_priority: booking.is_priority
    }
  });
  const forfeitedDays = shouldForfeitOnChange
    ? calculateForfeitedDaysOnEdit(booking.start_date, booking.end_date, startDate, endDate)
    : 0;
  if (shouldForfeitOnChange && forfeitedDays > 0) {
    const forfeiture = await createPriorityDayForfeitureIfNeeded({
      admin,
      booking,
      reason: "P-Zeit weniger als einen Monat vor Beginn geändert",
      createdBy: user.id,
      forfeitedDays
    });
    if (forfeiture.created) {
      const allRecipients = await getNotificationRecipients(admin);
      await sendBookingNotification({
        to: allRecipients,
        type: "priority_days_forfeited",
        booking,
        partyName: booking.family_parties?.name ?? "Familienpartei",
        forfeitedDays: forfeiture.forfeitedDays
      });
    }
  }

  const conflicts = findBookingConflicts({ requested: requestedBooking, existingBookings: otherBookings });
  for (const conflict of conflicts.filter((item) => item.kind === "priority_displacement")) {
    const affectedRecipients = await getNotificationRecipients(admin, { familyPartyIds: [conflict.booking.family_party_id] });
    const schlichterRecipients = await getNotificationRecipients(admin, { onlySchlichter: true });
    await sendBookingNotification({
      to: [...affectedRecipients, ...schlichterRecipients],
      type: "priority_displacement",
      booking: updatedBooking,
      partyName: booking.family_parties?.name ?? "Familienpartei",
      affectedBooking: conflict.booking,
      affectedPartyName: conflict.booking.family_parties?.name ?? "Betroffene Partei"
    });
  }

  return NextResponse.json({
    message: requiresNewRequest
      ? "Änderung wurde als neue Anfrage gesendet."
      : "Änderung gespeichert.",
    requiresNewRequest,
    warning: overlap.warning
  });
}
