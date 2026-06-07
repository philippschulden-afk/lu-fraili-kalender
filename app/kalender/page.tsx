import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek
} from "date-fns";
import { de } from "date-fns/locale";
import Link from "next/link";
import { PageShell, requireProfile } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { formatGermanDate } from "@/lib/date-format";
import { statusClasses, statusLabels } from "@/lib/status";
import type { Booking, BookingStatus } from "@/lib/types";

const filters = [
  ["alle", "Alle Buchungen"],
  ["bestaetigt", "Nur bestätigte Buchungen"],
  ["angefragt", "Nur Anfragen"],
  ["meine", "Nur meine Partei"],
  ["p", "Nur P-Zeiten"]
];

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const compactStatusClasses: Record<BookingStatus, string> = {
  angefragt: "bg-blue-100 text-blue-900 border-blue-200",
  bestaetigt: "bg-green-100 text-green-900 border-green-200",
  klaerung: "bg-orange-100 text-orange-950 border-orange-200",
  storniert: "bg-gray-100 text-gray-800 border-gray-200",
  abgelehnt: "bg-red-100 text-red-900 border-red-200"
};

export default async function CalendarPage({
  searchParams
}: {
  searchParams: { filter?: string; month?: string; day?: string };
}) {
  const { supabase, profile } = await requireProfile();
  const selectedFilter = searchParams.filter ?? "alle";
  const visibleMonth = parseMonthParam(searchParams.month) ?? startOfMonth(new Date());
  const monthStart = startOfMonth(visibleMonth);
  const monthEnd = endOfMonth(visibleMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const gridDays = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const selectedDay = parseDayParam(searchParams.day) ?? (isSameMonth(new Date(), visibleMonth) ? new Date() : monthStart);
  const selectedDayIso = toDateOnlyIso(selectedDay);

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .lte("start_date", toDateOnlyIso(monthEnd))
    .gte("end_date", toDateOnlyIso(monthStart))
    .order("start_date", { ascending: true })
    .returns<Booking[]>();
  const safeBookings = bookingsData ?? [];

  const visibleBookings = safeBookings.filter((booking) => {
    if (selectedFilter === "bestaetigt") return booking.status === "bestaetigt";
    if (selectedFilter === "angefragt") return booking.status === "angefragt";
    if (selectedFilter === "meine") return booking.family_party_id === profile?.family_party_id;
    if (selectedFilter === "p") return booking.is_priority;
    return true;
  });

  const selectedDayBookings = bookingsForDay(visibleBookings, selectedDayIso);
  const previousMonth = addMonths(visibleMonth, -1);
  const nextMonth = addMonths(visibleMonth, 1);

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-teal-950">Kalender</h1>

      <section className="mt-5 rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={calendarHref({ month: toMonthParam(previousMonth), filter: selectedFilter })}
              className="focus-ring rounded-lg border border-teal-700 bg-white px-4 py-3 text-center font-bold text-teal-900"
            >
              Vorheriger Monat
            </Link>
            <h2 className="text-center text-2xl font-bold text-teal-950 sm:min-w-64">
              {format(visibleMonth, "MMMM yyyy", { locale: de })}
            </h2>
            <Link
              href={calendarHref({ month: toMonthParam(nextMonth), filter: selectedFilter })}
              className="focus-ring rounded-lg border border-teal-700 bg-white px-4 py-3 text-center font-bold text-teal-900"
            >
              Nächster Monat
            </Link>
          </div>
          <Link
            href={calendarHref({ month: toMonthParam(new Date()), day: toDateOnlyIso(new Date()), filter: selectedFilter })}
            className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-center font-bold text-white"
          >
            Heute
          </Link>
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={calendarHref({ month: toMonthParam(visibleMonth), day: selectedDayIso, filter: value })}
            className={`rounded-lg border px-4 py-3 font-bold ${selectedFilter === value ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-950"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-2xl font-bold text-teal-950">Monatsansicht</h2>
        <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-2">
          {weekdays.map((weekday) => (
            <div key={weekday} className="rounded-md bg-teal-800 px-1 py-2 text-center text-sm font-bold text-white sm:text-base">
              {weekday}
            </div>
          ))}
          {gridDays.map((day) => {
            const dayIso = toDateOnlyIso(day);
            const dayBookings = bookingsForDay(visibleBookings, dayIso);
            const currentMonthDay = isSameMonth(day, visibleMonth);
            const selected = dayIso === selectedDayIso;
            return (
              <Link
                key={dayIso}
                href={calendarHref({ month: toMonthParam(visibleMonth), day: dayIso, filter: selectedFilter })}
                className={`min-h-28 rounded-lg border p-1.5 transition sm:min-h-36 sm:p-3 ${
                  selected ? "border-teal-700 bg-teal-50 ring-2 ring-teal-300" : "border-teal-100 bg-white hover:border-teal-300"
                } ${currentMonthDay ? "" : "bg-gray-50 text-gray-500"}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-bold sm:text-base">{format(day, "d.")}</span>
                  {isToday(day) ? <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-900">Heute</span> : null}
                </div>
                <div className="mt-2 space-y-1">
                  {dayBookings.slice(0, 2).map((booking) => (
                    <CalendarBookingPill key={booking.id} booking={booking} />
                  ))}
                  {dayBookings.length > 2 ? <p className="rounded bg-paper px-1 py-0.5 text-xs font-bold">+ weitere</p> : null}
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">Buchungen am {formatGermanDate(selectedDayIso)}</h2>
        <div className="mt-4 space-y-3">
          {selectedDayBookings.length ? (
            selectedDayBookings.map((booking) => (
              <div key={booking.id} className="rounded-lg border border-teal-100 bg-paper p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xl font-bold">{booking.family_parties?.name ?? "Familienpartei"}</p>
                    <p className="mt-1">
                      {formatGermanDate(booking.start_date)} bis {formatGermanDate(booking.end_date)}
                    </p>
                    <p className="mt-1">P-Zeit: {booking.is_priority ? "Ja" : "Nein"}</p>
                    {booking.comment ? <p className="mt-2 text-gray-700">{booking.comment}</p> : null}
                  </div>
                  <StatusBadge status={booking.status} />
                </div>
                <Link
                  href={`/buchung/${booking.id}`}
                  className="focus-ring mt-4 inline-block rounded-lg bg-teal-700 px-5 py-3 font-bold text-white"
                >
                  Details ansehen
                </Link>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-paper p-4 text-lg">Für diesen Tag gibt es keine Buchungen.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold text-teal-950">Nächste Buchungen</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-teal-100 bg-white">
          {visibleBookings.length ? (
            visibleBookings.map((booking) => (
              <Link key={booking.id} href={`/buchung/${booking.id}`} className="block border-b border-teal-100 p-4 hover:bg-teal-50">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-lg font-bold">
                    {booking.is_priority ? "P - " : ""}
                    {booking.family_parties?.name ?? "Familienpartei"} - {formatGermanDate(booking.start_date)}-{formatGermanDate(booking.end_date)}
                  </p>
                  <StatusBadge status={booking.status} />
                </div>
              </Link>
            ))
          ) : (
            <p className="p-4 text-lg">Für diesen Monat gibt es keine Buchungen.</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}

function CalendarBookingPill({ booking }: { booking: Booking }) {
  const partyName = booking.family_parties?.name ?? "Familienpartei";
  return (
    <div className={`rounded border px-1.5 py-1 text-xs font-bold leading-tight ${compactStatusClasses[booking.status]}`}>
      <span className="flex flex-wrap items-center gap-1">
        {booking.is_priority ? <span className="rounded bg-teal-800 px-1 text-white">P</span> : null}
        <span className="truncate">{partyName}</span>
      </span>
      <span className="hidden sm:block">{statusLabels[booking.status]}</span>
    </div>
  );
}

function bookingsForDay(bookings: Booking[], dayIso: string) {
  return bookings.filter((booking) => booking.start_date <= dayIso && booking.end_date >= dayIso);
}

function parseMonthParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return new Date(year, month - 1, 1);
}

function parseDayParam(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function toDateOnlyIso(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function toMonthParam(date: Date) {
  return format(date, "yyyy-MM");
}

function calendarHref(input: { month: string; filter?: string; day?: string }) {
  const params = new URLSearchParams();
  params.set("month", input.month);
  if (input.filter && input.filter !== "alle") params.set("filter", input.filter);
  if (input.day) params.set("day", input.day);
  return `/kalender?${params.toString()}`;
}
