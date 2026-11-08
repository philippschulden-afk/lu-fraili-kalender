import { PageShell, requireProfile } from "@/components/page-shell";
import { NewBookingForm } from "@/components/new-booking-form";
import type { Booking, FamilyParty, PriorityDayForfeiture } from "@/lib/types";

export default async function NewBookingPage() {
  const { supabase, profile } = await requireProfile();
  const { data: familyPartiesData, error: partiesError } = await supabase.from("family_parties").select("*").order("name").returns<FamilyParty[]>();
  const { data: bookingsData, error: bookingsError } = await supabase.from("bookings").select("*, family_parties(*)").returns<Booking[]>();
  const { data: forfeituresData, error: forfeituresError } = await supabase.from("priority_day_forfeitures").select("*").returns<PriorityDayForfeiture[]>();
  if (partiesError || bookingsError || forfeituresError) throw new Error("Der Zeitraum konnte nicht geprüft werden.");
  const familyParties = familyPartiesData ?? [];
  const bookings = bookingsData ?? [];
  const forfeitures = forfeituresData ?? [];
  const { data: settingData, error: settingError } = await supabase.from("app_settings").select("value").eq("key", "september_rule_enabled").single();
  if (settingError) throw new Error("Die Regeln konnten nicht geladen werden.");
  const setting = settingData as { value: boolean } | null;

  return (
    <PageShell>
      <h1 className="mb-5 text-3xl font-bold text-teal-950">Neue Buchung anfragen</h1>
      {profile ? (
        <NewBookingForm
          profile={profile}
          familyParties={familyParties}
          forfeitures={forfeitures}
          septemberRuleEnabled={setting?.value ?? true}
          existingBookings={bookings}
        />
      ) : null}
    </PageShell>
  );
}
