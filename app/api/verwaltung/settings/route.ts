import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSchlichterContext } from "@/lib/schlichter";

export async function PATCH(request: Request) {
  const context = await getSchlichterContext();
  if (context.error) return NextResponse.json({ error: context.error }, { status: context.status });

  const body = await request.json();
  const septemberRuleEnabled = Boolean(body.september_rule_enabled);
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("app_settings")
    .upsert({ key: "september_rule_enabled", value: septemberRuleEnabled });

  if (error) return NextResponse.json({ error: "Die Änderung konnte nicht gespeichert werden." }, { status: 500 });

  return NextResponse.json({ message: "Änderung gespeichert." });
}
