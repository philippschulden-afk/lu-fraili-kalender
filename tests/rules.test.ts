import { describe, expect, it } from "vitest";
import {
  bookingsOverlap,
  calculateBookingDays,
  canAutoConfirmBooking,
  checkCancellationWarning,
  checkOverlaps,
  checkSeptemberWarning,
  calculateForfeitedPriorityDays,
  getPriorityDaysUsed,
  getTotalPriorityDaysUsedIncludingForfeitures,
  hasExistingForfeiture,
  isLessThanOneMonthBeforeStart,
  shouldForfeitPriorityDaysOnCancel,
  validateMaxSinglePriorityBooking,
  validatePriorityQuota
} from "@/lib/rules";
import type { RuleBooking } from "@/lib/rules";

const bookings: RuleBooking[] = [
  {
    id: "1",
    family_party_id: "peter",
    start_date: "2026-08-01",
    end_date: "2026-08-14",
    is_priority: true,
    shared_stay_allowed: false,
    status: "bestaetigt"
  },
  {
    id: "2",
    family_party_id: "christoph",
    start_date: "2026-06-01",
    end_date: "2026-06-07",
    is_priority: false,
    shared_stay_allowed: true,
    status: "bestaetigt"
  }
];

describe("booking rules", () => {
  it("counts booking days including start and end date", () => {
    expect(calculateBookingDays("2026-08-03", "2026-08-17")).toBe(15);
  });

  it("calculates used priority days for one party and year", () => {
    expect(getPriorityDaysUsed(bookings, "peter", 2026)).toBe(14);
  });

  it("blocks priority quota over 42 days", () => {
    const result = validatePriorityQuota({ requestedDays: 13, usedDays: 30 });
    expect(result.valid).toBe(false);
    expect(result.message).toContain("noch 12 P-Tage");
  });

  it("blocks single priority bookings over 21 days", () => {
    expect(validateMaxSinglePriorityBooking(22).valid).toBe(false);
    expect(validateMaxSinglePriorityBooking(21).valid).toBe(true);
  });

  it("detects overlapping ranges", () => {
    expect(bookingsOverlap("2026-08-10", "2026-08-20", "2026-08-01", "2026-08-14")).toBe(true);
    expect(bookingsOverlap("2026-08-15", "2026-08-20", "2026-08-01", "2026-08-14")).toBe(false);
  });

  it("blocks overlaps with confirmed priority bookings from another party", () => {
    const result = checkOverlaps({
      requested: {
        family_party_id: "christoph",
        start_date: "2026-08-10",
        end_date: "2026-08-12",
        is_priority: false,
        shared_stay_allowed: true
      },
      existingBookings: bookings
    });
    expect(result.allowed).toBe(false);
  });

  it("warns for normal overlapping bookings when shared stay is not enabled", () => {
    const result = checkOverlaps({
      requested: {
        family_party_id: "peter",
        start_date: "2026-06-02",
        end_date: "2026-06-03",
        is_priority: false,
        shared_stay_allowed: false
      },
      existingBookings: bookings
    });
    expect(result.allowed).toBe(true);
    expect(result.warning).toContain("überschneidet");
  });

  it("shows the September warning for parties other than Peter and Christoph", () => {
    expect(
      checkSeptemberWarning({
        startDate: "2026-09-10",
        endDate: "2026-09-20",
        septemberRuleEnabled: true,
        familyPartyName: "Partei 3"
      })
    ).toContain("September");
  });

  it("shows a fairness warning for late confirmed priority cancellations", () => {
    expect(
      checkCancellationWarning({
        startDate: "2026-07-01",
        isPriority: true,
        status: "bestaetigt",
        today: new Date("2026-06-01T00:00:00Z")
      })
    ).toContain("weniger als zwei Monate");
  });

  it("allows automatic confirmation only after the notice period and without objections", () => {
    expect(
      canAutoConfirmBooking({
        status: "angefragt",
        noticePeriodEndsAt: "2026-06-04T00:00:00Z",
        objectionCount: 0,
        now: new Date("2026-06-05T00:00:00Z")
      })
    ).toBe(true);
    expect(
      canAutoConfirmBooking({
        status: "angefragt",
        noticePeriodEndsAt: "2026-06-04T00:00:00Z",
        objectionCount: 1,
        now: new Date("2026-06-05T00:00:00Z")
      })
    ).toBe(false);
  });

  it("does not forfeit P-days when cancelling more than one month before start", () => {
    expect(
      shouldForfeitPriorityDaysOnCancel(
        {
          start_date: "2026-08-01",
          end_date: "2026-08-14",
          is_priority: true,
          status: "bestaetigt"
        },
        new Date("2026-06-30T00:00:00Z")
      )
    ).toBe(false);
  });

  it("forfeits P-days when cancelling less than one month before start", () => {
    expect(isLessThanOneMonthBeforeStart("2026-08-01", new Date("2026-07-15T00:00:00Z"))).toBe(true);
    expect(
      shouldForfeitPriorityDaysOnCancel(
        {
          start_date: "2026-08-01",
          end_date: "2026-08-14",
          is_priority: true,
          status: "bestaetigt"
        },
        new Date("2026-07-15T00:00:00Z")
      )
    ).toBe(true);
    expect(calculateForfeitedPriorityDays(bookings[0])).toBe(14);
  });

  it("counts forfeited days toward the annual quota", () => {
    expect(
      getTotalPriorityDaysUsedIncludingForfeitures(
        bookings,
        [{ family_party_id: "peter", year: 2026, forfeited_days: 7 }],
        "peter",
        2026
      )
    ).toBe(21);
  });

  it("detects duplicate forfeitures for the same booking and reason", () => {
    expect(
      hasExistingForfeiture(
        [{ booking_id: "1", reason: "P-Zeit weniger als einen Monat vor Beginn storniert" }],
        "1",
        "P-Zeit weniger als einen Monat vor Beginn storniert"
      )
    ).toBe(true);
  });

  it("never forfeits non-P bookings or unconfirmed P-bookings on cancel", () => {
    expect(
      shouldForfeitPriorityDaysOnCancel(
        { start_date: "2026-08-01", end_date: "2026-08-14", is_priority: false, status: "bestaetigt" },
        new Date("2026-07-15T00:00:00Z")
      )
    ).toBe(false);
    expect(
      shouldForfeitPriorityDaysOnCancel(
        { start_date: "2026-08-01", end_date: "2026-08-14", is_priority: true, status: "angefragt" },
        new Date("2026-07-15T00:00:00Z")
      )
    ).toBe(false);
  });
});
