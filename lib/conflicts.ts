import type { Booking } from "@/lib/types";

export type ConflictInfo = {
  booking: Booking;
  kind: "confirmed_priority" | "normal_overlap" | "priority_displacement";
  blocks: boolean;
};

export function isOverlappingBooking(
  requested: Pick<Booking, "start_date" | "end_date">,
  existing: Pick<Booking, "start_date" | "end_date">
) {
  return requested.start_date < requested.end_date && existing.start_date < existing.end_date &&
    existing.start_date < requested.end_date && existing.end_date > requested.start_date;
}

export function hasBlockingPriorityConflict(input: {
  requested: Pick<Booking, "start_date" | "end_date">;
  existingBookings: Pick<Booking, "id" | "start_date" | "end_date" | "is_priority" | "status" | "priority_protected_dates">[];
  ignoreBookingId?: string;
}) {
  return input.existingBookings.some(
    (booking) =>
      booking.id !== input.ignoreBookingId &&
      ["angefragt", "bestaetigt", "klaerung"].includes(booking.status) &&
      booking.is_priority &&
      ((booking.status === "bestaetigt" && isOverlappingBooking(input.requested, booking)) ||
        (booking.priority_protected_dates ?? []).some((day) => day >= input.requested.start_date && day < input.requested.end_date))
  );
}

export function findBookingConflicts(input: {
  requested: Pick<Booking, "family_party_id" | "start_date" | "end_date" | "is_priority" | "shared_stay_allowed">;
  existingBookings: Booking[];
  ignoreBookingId?: string;
}) {
  const activeBookings = input.existingBookings.filter(
    (booking) =>
      booking.id !== input.ignoreBookingId &&
      ["angefragt", "bestaetigt", "klaerung"].includes(booking.status) &&
      isOverlappingBooking(input.requested, booking)
  );

  return activeBookings.map((booking): ConflictInfo => {
    if (hasBlockingPriorityConflict({ requested: input.requested, existingBookings: [booking] })) {
      return { booking, kind: "confirmed_priority", blocks: true };
    }

    if (
      input.requested.is_priority &&
      booking.family_party_id !== input.requested.family_party_id &&
      (booking.status === "bestaetigt" || (booking.status === "klaerung" && Boolean(booking.confirmed_at))) &&
      !booking.is_priority
    ) {
      return { booking, kind: "priority_displacement", blocks: false };
    }

    const blocks = !input.requested.is_priority && !booking.is_priority &&
      booking.family_party_id !== input.requested.family_party_id &&
      (!input.requested.shared_stay_allowed || !booking.shared_stay_allowed);
    return { booking, kind: "normal_overlap", blocks };
  });
}

export function hasBlockingConflict(conflicts: ConflictInfo[]) {
  return conflicts.some((conflict) => conflict.blocks);
}
