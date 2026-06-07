import { differenceInCalendarDays, parseISO } from "date-fns";
import { notFound } from "next/navigation";
import { PageShell, requireProfile } from "@/components/page-shell";
import { StatusBadge } from "@/components/status-badge";
import { BookingActions } from "@/components/booking-actions";
import { formatGermanDate, formatGermanRange } from "@/lib/date-format";
import type { Booking, BookingEvent, Objection, PriorityDayForfeiture } from "@/lib/types";

type SelectedBookingRow = Pick<
  Booking,
  | "id"
  | "family_party_id"
  | "status"
  | "start_date"
  | "end_date"
  | "created_by"
  | "is_priority"
  | "shared_stay_allowed"
  | "comment"
  | "notice_period_ends_at"
  | "confirmed_at"
  | "cancelled_at"
  | "created_at"
  | "updated_at"
> & {
  family_parties?: Booking["family_parties"];
};

export default async function BookingDetailPage({ params }: { params: { id: string } }) {
  const { supabase, profile } = await requireProfile();
  const { data: bookingData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .eq("id", params.id)
    .single();
  const booking = bookingData as SelectedBookingRow | null;
  if (!booking || !profile) notFound();

  const { data: overlappingBookingsData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .neq("id", booking.id)
    .lte("start_date", booking.end_date)
    .gte("end_date", booking.start_date)
    .returns<Booking[]>();
  const { data: forfeituresData } = await supabase
    .from("priority_day_forfeitures")
    .select("*")
    .eq("booking_id", booking.id)
    .returns<PriorityDayForfeiture[]>();
  const { data: objections = [] } = await supabase
    .from("objections")
    .select("*, profiles(full_name, email)")
    .eq("booking_id", booking.id)
    .order("created_at")
    .returns<Objection[]>();
  const { data: events = [] } = await supabase
    .from("booking_events")
    .select("*")
    .eq("booking_id", booking.id)
    .order("created_at", { ascending: false })
    .returns<BookingEvent[]>();
  const safeObjections = objections ?? [];
  const safeEvents = events ?? [];
  const overlappingBookings = overlappingBookingsData ?? [];
  const forfeitures = forfeituresData ?? [];
  const forfeitedDays = forfeitures.reduce((sum, forfeiture) => sum + forfeiture.forfeited_days, 0);

  const remainingDays = booking.notice_period_ends_at
    ? Math.max(differenceInCalendarDays(parseISO(booking.notice_period_ends_at), new Date()), 0)
    : null;

  return (
    <PageShell>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-teal-950">{formatGermanRange(booking.start_date, booking.end_date)}</h1>
                <p className="mt-2 text-xl">{booking.family_parties?.name ?? "Familienpartei"}</p>
              </div>
              <StatusBadge status={booking.status} />
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div><dt className="font-bold">P-Zeit</dt><dd>{booking.is_priority ? "Ja" : "Nein"}</dd></div>
              <div><dt className="font-bold">Gemeinsamer Aufenthalt möglich</dt><dd>{booking.shared_stay_allowed ? "Ja" : "Nein"}</dd></div>
              <div><dt className="font-bold">Widerspruchsfrist</dt><dd>{remainingDays === null ? "Keine offene Frist" : `${remainingDays} Tage`}</dd></div>
              <div><dt className="font-bold">Automatische Bestätigung</dt><dd>{booking.notice_period_ends_at ? formatGermanDate(booking.notice_period_ends_at) : "Nicht geplant"}</dd></div>
            </dl>
            {booking.status === "angefragt" && booking.notice_period_ends_at ? (
              <p className="mt-5 rounded-lg bg-blue-50 p-4 text-blue-950">
                Diese Buchung wird automatisch am {formatGermanDate(booking.notice_period_ends_at)} bestätigt, sofern kein Widerspruch eingeht.
              </p>
            ) : null}
            {forfeitedDays > 0 ? (
              <p className="mt-5 rounded-lg bg-amber-50 p-4 font-bold text-amber-950">
                Für diese Buchung sind {forfeitedDays} P-Tage verfallen.
              </p>
            ) : null}
            {booking.comment ? <p className="mt-5 rounded-lg bg-paper p-4">{booking.comment}</p> : null}
          </div>
          <div className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-bold text-teal-950">Überschneidungen</h2>
            <div className="mt-4 space-y-3">
              {overlappingBookings.length ? overlappingBookings.map((overlap) => (
                <div key={overlap.id} className="rounded-lg bg-paper p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-lg font-bold">{overlap.family_parties?.name ?? "Familienpartei"}</p>
                      <p>{formatGermanRange(overlap.start_date, overlap.end_date)}</p>
                      <p>P-Zeit: {overlap.is_priority ? "Ja" : "Nein"}</p>
                      {overlap.comment ? <p className="mt-2 text-gray-700">{overlap.comment}</p> : null}
                    </div>
                    <StatusBadge status={overlap.status} />
                  </div>
                  <a className="mt-3 inline-block rounded-lg bg-teal-700 px-4 py-3 font-bold text-white" href={`/buchung/${overlap.id}`}>
                    Details ansehen
                  </a>
                </div>
              )) : <p>Keine Überschneidungen.</p>}
            </div>
          </div>
          <div className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-bold text-teal-950">Widersprüche</h2>
            <div className="mt-4 space-y-3">
              {safeObjections.length ? safeObjections.map((objection) => (
                <div key={objection.id} className="rounded-lg bg-orange-50 p-4">
                  <p className="font-bold">{objection.profiles?.full_name ?? objection.profiles?.email ?? "Familienmitglied"}</p>
                  <p className="mt-2">{objection.reason}</p>
                </div>
              )) : <p>Es gibt keine Widersprüche.</p>}
            </div>
          </div>
          <div className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
            <h2 className="text-2xl font-bold text-teal-950">Verlauf</h2>
            <div className="mt-4 space-y-3">
              {safeEvents.map((event) => (
                <div key={event.id} className="border-l-4 border-teal-200 pl-4">
                  <p className="font-bold">{formatGermanDate(event.created_at)}</p>
                  <p>{event.message}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <BookingActions booking={booking} profile={profile} />
      </div>
    </PageShell>
  );
}
