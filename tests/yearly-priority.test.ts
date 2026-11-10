import { describe, expect, it } from "vitest";
import { getPriorityDaysUsed, getTotalPriorityDaysUsedIncludingForfeitures, shouldForfeitPriorityDaysOnCancel, shouldForfeitPriorityDaysOnChange, type RuleBooking } from "@/lib/rules";

const booking: RuleBooking = { id: "booking", family_party_id: "party", start_date: "2026-12-26", end_date: "2027-01-04", is_priority: true, shared_stay_allowed: false, status: "angefragt" };
describe("calendar-year priority quota", () => {
  it.each(["angefragt", "bestaetigt", "klaerung"] as const)("splits %s bookings across calendar years", (status) => {
    expect(getPriorityDaysUsed([{ ...booking, status }], "party", 2026)).toBe(6);
    expect(getPriorityDaysUsed([{ ...booking, status }], "party", 2027)).toBe(3);
    expect(getPriorityDaysUsed([{ ...booking, status }], "party", 2028)).toBe(0);
  });
  it("ignores cancelled bookings but counts forfeitures in the proper year", () => {
    expect(getTotalPriorityDaysUsedIncludingForfeitures([{ ...booking, status: "storniert" }], [{ family_party_id: "party", year: 2027, forfeited_days: 4 }], "party", 2027)).toBe(4);
  });
  it("keeps leap days", () => {
    expect(getPriorityDaysUsed([{ ...booking, start_date: "2028-02-28", end_date: "2028-03-01" }], "party", 2028)).toBe(2);
  });
});
describe("warnings for edited, re-requested priority bookings", () => {
  const protectedBooking = { ...booking, start_date: "2026-06-13", end_date: "2026-06-24", priority_protected_dates: ["2026-06-13", "2026-06-14"], priority_protection_start_date: "2026-06-13" };
  const now = new Date("2026-06-07T12:00:00");
  it("warns before cancellation even while requested again", () => {
    expect(shouldForfeitPriorityDaysOnCancel(protectedBooking, now)).toBe(true);
  });
  it("warns only when previously confirmed days would be lost", () => {
    expect(shouldForfeitPriorityDaysOnChange({ original: protectedBooking, updated: { start_date: "2026-06-15", end_date: "2026-06-24", is_priority: true }, now })).toBe(true);
    expect(shouldForfeitPriorityDaysOnChange({ original: protectedBooking, updated: { start_date: "2026-06-13", end_date: "2026-06-20", is_priority: true }, now })).toBe(false);
  });
});
