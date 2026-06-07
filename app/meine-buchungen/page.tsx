import { PageShell, requireProfile } from "@/components/page-shell";
import { BookingCard } from "@/components/booking-card";
import type { Booking } from "@/lib/types";

export default async function MyBookingsPage() {
  const { supabase, profile } = await requireProfile();
  const { data: bookingsData } = await supabase
    .from("bookings")
    .select("*, family_parties(*)")
    .eq("family_party_id", profile?.family_party_id)
    .order("start_date", { ascending: true })
    .returns<Booking[]>();
  const bookings = bookingsData ?? [];

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-teal-950">Meine Buchungen</h1>
      <div className="mt-5 space-y-3">
        {bookings.length ? bookings.map((booking) => <BookingCard key={booking.id} booking={booking} />) : <p>Deine Partei hat noch keine Buchungen.</p>}
      </div>
    </PageShell>
  );
}
