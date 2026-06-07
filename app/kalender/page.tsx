import Link from "next/link";
import { PageShell, requireProfile } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { formatGermanDate } from "@/lib/date-format";
import type { Booking } from "@/lib/types";

const filters = [
  ["alle", "Alle Buchungen"],
  ["bestaetigt", "Nur bestätigte Buchungen"],
  ["angefragt", "Nur Anfragen"],
  ["meine", "Nur meine Partei"],
  ["p", "Nur P-Zeiten"]
];

export default async function CalendarPage({ searchParams }: { searchParams: { filter?: string } }) {
  const { supabase, profile } = await requireProfile();
  const selectedFilter = searchParams.filter ?? "alle";
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .order("start_date", { ascending: true })
    .returns<Booking[]>();
  const bookings = bookingsData ?? [];

  const visibleBookings = bookings.filter((booking) => {
    if (selectedFilter === "bestaetigt") return booking.status === "bestaetigt";
    if (selectedFilter === "angefragt") return booking.status === "angefragt";
    if (selectedFilter === "meine") return booking.family_party_id === profile?.family_party_id;
    if (selectedFilter === "p") return booking.is_priority;
    return true;
  });

  const today = new Date();
  const month = new Date(today.getFullYear(), today.getMonth(), 1);
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, index) => new Date(today.getFullYear(), today.getMonth(), index + 1));

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-teal-950">Kalender</h1>
      <div className="mt-5 flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Link
            key={value}
            href={`/kalender?filter=${value}`}
            className={`rounded-lg border px-4 py-3 font-bold ${selectedFilter === value ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-950"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-2xl font-bold text-teal-950">Monatsansicht</h2>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {monthDays.map((day) => {
            const iso = day.toISOString().slice(0, 10);
            const dayBookings = visibleBookings.filter((booking) => booking.start_date <= iso && booking.end_date >= iso);
            return (
              <div key={iso} className="min-h-28 rounded-lg border border-teal-100 bg-white p-3">
                <p className="font-bold">{day.getDate()}.</p>
                <div className="mt-2 space-y-1">
                  {dayBookings.slice(0, 2).map((booking) => (
                    <Link key={booking.id} href={`/buchung/${booking.id}`} className="block rounded bg-teal-50 p-1 text-sm font-semibold">
                      {booking.is_priority ? "P - " : ""}{booking.family_parties?.name}
                    </Link>
                  ))}
                  {dayBookings.length > 2 ? <p className="text-sm">+ {dayBookings.length - 2} mehr</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold text-teal-950">Listenansicht</h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-teal-100 bg-white">
          {visibleBookings.map((booking) => (
            <Link key={booking.id} href={`/buchung/${booking.id}`} className="block border-b border-teal-100 p-4 hover:bg-teal-50">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-lg font-bold">
                  {booking.is_priority ? "P - " : ""}{booking.family_parties?.name} - {formatGermanDate(booking.start_date)}-{formatGermanDate(booking.end_date)}
                </p>
                <StatusBadge status={booking.status} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
