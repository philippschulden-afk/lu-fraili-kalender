import { describe, expect, it } from "vitest";
import { findBookingConflicts, hasBlockingPriorityConflict } from "@/lib/conflicts";
import { calculateFreePeriods } from "@/lib/planning";
import { calculateBookingDays, calculateForfeitedDaysOnEdit, checkSeptemberWarning, getPriorityDaysUsed, shouldForfeitPriorityDaysOnChange } from "@/lib/rules";
import type { Booking } from "@/lib/types";

const booking: Booking = {
  id: "booking", created_by: "owner", family_party_id: "one", start_date: "2026-06-13", end_date: "2026-06-20",
  is_priority: true, shared_stay_allowed: false, status: "bestaetigt", comment: null,
  notice_period_ends_at: null, confirmed_at: "2026-01-01", cancelled_at: null, created_at: "2026-01-01", updated_at: "2026-01-01",
};

describe("overnight boundaries", () => {
  it.each([true, false])("permits same-day turnover for priority=%s without sharing permission", (is_priority) => {
    for (const [start_date, end_date] of [["2026-06-20", "2026-06-27"], ["2026-06-06", "2026-06-13"]]) {
      const requested = { ...booking, family_party_id: "two", start_date, end_date, is_priority };
      expect(findBookingConflicts({ requested, existingBookings: [booking] })).toEqual([]);
      expect(hasBlockingPriorityConflict({ requested, existingBookings: [booking] })).toBe(false);
    }
  });

  it("still blocks a genuinely shared night", () => {
    const requested = { ...booking, start_date: "2026-06-19", end_date: "2026-06-21" };
    expect(hasBlockingPriorityConflict({ requested, existingBookings: [booking] })).toBe(true);
  });

  it("counts 21 nights as 21 P-days", () => {
    expect(calculateBookingDays("2026-06-01", "2026-06-22")).toBe(21);
  });

  it("does not count checkout on September 1 as a September stay", () => {
    expect(checkSeptemberWarning({ startDate: "2026-08-25", endDate: "2026-09-01", septemberRuleEnabled: true, familyPartyName: "Teresa" })).toBeNull();
    expect(checkSeptemberWarning({ startDate: "2026-09-30", endDate: "2026-10-01", septemberRuleEnabled: true, familyPartyName: "Teresa" })).not.toBeNull();
  });

  it("assigns the New Year's Eve night only to the year in which it starts", () => {
    const acrossYear = { ...booking, start_date: "2026-12-31", end_date: "2027-01-01" };
    expect(getPriorityDaysUsed([acrossYear], "one", 2026)).toBe(1);
    expect(getPriorityDaysUsed([acrossYear], "one", 2027)).toBe(0);
  });

  it("forfeits a protected final night when checkout moves earlier", () => {
    expect(shouldForfeitPriorityDaysOnChange({ original: { ...booking, priority_protected_dates: ["2026-06-19"] }, updated: { ...booking, end_date: "2026-06-19" }, now: new Date("2026-06-07T12:00:00") })).toBe(true);
    expect(calculateForfeitedDaysOnEdit(booking.start_date, booking.end_date, booking.start_date, "2026-06-19")).toBe(1);
  });
});

describe("free overnight periods", () => {
  it("includes exactly seven free nights up to another party's arrival", () => {
    const result = calculateFreePeriods([{ ...booking, start_date: "2026-01-08", end_date: "2026-01-15" }], "2026-01-01", "2027-01-01");
    expect(result).toEqual([{ start: "2026-01-01", end: "2026-01-08" }, { start: "2026-01-15", end: "2027-01-01" }]);
  });

  it("does not offer a previously confirmed stay as free while displacement is unresolved", () => {
    const result = calculateFreePeriods([{ ...booking, status: "klaerung" }], "2026-06-13", "2026-06-27");
    expect(result).toEqual([{ start: "2026-06-20", end: "2026-06-27" }]);
  });

  it("does not block free periods for ordinary unconfirmed requests", () => {
    expect(calculateFreePeriods([{ ...booking, status: "angefragt", confirmed_at: null }], "2026-06-13", "2026-06-27")).toEqual([{ start: "2026-06-13", end: "2026-06-27" }]);
  });
});
