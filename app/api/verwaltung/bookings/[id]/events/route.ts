import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";
import { notifyBookingComment } from "@/lib/booking-notifications";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const comment = String(body.comment ?? "").trim();
  if (!comment) return NextResponse.json({ error: "Bitte gib einen Kommentar ein." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("booking_events").insert({
    booking_id: id,
    event_type: "schlichter_comment",
    message: comment,
    created_by: context.user?.id ?? null
  }).select("id").single();

  if (error) return NextResponse.json({ error: "Der Kommentar konnte nicht gespeichert werden." }, { status: 500 });
  if (data?.id) await notifyBookingComment(admin, id, data.id, context.user?.id ?? null);

  return NextResponse.json({ message: "Änderung gespeichert." });
}
