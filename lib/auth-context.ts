import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getFamilyProfileFromSession, isFamilyLoginModeEnabled } from "@/lib/family-login";
import type { Profile } from "@/lib/types";

export async function getAuthContext() {
  if (isFamilyLoginModeEnabled()) {
    const familyContext = await getFamilyProfileFromSession();
    if (familyContext) return familyContext;
    return { supabase: createSupabaseAdminClient(), user: null, profile: null };
  }

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

  return { supabase, user: { id: user.id, email: user.email ?? null }, profile };
}
