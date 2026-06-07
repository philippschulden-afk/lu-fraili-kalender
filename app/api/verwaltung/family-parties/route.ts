import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";

export async function POST(request: Request) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Bitte gib einen Namen ein." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("family_parties").insert({ name }).select("*").single();
  if (error || !data) return NextResponse.json({ error: "Die Familienpartei konnte nicht angelegt werden." }, { status: 500 });

  return NextResponse.json({ message: "Familienpartei wurde angelegt.", familyParty: data });
}
