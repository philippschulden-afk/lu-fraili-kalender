import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";
import type { Profile, UserRole } from "@/lib/types";

const allowedRoles: UserRole[] = ["user", "schlichter"];

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const fullName = String(body.full_name ?? "").trim();
  const familyPartyId = body.family_party_id ? String(body.family_party_id) : null;
  const role = String(body.role ?? "user") as UserRole;

  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Bitte wähle eine gültige Rolle." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: profilesData } = await admin.from("profiles").select("*").returns<Profile[]>();
  const profiles = profilesData ?? [];
  const existingProfile = profiles.find((profile) => profile.id === params.id);

  if (!existingProfile) {
    return NextResponse.json({ error: "Der Nutzer wurde nicht gefunden." }, { status: 404 });
  }

  const schlichterCount = profiles.filter((profile) => profile.role === "schlichter").length;
  if (existingProfile.role === "schlichter" && role !== "schlichter" && schlichterCount <= 1) {
    return NextResponse.json({ error: "Es muss mindestens ein Schlichter bestehen bleiben." }, { status: 400 });
  }

  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName || null,
      family_party_id: familyPartyId,
      role
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: "Die Änderung konnte nicht gespeichert werden." }, { status: 500 });

  return NextResponse.json({ message: "Änderung gespeichert." });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const admin = createSupabaseAdminClient();
  const { data: profilesData } = await admin.from("profiles").select("*").returns<Profile[]>();
  const profiles = profilesData ?? [];
  const existingProfile = profiles.find((profile) => profile.id === params.id);

  if (!existingProfile) return NextResponse.json({ error: "Der Nutzer wurde nicht gefunden." }, { status: 404 });

  const schlichterCount = profiles.filter((profile) => profile.role === "schlichter").length;
  if (existingProfile.role === "schlichter" && schlichterCount <= 1) {
    return NextResponse.json({ error: "Es muss mindestens ein Schlichter bestehen bleiben." }, { status: 400 });
  }

  const { error } = await admin.from("profiles").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Der Nutzer konnte nicht entfernt werden." }, { status: 500 });

  if (existingProfile.user_id) {
    const authDelete = await admin.auth.admin.deleteUser(existingProfile.user_id);
    if (authDelete.error) {
      return NextResponse.json({
        message: "Das Profil wurde entfernt. Der Auth-Nutzer kann bei Bedarf später separat gelöscht werden."
      });
    }
  }

  return NextResponse.json({ message: "Änderung gespeichert." });
}
