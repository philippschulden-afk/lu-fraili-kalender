import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";
import type { Profile, UserRole } from "@/lib/types";

const allowedRoles: UserRole[] = ["user", "schlichter"];

export async function POST(request: Request) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const fullName = String(body.full_name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const familyPartyId = body.family_party_id ? String(body.family_party_id) : null;
  const role = String(body.role ?? "user") as UserRole;

  if (!fullName) return NextResponse.json({ error: "Bitte gib einen Namen ein." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Bitte gib eine E-Mail-Adresse ein." }, { status: 400 });
  if (!allowedRoles.includes(role)) return NextResponse.json({ error: "Bitte wähle eine gültige Rolle." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  let authUserId: string | null = null;
  let inviteSent = false;

  const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName }
  });

  if (inviteResult.data.user?.id) {
    authUserId = inviteResult.data.user.id;
    inviteSent = !inviteResult.error;
  }

  if (!authUserId) {
    const createResult = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });
    authUserId = createResult.data.user?.id ?? null;
  }

  const { data: profileData, error } = await admin
    .from("profiles")
    .upsert(
      {
        user_id: authUserId,
        full_name: fullName,
        email,
        family_party_id: familyPartyId,
        role
      },
      { onConflict: "email" }
    )
    .select("*")
    .single();

  if (error || !profileData) return NextResponse.json({ error: "Der Nutzer konnte nicht angelegt werden." }, { status: 500 });

  const profile = profileData as Profile;
  return NextResponse.json({
    message: inviteSent
      ? "Der Nutzer wurde angelegt und eingeladen."
      : "Der Nutzer wurde angelegt. Falls keine Einladung verschickt wurde, kann er sich über die Login-Seite anmelden.",
    profile
  });
}
