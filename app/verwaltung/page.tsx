import { redirect } from "next/navigation";
import { PageShell, requireProfile } from "@/components/page-shell";
import { ManagementPortal } from "@/components/verwaltung/management-portal";
import { getPriorityDaysUsed } from "@/lib/rules";
import type { Booking, FamilyParty, Profile } from "@/lib/types";

export default async function ManagementPage() {
  const { supabase, profile } = await requireProfile();
  if (profile?.role !== "schlichter") redirect("/dashboard");

  const { data: familyPartiesData } = await supabase.from("family_parties").select("*").order("name").returns<FamilyParty[]>();
  const { data: profilesData } = await supabase.from("profiles").select("*").order("email").returns<Profile[]>();
  const { data: bookingsData } = await supabase.from("bookings").select("*").returns<Booking[]>();
  const { data: settingData } = await supabase.from("app_settings").select("value").eq("key", "september_rule_enabled").single();

  const familyParties = familyPartiesData ?? [];
  const profiles = profilesData ?? [];
  const bookings = bookingsData ?? [];
  const setting = settingData as { value: boolean } | null;
  const year = new Date().getFullYear();

  const partyRows = familyParties.map((party) => ({
    ...party,
    userCount: profiles.filter((person) => person.family_party_id === party.id).length,
    priorityDaysUsed: getPriorityDaysUsed(bookings, party.id, year)
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
        septemberRuleEnabled={setting?.value ?? true}
        year={year}
      />
    </PageShell>
  );
}
