import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Bitte gib einen Namen ein." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("family_parties").update({ name }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Die Änderung konnte nicht gespeichert werden." }, { status: 500 });

  return NextResponse.json({ message: "Änderung gespeichert." });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const admin = createSupabaseAdminClient();
  const { count: profileCount } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("family_party_id", params.id);
  const { count: bookingCount } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("family_party_id", params.id);

  if ((profileCount ?? 0) > 0 || (bookingCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Diese Familienpartei kann nicht gelöscht werden, da noch Nutzer oder Buchungen zugeordnet sind." },
      { status: 400 }
    );
  }

  const { error } = await admin.from("family_parties").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Die Familienpartei konnte nicht gelöscht werden." }, { status: 500 });

  return NextResponse.json({ message: "Änderung gespeichert." });
}
