import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Nav } from "@/components/nav";
import type { Profile } from "@/lib/types";

export async function getCurrentProfile() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, profile: null };

  const { data: profileData } = await supabase
    .from("profiles")
    .select("*, family_parties(*)")
    .eq("user_id", user.id)
    .single();
  const profile = profileData as Profile | null;

  return { supabase, user, profile };
}

export async function requireProfile() {
  const context = await getCurrentProfile();
  if (!context.user) redirect("/login");
  return context;
}

export async function PageShell({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
