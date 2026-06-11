import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";
import type { Profile } from "@/lib/types";

type AuthUserStatus = {
  id: string;
  invited_at?: string | null;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
};

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

  let authUser = profile.user_id ? await getAuthUserById(profile.user_id) : null;
  if (!authUser) {
    authUser = await findAuthUserByEmail(profile.email);
  }

  if (authUser) {
    logAuthStatus("vorher", authUser);
    const { error } = await admin.auth.admin.updateUserById(authUser.id, {
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: profile.full_name ?? profile.email }
    });

    if (error) {
      return NextResponse.json({ error: "Startpasswort konnte nicht gesetzt werden." }, { status: 500 });
    }

    if (profile.user_id !== authUser.id) {
      const { error: profileUpdateError } = await admin
        .from("profiles")
        .update({ user_id: authUser.id })
        .eq("id", profile.id);
      if (profileUpdateError) {
        return NextResponse.json({ error: "Startpasswort konnte nicht gesetzt werden." }, { status: 500 });
      }
    }

    const updatedAuthUser = await getAuthUserById(authUser.id);
    if (updatedAuthUser) logAuthStatus("nachher", updatedAuthUser);

    if (!updatedAuthUser || !isConfirmed(updatedAuthUser)) {
      return NextResponse.json({ error: "Startpasswort konnte nicht gesetzt werden." }, { status: 500 });
    }

    return NextResponse.json({ message: "Startpasswort wurde gesetzt." });
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

  async function getAuthUserById(userId: string) {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data.user) return null;
    return data.user as AuthUserStatus;
  }

  async function findAuthUserByEmail(email: string) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return null;
    return (data.users as AuthUserStatus[]).find((user) => user.id && dataEmailMatches(user, email)) ?? null;
  }
}

function logAuthStatus(stage: "vorher" | "nachher", user: AuthUserStatus) {
  console.log("Startpasswort Auth-Status:", {
    stage,
    userId: user.id,
    invited: Boolean(user.invited_at),
    confirmedBeforeOrAfter: user.confirmed_at ?? user.email_confirmed_at ?? null,
    lastSignedIn: user.last_sign_in_at ?? null
  });
}

function isConfirmed(user: AuthUserStatus) {
  return Boolean(user.confirmed_at || user.email_confirmed_at);
}

function dataEmailMatches(user: AuthUserStatus, email: string) {
  return "email" in user && String(user.email).toLowerCase() === email.toLowerCase();
}
