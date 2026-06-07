import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export async function getSchlichterContext() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, profile: null, error: "Bitte zuerst anmelden.", status: 401 };
  }

  const { data: profileData } = await supabase.from("profiles").select("*").eq("user_id", user.id).single();
  const profile = profileData as Profile | null;

  if (profile?.role !== "schlichter") {
    return { supabase, user, profile, error: "Nur Schlichter dürfen die Verwaltung ändern.", status: 403 };
  }

  return { supabase, user, profile, error: null, status: 200 };
}
