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
  return existing.start_date <= requested.end_date && existing.end_date >= requested.start_date;
}

export function hasBlockingPriorityConflict(input: {
  requested: Pick<Booking, "start_date" | "end_date">;
  existingBookings: Pick<Booking, "id" | "start_date" | "end_date" | "is_priority" | "status">[];
  ignoreBookingId?: string;
}) {
  return input.existingBookings.some(
    (booking) =>
      booking.id !== input.ignoreBookingId &&
      booking.status === "bestaetigt" &&
      booking.is_priority &&
      isOverlappingBooking(input.requested, booking)
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
    if (booking.status === "bestaetigt" && booking.is_priority) {
      return { booking, kind: "confirmed_priority", blocks: true };
    }

    if (
      input.requested.is_priority &&
      booking.family_party_id !== input.requested.family_party_id &&
      booking.status === "bestaetigt" &&
      !booking.is_priority
    ) {
      return { booking, kind: "priority_displacement", blocks: false };
    }

    return { booking, kind: "normal_overlap", blocks: false };
  });
}

export function hasBlockingConflict(conflicts: ConflictInfo[]) {
  return conflicts.some((conflict) => conflict.blocks);
}
