import Link from "next/link";
import { PageShell, requireProfile } from "@/components/page-shell";
import { BookingCard } from "@/components/booking-card";
import { getTotalPriorityDaysUsedIncludingForfeitures } from "@/lib/rules";
import type { Booking, PriorityDayForfeiture } from "@/lib/types";

export default async function DashboardPage() {
  const { supabase, profile } = await requireProfile();
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .order("start_date", { ascending: true })
    .returns<Booking[]>();
  const { data: forfeituresData } = await supabase.from("priority_day_forfeitures").select("*").returns<PriorityDayForfeiture[]>();
  const bookings = bookingsData ?? [];
  const forfeitures = forfeituresData ?? [];

  const year = new Date().getFullYear();
  const used = profile?.family_party_id ? getTotalPriorityDaysUsedIncludingForfeitures(bookings, forfeitures, profile.family_party_id, year) : 0;
  const clarification = bookings.filter((booking) => booking.status === "klaerung");
  const requests = bookings.filter((booking) => booking.status === "angefragt").slice(0, 4);
  const confirmed = bookings.filter((booking) => booking.status === "bestaetigt" && booking.end_date >= new Date().toISOString().slice(0, 10)).slice(0, 4);
  const displayName = profile?.full_name || profile?.family_parties?.name || "Familie";

  return (
    <PageShell>
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section>
          <h1 className="text-3xl font-bold text-teal-950">Start</h1>
          <div className="mt-4 rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-teal-950">Bene bènnidos, {displayName}</p>
            <p className="mt-1 text-lg text-gray-700">Willkommen in Lu Fraili.</p>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link className="inline-block rounded-lg bg-teal-700 px-6 py-4 text-center text-xl font-bold text-white hover:bg-teal-800" href={`/jahresplanung?year=${year}`}>
              Zur Jahresplanung
            </Link>
            <Link className="inline-block rounded-lg border border-teal-700 bg-white px-6 py-4 text-center text-xl font-bold text-teal-900 hover:bg-teal-50" href="/buchung/neu">
              Neue Buchung anfragen
            </Link>
          </div>
          <Link className="mt-3 inline-block font-semibold text-teal-800 underline" href="/kalender">
            Monatskalender ansehen
          </Link>
          {clarification.length > 0 ? (
            <div className="mt-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <h2 className="text-2xl font-bold text-orange-950">Klärung erforderlich</h2>
              <div className="mt-4 space-y-3">{clarification.slice(0, 3).map((booking) => <BookingCard key={booking.id} booking={booking} />)}</div>
            </div>
          ) : null}
          <h2 className="mt-8 text-2xl font-bold text-teal-950">Aktuelle Anfragen</h2>
          <div className="mt-4 space-y-3">{requests.length ? requests.map((booking) => <BookingCard key={booking.id} booking={booking} />) : <p>Zurzeit gibt es keine offenen Anfragen.</p>}</div>
          <h2 className="mt-8 text-2xl font-bold text-teal-950">Nächste bestätigte Aufenthalte</h2>
          <div className="mt-4 space-y-3">{confirmed.length ? confirmed.map((booking) => <BookingCard key={booking.id} booking={booking} />) : <p>Es sind noch keine Aufenthalte bestätigt.</p>}</div>
        </section>
        <aside className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-bold text-teal-950">Meine verbleibenden P-Tage</h2>
          <p className="mt-4 text-5xl font-bold">{Math.max(42 - used, 0)}</p>
          <p className="mt-2 text-gray-700">Für deine Partei im Jahr {year}.</p>
        </aside>
      </div>
    </PageShell>
  );
}
