import { redirect } from "next/navigation";
import { PageShell, requireProfile } from "@/components/page-shell";
import { ManagementPortal } from "@/components/verwaltung/management-portal";
import { TestBookingEmailForm } from "@/components/verwaltung/test-booking-email-form";
import { bookingEmailEnabled } from "@/lib/email";
import { getTotalPriorityDaysUsedIncludingForfeitures } from "@/lib/rules";
import type { Booking, FamilyParty, Objection, PriorityDayForfeiture, Profile } from "@/lib/types";

export default async function ManagementPage() {
  const { supabase, profile } = await requireProfile();
  if (profile?.role !== "schlichter") redirect("/dashboard");

  const { data: familyPartiesData, error: familyPartiesDataError } = await supabase.from("family_parties").select("*").order("name").returns<FamilyParty[]>();
  const { data: profilesData, error: profilesDataError } = await supabase.from("profiles").select("*").order("email").returns<Profile[]>();
  const { data: bookingsData, error: bookingsDataError } = await supabase.from("bookings").select("*, family_parties(*)").order("start_date", { ascending: true }).returns<Booking[]>();
  const { data: objectionsData, error: objectionsDataError } = await supabase.from("objections").select("*").returns<Objection[]>();
  const { data: forfeituresData, error: forfeituresDataError } = await supabase.from("priority_day_forfeitures").select("*").returns<PriorityDayForfeiture[]>();
  const { data: settingData, error: settingDataError } = await supabase.from("app_settings").select("value").eq("key", "september_rule_enabled").single();

  if (familyPartiesDataError || profilesDataError || bookingsDataError || objectionsDataError || forfeituresDataError || settingDataError) throw new Error("Die Verwaltung konnte nicht geladen werden.");
  const familyParties = familyPartiesData ?? [];
  const profiles = profilesData ?? [];
  const bookings = bookingsData ?? [];
  const objections = objectionsData ?? [];
  const forfeitures = forfeituresData ?? [];
  const setting = settingData as { value: boolean } | null;
  const year = new Date().getFullYear();

  const partyRows = familyParties.map((party) => ({
    ...party,
    userCount: profiles.filter((person) => person.family_party_id === party.id).length,
    bookingCount: bookings.filter((booking) => booking.family_party_id === party.id).length,
    priorityDaysUsed: getTotalPriorityDaysUsedIncludingForfeitures(bookings, forfeitures, party.id, year)
  }));

  return (
    <PageShell>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-teal-950">Verwaltung</h1>
        <p className="mt-2 text-lg text-gray-700">Hier können Schlichter einfache Einstellungen für die Familie ändern.</p>
      </div>
      <ManagementPortal
        initialFamilyParties={partyRows}
        initialProfiles={profiles}
        initialBookings={bookings}
        initialObjections={objections}
        initialForfeitures={forfeitures}
        septemberRuleEnabled={setting?.value ?? true}
        year={year}
        showInviteFlowDebug={process.env.NODE_ENV !== "production"}
      />
      {bookingEmailEnabled() && <TestBookingEmailForm />}
    </PageShell>
  );
}
