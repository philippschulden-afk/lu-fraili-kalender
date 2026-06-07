import { addMonths, differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import { hasBlockingPriorityConflict } from "@/lib/conflicts";
import type { Booking, PriorityDayForfeiture } from "@/lib/types";

export type RuleBooking = Pick<
  Booking,
  "id" | "family_party_id" | "start_date" | "end_date" | "is_priority" | "shared_stay_allowed" | "status"
>;

export function calculateBookingDays(startDate: string, endDate: string) {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const days = differenceInCalendarDays(end, start) + 1;
  return Math.max(days, 0);
}

export function getPriorityDaysUsed(bookings: RuleBooking[], familyPartyId: string, year: number) {
  return bookings
    .filter((booking) => {
      const bookingYear = parseISO(booking.start_date).getFullYear();
      return (
        booking.family_party_id === familyPartyId &&
        booking.is_priority &&
        bookingYear === year &&
        booking.status === "bestaetigt"
      );
    })
    .reduce((sum, booking) => sum + calculateBookingDays(booking.start_date, booking.end_date), 0);
}

export function getTotalPriorityDaysUsedIncludingForfeitures(
  bookings: RuleBooking[],
  forfeitures: Pick<PriorityDayForfeiture, "family_party_id" | "year" | "forfeited_days">[],
  familyPartyId: string,
  year: number
) {
  const activePriorityDays = getPriorityDaysUsed(bookings, familyPartyId, year);
  const forfeitedDays = forfeitures
    .filter((forfeiture) => forfeiture.family_party_id === familyPartyId && forfeiture.year === year)
    .reduce((sum, forfeiture) => sum + forfeiture.forfeited_days, 0);
  return activePriorityDays + forfeitedDays;
}

export function validatePriorityQuota(input: {
  requestedDays: number;
  usedDays: number;
  quotaDays?: number;
}) {
  const quotaDays = input.quotaDays ?? 42;
  const remainingDays = Math.max(quotaDays - input.usedDays, 0);

  if (input.requestedDays > remainingDays) {
    return {
      valid: false,
      message: `Diese Buchung überschreitet deine verfügbare P-Zeit. Deine Partei hat in diesem Jahr noch ${remainingDays} P-Tage übrig.`
    };
  }

  return { valid: true, remainingDays };
}

export function validateMaxSinglePriorityBooking(requestedDays: number, maxDays = 21) {
  if (requestedDays > maxDays) {
    return {
      valid: false,
      message: `Eine einzelne P-Buchung darf höchstens ${maxDays} Tage lang sein.`
    };
  }

  return { valid: true };
}

export function bookingsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return parseISO(aStart) <= parseISO(bEnd) && parseISO(bStart) <= parseISO(aEnd);
}

export function checkOverlaps(input: {
  requested: Pick<RuleBooking, "family_party_id" | "start_date" | "end_date" | "is_priority" | "shared_stay_allowed">;
  existingBookings: RuleBooking[];
}) {
  const activeBookings = input.existingBookings.filter((booking) =>
    ["angefragt", "bestaetigt", "klaerung"].includes(booking.status)
  );

  const overlaps = activeBookings.filter((booking) =>
    bookingsOverlap(input.requested.start_date, input.requested.end_date, booking.start_date, booking.end_date)
  );

  const blockingPriority = hasBlockingPriorityConflict({
    requested: input.requested,
    existingBookings: overlaps
  });

  if (blockingPriority) {
    return {
      allowed: false,
      warning: null,
      overlaps,
      message: "Der Zeitraum ist bereits durch eine bestätigte P-Zeit belegt."
    };
  }

  const normalOverlap = overlaps.find((booking) => !booking.is_priority);
  if (normalOverlap && !input.requested.shared_stay_allowed) {
    return {
      allowed: true,
      warning:
        "Dieser Zeitraum überschneidet sich mit einer normalen Buchung. Bitte aktiviere „Gemeinsamer Aufenthalt ist möglich“ oder kläre den Zeitraum vorher gemeinsam.",
      overlaps
    };
  }

  return { allowed: true, warning: null, overlaps };
}

export function checkSeptemberWarning(input: {
  startDate: string;
  endDate: string;
  septemberRuleEnabled: boolean;
  familyPartyName?: string | null;
}) {
  if (!input.septemberRuleEnabled) return null;
  const start = parseISO(input.startDate);
  const end = parseISO(input.endDate);
  const touchesSeptember = [start.getFullYear(), end.getFullYear()].some((year) => {
    const first = new Date(year, 8, 1);
    const last = new Date(year, 8, 30);
    return start <= last && first <= end;
  });

  const party = input.familyPartyName?.toLowerCase();
  if (!touchesSeptember || party === "peter" || party === "christoph") return null;

  return "Hinweis: Der September soll bevorzugt Peter und Christoph zur Verfügung stehen. Bitte vorher besonders sorgfältig abstimmen.";
}

export const priorityCancellationForfeitureWarning =
  "Diese bestätigte P-Zeit beginnt in weniger als einem Monat. Wenn du sie jetzt stornierst, werden die P-Tage nicht wieder deinem Jahreskontingent gutgeschrieben.";

export function isLessThanOneMonthBeforeStart(startDate: string, now: Date = new Date()) {
  const start = startOfDay(parseISO(startDate));
  const today = startOfDay(now);
  const oneMonthBeforeStart = addMonths(start, -1);
  return today > oneMonthBeforeStart && today <= start;
}

export function shouldForfeitPriorityDaysOnCancel(
  booking: Pick<Booking, "start_date" | "end_date" | "is_priority" | "status">,
  now: Date = new Date()
) {
  return booking.is_priority && booking.status === "bestaetigt" && isLessThanOneMonthBeforeStart(booking.start_date, now);
}

export function shouldForfeitPriorityDaysOnChange(input: {
  original: Pick<Booking, "start_date" | "end_date" | "is_priority" | "status">;
  updated: Pick<Booking, "start_date" | "end_date" | "is_priority">;
  now?: Date;
}) {
  if (!input.original.is_priority || input.original.status !== "bestaetigt") return false;
  if (!isLessThanOneMonthBeforeStart(input.original.start_date, input.now ?? new Date())) return false;

  if (!input.updated.is_priority) return true;

  return calculateForfeitedDaysOnEdit(
    input.original.start_date,
    input.original.end_date,
    input.updated.start_date,
    input.updated.end_date
  ) > 0;
}

export function calculateForfeitedPriorityDays(booking: Pick<Booking, "start_date" | "end_date" | "is_priority">) {
  if (!booking.is_priority) return 0;
  return calculateBookingDays(booking.start_date, booking.end_date);
}

export function calculateForfeitedDaysOnEdit(oldStart: string, oldEnd: string, newStart: string, newEnd: string) {
  const oldStartDate = parseISO(oldStart);
  const oldEndDate = parseISO(oldEnd);
  const newStartDate = parseISO(newStart);
  const newEndDate = parseISO(newEnd);
  const oldDays = calculateBookingDays(oldStart, oldEnd);

  if (newEndDate < oldStartDate || newStartDate > oldEndDate) return oldDays;

  const overlapStart = newStartDate > oldStartDate ? newStartDate : oldStartDate;
  const overlapEnd = newEndDate < oldEndDate ? newEndDate : oldEndDate;
  const overlappingOriginalDays = calculateBookingDays(
    toDateOnly(overlapStart),
    toDateOnly(overlapEnd)
  );

  return Math.max(oldDays - overlappingOriginalDays, 0);
}

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function hasExistingForfeiture(
  forfeitures: Pick<PriorityDayForfeiture, "booking_id" | "reason">[],
  bookingId: string,
  reason: string
) {
  return forfeitures.some((forfeiture) => forfeiture.booking_id === bookingId && forfeiture.reason === reason);
}

export function canAutoConfirmBooking(input: {
  status: string;
  noticePeriodEndsAt: string | null;
  objectionCount: number;
  now?: Date;
}) {
  if (input.status !== "angefragt" || !input.noticePeriodEndsAt || input.objectionCount > 0) {
    return false;
  }

  return parseISO(input.noticePeriodEndsAt) <= (input.now ?? new Date());
}
