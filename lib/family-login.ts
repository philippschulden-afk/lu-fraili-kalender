import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { familyIdentities, type FamilyIdentityName } from "@/lib/family-login-options";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { FamilyParty, Profile, UserRole } from "@/lib/types";

export const familyLoginCookieName = "lu_fraili_family_session";

const familyIdentityDetails = [
  { name: "Christoph", userId: "30000000-0000-0000-0000-000000000001", role: "user" },
  { name: "Peter", userId: "30000000-0000-0000-0000-000000000002", role: "user" },
  { name: "Philipp", userId: "30000000-0000-0000-0000-000000000003", role: "schlichter" },
  { name: "Teresa", userId: "30000000-0000-0000-0000-000000000004", role: "user" },
  { name: "Franziska", userId: "30000000-0000-0000-0000-000000000005", role: "user" }
] as const satisfies ReadonlyArray<{ name: string; userId: string; role: UserRole }>;

type FamilySessionPayload = {
  identity: FamilyIdentityName;
  userId: string;
};

export function isFamilyLoginModeEnabled() {
  return process.env.FAMILY_LOGIN_MODE === "true";
}

export function getFamilyIdentity(name: string) {
  if (!familyIdentities.includes(name as FamilyIdentityName)) return null;
  return familyIdentityDetails.find((identity) => identity.name === name) ?? null;
}

export function createFamilySessionCookie(identityName: FamilyIdentityName) {
  const identity = getFamilyIdentity(identityName);
  if (!identity) throw new Error("Unbekannte Familienperson.");

  const payload: FamilySessionPayload = {
    identity: identity.name,
    userId: identity.userId
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function readFamilySessionCookie(value?: string | null) {
  if (!value) return null;
  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;
  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as FamilySessionPayload;
    const identity = getFamilyIdentity(payload.identity);
    if (!identity || identity.userId !== payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getFamilySessionFromCookies() {
  return readFamilySessionCookie(cookies().get(familyLoginCookieName)?.value);
}

export async function getFamilyProfileFromSession() {
  const session = getFamilySessionFromCookies();
  if (!session) return null;

  const identity = getFamilyIdentity(session.identity);
  if (!identity) return null;

  const admin = createSupabaseAdminClient();
  const { data: familyPartyData } = await admin
    .from("family_parties")
    .select("*")
    .eq("name", identity.name)
    .single();
  const familyParty = familyPartyData as FamilyParty | null;
  if (!familyParty) return null;

  const email = `${identity.name.toLowerCase()}@familie.lu-fraili.local`;
  const { data: profileData } = await admin
    .from("profiles")
    .upsert(
      {
        user_id: identity.userId,
        full_name: identity.name,
        email,
        family_party_id: familyParty.id,
        role: identity.role
      },
      { onConflict: "user_id" }
    )
    .select("*, family_parties(*)")
    .single();

  if (!profileData) return null;
  return {
    supabase: admin,
    user: { id: identity.userId, email },
    profile: profileData as Profile
  };
}

function signPayload(encodedPayload: string) {
  const secret = process.env.FAMILY_SHARED_PASSWORD;
  if (!secret) throw new Error("FAMILY_SHARED_PASSWORD fehlt.");
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
