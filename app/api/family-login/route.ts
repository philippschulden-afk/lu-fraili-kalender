import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createFamilySessionCookie,
  familyLoginCookieName,
  getFamilyIdentity,
  isFamilyLoginModeEnabled
} from "@/lib/family-login";

export async function POST(request: Request) {
  if (!isFamilyLoginModeEnabled()) {
    return NextResponse.json({ error: "Familien-Login ist nicht aktiviert." }, { status: 404 });
  }

  const body = await request.json();
  const identityName = String(body.identity ?? "");
  const password = String(body.password ?? "");
  const identity = getFamilyIdentity(identityName);

  if (!identity) {
    return NextResponse.json({ error: "Bitte wähle aus, wer du bist." }, { status: 400 });
  }

  if (!process.env.FAMILY_SHARED_PASSWORD || password !== process.env.FAMILY_SHARED_PASSWORD) {
    return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: familyParty } = await admin
    .from("family_parties")
    .select("id")
    .eq("name", identity.name)
    .single();
  if (!familyParty) {
    return NextResponse.json({ error: "Diese Familienpartei wurde nicht gefunden." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(familyLoginCookieName, createFamilySessionCookie(identity.name), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}
