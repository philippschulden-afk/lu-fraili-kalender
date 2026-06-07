import { addDays, differenceInCalendarDays, isBefore, isWithinInterval, parseISO } from "date-fns";
import type { Booking } from "@/lib/types";

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
        ["angefragt", "bestaetigt", "klaerung"].includes(booking.status)
      );
    })
    .reduce((sum, booking) => sum + calculateBookingDays(booking.start_date, booking.end_date), 0);
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

  const blockingPriority = overlaps.find(
    (booking) => booking.family_party_id !== input.requested.family_party_id && booking.is_priority && booking.status === "bestaetigt"
  );

  if (blockingPriority) {
    return {
      allowed: false,
      warning: null,
      overlaps,
      message: "Dieser Zeitraum überschneidet sich mit einer bestätigten P-Zeit einer anderen Partei."
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
    return isWithinInterval(first, { start, end }) || isWithinInterval(last, { start, end }) || (start <= first && end >= last);
  });

  const party = input.familyPartyName?.toLowerCase();
  if (!touchesSeptember || party === "peter" || party === "christoph") return null;

  return "Hinweis: Der September soll bevorzugt Peter und Christoph zur Verfügung stehen. Bitte vorher besonders sorgfältig abstimmen.";
}

export function checkCancellationWarning(input: {
  startDate: string;
  isPriority: boolean;
  status: string;
  today?: Date;
}) {
  if (!input.isPriority || input.status !== "bestaetigt") return null;
  const today = input.today ?? new Date();
  const twoMonthsAhead = addDays(today, 60);
  if (isBefore(parseISO(input.startDate), twoMonthsAhead)) {
    return "Diese P-Zeit wird weniger als zwei Monate vor Beginn storniert. Bitte nur stornieren, wenn es wirklich notwendig ist.";
  }
  return null;
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
