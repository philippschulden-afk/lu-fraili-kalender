import { describe, expect, it } from "vitest";
import { findBookingConflicts, hasBlockingPriorityConflict, isOverlappingBooking } from "@/lib/conflicts";
import {
  bookingsOverlap,
  calculateBookingDays,
  canAutoConfirmBooking,
  checkOverlaps,
  checkSeptemberWarning,
  calculateForfeitedPriorityDays,
  calculateForfeitedDaysOnEdit,
  getPriorityDaysUsed,
  getTotalPriorityDaysUsedIncludingForfeitures,
  hasExistingForfeiture,
  isLessThanOneMonthBeforeStart,
  shouldForfeitPriorityDaysOnCancel,
  shouldForfeitPriorityDaysOnChange,
  validateMaxSinglePriorityBooking,
  validatePriorityQuota
} from "@/lib/rules";
import type { RuleBooking } from "@/lib/rules";
import type { Booking } from "@/lib/types";

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

const conflictBookings = [
  {
    id: "confirmed-p",
    family_party_id: "peter",
    created_by: "user-1",
    start_date: "2026-08-01",
    end_date: "2026-08-14",
    is_priority: true,
    shared_stay_allowed: false,
    status: "bestaetigt",
    comment: null,
    notice_period_ends_at: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  },
  {
    id: "requested-p",
    family_party_id: "christoph",
    created_by: "user-2",
    start_date: "2026-09-01",
    end_date: "2026-09-10",
    is_priority: true,
    shared_stay_allowed: false,
    status: "angefragt",
    comment: null,
    notice_period_ends_at: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  },
  {
    id: "normal",
    family_party_id: "partei-3",
    created_by: "user-3",
    start_date: "2026-10-01",
    end_date: "2026-10-10",
    is_priority: false,
    shared_stay_allowed: false,
    status: "bestaetigt",
    comment: null,
    notice_period_ends_at: null,
    confirmed_at: null,
    cancelled_at: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01"
  }
] satisfies Booking[];

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

  it("rejects an overlap with any confirmed P booking", () => {
    const requested = {
      family_party_id: "peter",
      start_date: "2026-08-05",
      end_date: "2026-08-07",
      is_priority: true,
      shared_stay_allowed: true
    };

    expect(isOverlappingBooking(requested, conflictBookings[0])).toBe(true);
    expect(hasBlockingPriorityConflict({ requested, existingBookings: conflictBookings })).toBe(true);
    expect(findBookingConflicts({ requested, existingBookings: conflictBookings })[0]).toMatchObject({
      kind: "confirmed_priority",
      blocks: true
    });
  });

  it("treats overlapping requested P bookings as warning only", () => {
    const conflicts = findBookingConflicts({
      requested: {
        family_party_id: "peter",
        start_date: "2026-09-05",
        end_date: "2026-09-07",
        is_priority: true,
        shared_stay_allowed: false
      },
      existingBookings: conflictBookings
    });

    expect(hasBlockingPriorityConflict({ requested: { start_date: "2026-09-05", end_date: "2026-09-07" }, existingBookings: conflictBookings })).toBe(false);
    expect(conflicts[0]).toMatchObject({ kind: "normal_overlap", blocks: false });
  });

  it("treats overlapping normal bookings as warning only", () => {
    const conflicts = findBookingConflicts({
      requested: {
        family_party_id: "peter",
        start_date: "2026-10-05",
        end_date: "2026-10-07",
        is_priority: false,
        shared_stay_allowed: false
      },
      existingBookings: conflictBookings
    });

    expect(hasBlockingPriorityConflict({ requested: { start_date: "2026-10-05", end_date: "2026-10-07" }, existingBookings: conflictBookings })).toBe(false);
    expect(conflicts[0]).toMatchObject({ kind: "normal_overlap", blocks: false });
  });

  it("allows non-overlapping P bookings", () => {
    const requested = {
      family_party_id: "peter",
      start_date: "2026-11-01",
      end_date: "2026-11-07",
      is_priority: true,
      shared_stay_allowed: false
    };

    expect(hasBlockingPriorityConflict({ requested, existingBookings: conflictBookings })).toBe(false);
    expect(findBookingConflicts({ requested, existingBookings: conflictBookings })).toHaveLength(0);
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

  it("forfeits confirmed P-days for 2026-06-13 when today is 2026-06-07", () => {
    expect(
      shouldForfeitPriorityDaysOnCancel(
        {
          start_date: "2026-06-13",
          end_date: "2026-06-20",
          is_priority: true,
          status: "bestaetigt"
        },
        new Date("2026-06-07T00:00:00Z")
      )
    ).toBe(true);
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

  it("does not forfeit original P-days when a late edit only extends the booking", () => {
    expect(calculateForfeitedDaysOnEdit("2026-06-13", "2026-06-20", "2026-06-13", "2026-06-24")).toBe(0);
    expect(
      shouldForfeitPriorityDaysOnChange({
        original: { start_date: "2026-06-13", end_date: "2026-06-20", is_priority: true, status: "bestaetigt" },
        updated: { start_date: "2026-06-13", end_date: "2026-06-24", is_priority: true },
        now: new Date("2026-06-01T00:00:00Z")
      })
    ).toBe(false);
  });

  it("forfeits only original P-days no longer covered when shifted later", () => {
    expect(calculateForfeitedDaysOnEdit("2026-06-13", "2026-06-20", "2026-06-16", "2026-06-23")).toBe(3);
  });

  it("forfeits only removed original P-days when shortened", () => {
    expect(calculateForfeitedDaysOnEdit("2026-06-13", "2026-06-20", "2026-06-13", "2026-06-17")).toBe(3);
  });

  it("forfeits all original P-days when moved to a non-overlapping range", () => {
    expect(calculateForfeitedDaysOnEdit("2026-06-13", "2026-06-20", "2026-07-01", "2026-07-08")).toBe(8);
  });

  it("forfeits all original P-days when P-Zeit is removed less than one month before start", () => {
    expect(
      shouldForfeitPriorityDaysOnChange({
        original: { start_date: "2026-06-13", end_date: "2026-06-20", is_priority: true, status: "bestaetigt" },
        updated: { start_date: "2026-06-13", end_date: "2026-06-20", is_priority: false },
        now: new Date("2026-06-01T00:00:00Z")
      })
    ).toBe(true);
  });
});
