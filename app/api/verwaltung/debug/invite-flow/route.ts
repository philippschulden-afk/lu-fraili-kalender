import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildPasswordSetupRedirectUrl, getAppUrl } from "@/lib/auth-redirects";
import { getSchlichterContext } from "@/lib/schlichter";
import type { Profile } from "@/lib/types";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Dieser Test ist nur in der lokalen Entwicklung verfügbar." }, { status: 404 });
  }

  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const email = process.env.TEST_INVITE_EMAIL?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "TEST_INVITE_EMAIL ist nicht gesetzt." }, { status: 400 });
  }

  const redirectTo = buildPasswordSetupRedirectUrl(getAppUrl());

  console.log("Invite Debug redirectTo:", redirectTo);

  const admin = createSupabaseAdminClient();
  const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: "Test Einladung" },
    redirectTo
  });

  const authUserId = inviteResult.data.user?.id ?? null;
  if (inviteResult.error && !authUserId) {
    return NextResponse.json({ error: "Die Test-Einladung konnte nicht verschickt werden." }, { status: 500 });
  }

  const { data: profileData, error } = await admin
    .from("profiles")
    .upsert(
      {
        user_id: authUserId,
        full_name: "Test Einladung",
        email,
        family_party_id: null,
        role: "user"
      },
      { onConflict: "email" }
    )
    .select("*")
    .single();

  if (error || !profileData) {
    return NextResponse.json({ error: "Das Test-Profil konnte nicht angelegt werden." }, { status: 500 });
  }

  return NextResponse.json({
    message: "Test-Einladung wurde angestoßen. Bitte prüfe die E-Mail und öffne den Link.",
    profile: profileData as Profile
  });
}
