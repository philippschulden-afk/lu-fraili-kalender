import { getAuthContext } from "@/lib/auth-context";

export async function getSchlichterContext() {
  const { supabase, user, profile } = await getAuthContext();

  if (!user) {
    return { supabase, user: null, profile: null, error: "Bitte zuerst anmelden.", status: 401 };
  }

  if (profile?.role !== "schlichter") {
    return { supabase, user, profile, error: "Nur Schlichter dürfen die Verwaltung ändern.", status: 403 };
  }

  return { supabase, user, profile, error: null, status: 200 };
}
