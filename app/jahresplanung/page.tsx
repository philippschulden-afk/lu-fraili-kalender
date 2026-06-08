import { addDays, format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import Link from "next/link";
import { PageShell, requireProfile } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { formatGermanDate, formatGermanRange } from "@/lib/date-format";
import { calculateBookingDays, getPriorityDaysUsed } from "@/lib/rules";
import type { Booking, FamilyParty, PriorityDayForfeiture } from "@/lib/types";

const months = Array.from({ length: 12 }, (_, index) => index);
const priorityQuotaDays = 42;

export default async function JahresplanungPage({
  searchParams
}: {
  searchParams: { year?: string };
}) {
  const { supabase } = await requireProfile();
  const selectedYear = parseYearParam(searchParams.year) ?? new Date().getFullYear();
  const yearStart = `${selectedYear}-01-01`;
  const yearEnd = `${selectedYear}-12-31`;
  const todayIso = toDateOnlyIso(new Date());

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .lte("start_date", yearEnd)
    .gte("end_date", yearStart)
    .order("start_date", { ascending: true })
    .returns<Booking[]>();

  const { data: familyPartiesData } = await supabase
    .from("family_parties")
    .select("*")
    .order("name", { ascending: true })
    .returns<FamilyParty[]>();

  const { data: forfeituresData } = await supabase
    .from("priority_day_forfeitures")
    .select("*")
    .eq("year", selectedYear)
    .returns<PriorityDayForfeiture[]>();

  const bookings = bookingsData ?? [];
  const familyParties = familyPartiesData ?? [];
  const forfeitures = forfeituresData ?? [];
  const freePeriods = calculateFreePeriods(bookings, yearStart, yearEnd);
  const nextStays = bookings
    .filter((booking) => booking.end_date >= todayIso)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 5);

  return (
    <PageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-teal-950">Jahresplanung {selectedYear}</h1>
          <p className="mt-2 max-w-3xl text-lg text-gray-700">
            Der einfache Überblick über das ganze Jahr: Buchungen, P-Zeiten und freie Zeiträume.
          </p>
        </div>
        <Link className="rounded-lg border border-teal-200 bg-white px-4 py-3 text-center font-bold text-teal-900 hover:bg-teal-50" href="/kalender">
          Monatskalender ansehen
        </Link>
      </div>

      <section className="mt-5 rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="rounded-lg border border-teal-700 bg-white px-4 py-3 text-center font-bold text-teal-900 hover:bg-teal-50"
            href={yearHref(selectedYear - 1)}
          >
            Vorjahr
          </Link>
          <p className="text-center text-2xl font-bold text-teal-950">{selectedYear}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              className="rounded-lg border border-teal-700 bg-white px-4 py-3 text-center font-bold text-teal-900 hover:bg-teal-50"
              href={yearHref(selectedYear + 1)}
            >
              Nächstes Jahr
            </Link>
            <Link className="rounded-lg bg-teal-700 px-5 py-3 text-center font-bold text-white hover:bg-teal-800" href={yearHref(new Date().getFullYear())}>
              Aktuelles Jahr
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">P-Tage {selectedYear}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {familyParties.length ? (
            familyParties.map((party) => {
              const activeDays = getPriorityDaysUsed(bookings, party.id, selectedYear);
              const forfeitedDays = forfeitures
                .filter((forfeiture) => forfeiture.family_party_id === party.id)
                .reduce((sum, forfeiture) => sum + forfeiture.forfeited_days, 0);
              const totalUsed = activeDays + forfeitedDays;
              const remainingDays = Math.max(priorityQuotaDays - totalUsed, 0);
              return (
                <div key={party.id} className="rounded-lg border border-teal-100 bg-paper p-4">
                  <p className="text-xl font-bold text-teal-950">{party.name}</p>
                  <p className="mt-2 text-lg">
                    {forfeitedDays > 0
                      ? `${activeDays} aktiv + ${forfeitedDays} verfallen = ${totalUsed} / ${priorityQuotaDays} genutzt`
                      : `${totalUsed} / ${priorityQuotaDays} genutzt`}
                  </p>
                  <p className="mt-1 text-gray-700">{remainingDays} verbleibend</p>
                </div>
              );
            })
          ) : (
            <p className="rounded-lg bg-paper p-4 text-lg">Noch keine Familienparteien angelegt.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold text-teal-950">Nächste Aufenthalte</h2>
        <div className="mt-4 grid gap-3">
          {nextStays.length ? (
            nextStays.map((booking) => <CompactBookingRow key={booking.id} booking={booking} />)
          ) : (
            <p className="rounded-lg border border-teal-100 bg-white p-4 text-lg">Keine nächsten Aufenthalte gefunden.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold text-teal-950">Freie Zeiträume</h2>
        <div className="mt-4 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
          {freePeriods.length ? (
            <ul className="space-y-2 text-lg">
              {freePeriods.map((period) => (
                <li key={`${period.start}-${period.end}`} className="rounded-lg bg-paper p-3 font-semibold">
                  {formatGermanDate(period.start)}-{formatGermanDate(period.end)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg">Keine größeren freien Zeiträume gefunden.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold text-teal-950">Monate</h2>
        {!bookings.length ? <p className="mt-4 rounded-lg border border-teal-100 bg-white p-4 text-lg">Noch keine Buchungen für dieses Jahr.</p> : null}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {months.map((monthIndex) => {
            const monthStart = `${selectedYear}-${String(monthIndex + 1).padStart(2, "0")}-01`;
            const monthEnd = toDateOnlyIso(new Date(selectedYear, monthIndex + 1, 0));
            const monthBookings = bookings.filter((booking) => overlapsRange(booking.start_date, booking.end_date, monthStart, monthEnd));
            return (
              <section key={monthIndex} className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
                <h3 className="text-2xl font-bold text-teal-950">{format(new Date(selectedYear, monthIndex, 1), "MMMM yyyy", { locale: de })}</h3>
                <div className="mt-4 space-y-3">
                  {monthBookings.length ? (
                    monthBookings.map((booking) => <MonthBookingEntry key={booking.id} booking={booking} />)
                  ) : (
                    <p className="rounded-lg bg-paper p-3 text-lg">Keine Buchungen.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
}

function CompactBookingRow({ booking }: { booking: Booking }) {
  return (
    <Link href={`/buchung/${booking.id}`} className="block rounded-lg border border-teal-100 bg-white p-4 shadow-sm hover:bg-teal-50">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-bold text-teal-950">{booking.family_parties?.name ?? "Familienpartei"}</p>
          <p className="mt-1 text-gray-700">
            {formatGermanDate(booking.start_date)} bis {formatGermanDate(booking.end_date)} · P-Zeit: {booking.is_priority ? "Ja" : "Nein"}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>
    </Link>
  );
}

function MonthBookingEntry({ booking }: { booking: Booking }) {
  return (
    <div className="rounded-lg border border-teal-100 bg-paper p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-bold text-teal-950">
            {formatGermanRange(booking.start_date, booking.end_date)} · {booking.family_parties?.name ?? "Familienpartei"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {booking.is_priority ? <span className="rounded bg-teal-800 px-2 py-1 text-sm font-bold text-white">P</span> : null}
            <StatusBadge status={booking.status} />
          </div>
          {booking.comment ? <p className="mt-3 text-sm text-gray-500">{booking.comment}</p> : null}
        </div>
        <Link href={`/buchung/${booking.id}`} className="rounded-lg bg-teal-700 px-4 py-3 text-center font-bold text-white hover:bg-teal-800">
          Details
        </Link>
      </div>
    </div>
  );
}

function calculateFreePeriods(bookings: Booking[], yearStart: string, yearEnd: string) {
  const confirmedRanges = bookings
    .filter((booking) => booking.status === "bestaetigt")
    .map((booking) => ({
      start: booking.start_date < yearStart ? yearStart : booking.start_date,
      end: booking.end_date > yearEnd ? yearEnd : booking.end_date
    }))
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.start.localeCompare(b.start));

  const mergedRanges: Array<{ start: string; end: string }> = [];
  for (const range of confirmedRanges) {
    const previous = mergedRanges.at(-1);
    if (!previous) {
      mergedRanges.push({ ...range });
      continue;
    }

    const dayAfterPrevious = toDateOnlyIso(addDays(parseISO(previous.end), 1));
    if (range.start <= dayAfterPrevious) {
      if (range.end > previous.end) previous.end = range.end;
    } else {
      mergedRanges.push({ ...range });
    }
  }

  const freePeriods: Array<{ start: string; end: string }> = [];
  let cursor = yearStart;
  for (const range of mergedRanges) {
    const freeEnd = toDateOnlyIso(addDays(parseISO(range.start), -1));
    addFreePeriodIfLargeEnough(freePeriods, cursor, freeEnd);
    cursor = toDateOnlyIso(addDays(parseISO(range.end), 1));
  }
  addFreePeriodIfLargeEnough(freePeriods, cursor, yearEnd);

  return freePeriods;
}

function addFreePeriodIfLargeEnough(periods: Array<{ start: string; end: string }>, start: string, end: string) {
  if (start <= end && calculateBookingDays(start, end) >= 7) {
    periods.push({ start, end });
  }
}

function overlapsRange(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

function parseYearParam(value?: string) {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  return year;
}

function yearHref(year: number) {
  return `/jahresplanung?year=${year}`;
}

function toDateOnlyIso(date: Date) {
  return format(date, "yyyy-MM-dd");
}
