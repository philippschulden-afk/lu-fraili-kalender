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
