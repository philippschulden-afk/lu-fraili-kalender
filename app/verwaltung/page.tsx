import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageShell, requireProfile } from "@/components/page-shell";
import { getPriorityDaysUsed } from "@/lib/rules";
import type { Booking, FamilyParty, Profile } from "@/lib/types";

async function renameParty(formData: FormData) {
  "use server";
  const { supabase, profile } = await requireProfile();
  if (profile?.role !== "schlichter") return;
  await supabase.from("family_parties").update({ name: String(formData.get("name")) }).eq("id", String(formData.get("id")));
  revalidatePath("/verwaltung");
}

async function updateProfile(formData: FormData) {
  "use server";
  const { supabase, profile } = await requireProfile();
  if (profile?.role !== "schlichter") return;
  await supabase
    .from("profiles")
    .update({ family_party_id: String(formData.get("family_party_id")), role: String(formData.get("role")) })
    .eq("id", String(formData.get("id")));
  revalidatePath("/verwaltung");
}

async function addProfile(formData: FormData) {
  "use server";
  const { supabase, profile } = await requireProfile();
  if (profile?.role !== "schlichter") return;
  await supabase.from("profiles").insert({
    full_name: String(formData.get("full_name")),
    email: String(formData.get("email")).toLowerCase(),
    family_party_id: String(formData.get("family_party_id")),
    role: String(formData.get("role"))
  });
  revalidatePath("/verwaltung");
}

async function updateSeptemberRule(formData: FormData) {
  "use server";
  const { supabase, profile } = await requireProfile();
  if (profile?.role !== "schlichter") return;
  await supabase
    .from("app_settings")
    .upsert({ key: "september_rule_enabled", value: formData.get("enabled") === "on" });
  revalidatePath("/verwaltung");
}

export default async function ManagementPage() {
  const { supabase, profile } = await requireProfile();
  if (profile?.role !== "schlichter") redirect("/dashboard");

  const { data: familyParties = [] } = await supabase.from("family_parties").select("*").order("name").returns<FamilyParty[]>();
  const { data: profiles = [] } = await supabase.from("profiles").select("*").order("email").returns<Profile[]>();
  const { data: bookings = [] } = await supabase.from("bookings").select("*").returns<Booking[]>();
  const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "september_rule_enabled").returns<{ value: boolean }>().single();
  const year = new Date().getFullYear();

  return (
    <PageShell>
      <h1 className="text-3xl font-bold text-teal-950">Verwaltung</h1>
      <section className="mt-6 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">Einstellungen</h2>
        <form action={updateSeptemberRule} className="mt-4 flex items-center gap-3">
          <input className="h-6 w-6" type="checkbox" name="enabled" defaultChecked={setting?.value ?? true} />
          <span className="text-lg">September-Hinweis anzeigen</span>
          <button className="rounded-lg bg-teal-700 px-5 py-3 font-bold text-white">Speichern</button>
        </form>
      </section>

      <section className="mt-6 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">Familienparteien</h2>
        <div className="mt-4 space-y-3">
          {familyParties.map((party) => (
            <form key={party.id} action={renameParty} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <input type="hidden" name="id" value={party.id} />
              <input className="focus-ring rounded-md border p-3 text-lg" name="name" defaultValue={party.name} />
              <button className="rounded-lg bg-teal-700 px-5 py-3 font-bold text-white">Namen speichern</button>
            </form>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">Nutzer zuordnen</h2>
        <p className="mt-2 text-gray-700">Neue Nutzer können hier vorbereitet werden. Nach der ersten Google-Anmeldung wird das Konto über die E-Mail-Adresse verbunden.</p>
        <form action={addProfile} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_220px_180px_auto]">
          <input className="focus-ring rounded-md border p-3" name="full_name" placeholder="Name" required />
          <input className="focus-ring rounded-md border p-3" name="email" placeholder="E-Mail" type="email" required />
          <select className="focus-ring rounded-md border p-3" name="family_party_id">
            {familyParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
          </select>
          <select className="focus-ring rounded-md border p-3" name="role" defaultValue="user">
            <option value="user">Nutzer</option>
            <option value="schlichter">Schlichter</option>
          </select>
          <button className="rounded-lg bg-teal-700 px-5 py-3 font-bold text-white">Nutzer hinzufügen</button>
        </form>
        <div className="mt-4 space-y-3">
          {profiles.map((person) => (
            <form key={person.id} action={updateProfile} className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
              <input type="hidden" name="id" value={person.id} />
              <p className="rounded-md bg-paper p-3">{person.full_name ?? person.email}</p>
              <select className="focus-ring rounded-md border p-3" name="family_party_id" defaultValue={person.family_party_id ?? ""}>
                {familyParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
              </select>
              <select className="focus-ring rounded-md border p-3" name="role" defaultValue={person.role}>
                <option value="user">Nutzer</option>
                <option value="schlichter">Schlichter</option>
              </select>
              <button className="rounded-lg bg-teal-700 px-5 py-3 font-bold text-white">Speichern</button>
            </form>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold">P-Zeit im Jahr {year}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {familyParties.map((party) => {
            const used = getPriorityDaysUsed(bookings, party.id, year);
            return (
              <div key={party.id} className="rounded-lg bg-paper p-4">
                <p className="font-bold">{party.name}</p>
                <p className="mt-2 text-3xl font-bold">{used} / 42</p>
                <p className="text-gray-700">P-Tage genutzt</p>
              </div>
            );
          })}
        </div>
      </section>
    </PageShell>
  );
}
