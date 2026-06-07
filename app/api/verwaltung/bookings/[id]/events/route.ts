import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const comment = String(body.comment ?? "").trim();
  if (!comment) return NextResponse.json({ error: "Bitte gib einen Kommentar ein." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("booking_events").insert({
    booking_id: params.id,
    event_type: "schlichter_comment",
    message: comment,
    created_by: context.user?.id ?? null
  });

  if (error) return NextResponse.json({ error: "Der Kommentar konnte nicht gespeichert werden." }, { status: 500 });

  return NextResponse.json({ message: "Änderung gespeichert." });
}
