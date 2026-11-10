import { addDays, format, parseISO } from "date-fns";
import { calculateBookingDays } from "@/lib/rules";
import type { Booking } from "@/lib/types";

// Ranges run from arrival to checkout; a free period ends on its checkout date.
export function calculateFreePeriods(bookings: Booking[], yearStart: string, yearEndExclusive: string) {
  const ranges = bookings.flatMap((booking) => {
    if (["storniert", "abgelehnt"].includes(booking.status)) return [];
    if (booking.status === "bestaetigt" || (booking.status === "klaerung" && booking.confirmed_at)) {
      return [{ start: booking.start_date, end: booking.end_date }];
    }
    return (booking.priority_protected_dates ?? []).map((day) => ({
      start: day,
      end: format(addDays(parseISO(day), 1), "yyyy-MM-dd"),
    }));
  }).map((range) => ({
    start: range.start < yearStart ? yearStart : range.start,
    end: range.end > yearEndExclusive ? yearEndExclusive : range.end,
  })).filter((range) => range.start < range.end).sort((a, b) => a.start.localeCompare(b.start));

  const freePeriods: Array<{ start: string; end: string }> = [];
  let cursor = yearStart;
  for (const range of ranges) {
    if (calculateBookingDays(cursor, range.start) >= 7) freePeriods.push({ start: cursor, end: range.start });
    if (range.end > cursor) cursor = range.end;
  }
  if (calculateBookingDays(cursor, yearEndExclusive) >= 7) freePeriods.push({ start: cursor, end: yearEndExclusive });
  return freePeriods;
}
