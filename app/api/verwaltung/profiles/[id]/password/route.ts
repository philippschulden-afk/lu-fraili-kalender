import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";
import type { Profile } from "@/lib/types";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const temporaryPassword = process.env.DEFAULT_USER_PASSWORD;
  if (!temporaryPassword) {
    return NextResponse.json({ error: "DEFAULT_USER_PASSWORD ist nicht gesetzt." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profileData } = await admin
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .single();
  const profile = profileData as Profile | null;

  if (!profile) {
    return NextResponse.json({ error: "Der Nutzer wurde nicht gefunden." }, { status: 404 });
  }

  if (profile.user_id) {
    const { error } = await admin.auth.admin.updateUserById(profile.user_id, {
      password: temporaryPassword
    });

    if (!error) {
      return NextResponse.json({ message: "Startpasswort wurde gesetzt." });
    }
  }

  const createResult = await admin.auth.admin.createUser({
    email: profile.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: profile.full_name ?? profile.email }
  });

  const authUserId = createResult.data.user?.id ?? null;
  if (createResult.error || !authUserId) {
    return NextResponse.json({ error: "Startpasswort konnte nicht gesetzt werden." }, { status: 500 });
  }

  const { error: profileUpdateError } = await admin
    .from("profiles")
    .update({ user_id: authUserId })
    .eq("id", profile.id);

  if (profileUpdateError) {
    return NextResponse.json({ error: "Startpasswort konnte nicht gesetzt werden." }, { status: 500 });
  }

  return NextResponse.json({ message: "Auth-Nutzer wurde angelegt und Startpasswort wurde gesetzt." });
}
