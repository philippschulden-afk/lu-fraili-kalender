import { PageShell, requireProfile } from "@/components/page-shell";
import { NewBookingForm } from "@/components/new-booking-form";
import { getPriorityDaysUsed } from "@/lib/rules";
import type { Booking, FamilyParty } from "@/lib/types";

export default async function NewBookingPage() {
  const { supabase, profile } = await requireProfile();
  const { data: familyPartiesData } = await supabase.from("family_parties").select("*").order("name").returns<FamilyParty[]>();
  const { data: bookingsData } = await supabase.from("bookings").select("*").returns<Booking[]>();
  const familyParties = familyPartiesData ?? [];
  const bookings = bookingsData ?? [];
  const { data: settingData } = await supabase.from("app_settings").select("value").eq("key", "september_rule_enabled").single();
  const setting = settingData as { value: boolean } | null;
  const used = profile?.family_party_id ? getPriorityDaysUsed(bookings, profile.family_party_id, new Date().getFullYear()) : 0;

  return (
    <PageShell>
      <h1 className="mb-5 text-3xl font-bold text-teal-950">Neue Buchung anfragen</h1>
      {profile ? (
        <NewBookingForm
          profile={profile}
          familyParties={familyParties}
          remainingPriorityDays={Math.max(42 - used, 0)}
          septemberRuleEnabled={setting?.value ?? true}
          existingBookings={bookings}
        />
      ) : null}
    </PageShell>
  );
}
