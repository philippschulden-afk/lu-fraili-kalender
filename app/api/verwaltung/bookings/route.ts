import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";

export async function GET() {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("bookings")
    .select("*, family_parties(*)")
    .order("start_date", { ascending: true });

  if (error) return NextResponse.json({ error: "Die Buchungen konnten nicht geladen werden." }, { status: 500 });

  return NextResponse.json({ bookings: data ?? [] });
}
