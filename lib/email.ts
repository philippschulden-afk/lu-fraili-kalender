import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

export type EmailResult = { ok: boolean; skipped?: boolean; count?: number };
type MailProfile = Pick<Profile, "email" | "user_id" | "family_party_id" | "role" | "full_name">;

export function bookingEmailEnabled() {
  return process.env.BOOKING_EMAIL_ENABLED === "true";
}

export async function loadMailProfiles(client: SupabaseClient): Promise<MailProfile[]> {
  const { data, error } = await client.from("profiles").select("email, user_id, family_party_id, role, full_name");
  if (error) throw new Error("E-Mail-Empfänger konnten nicht geladen werden.");
  return (data ?? []) as MailProfile[];
}

export function getNotificationRecipients(profiles: MailProfile[], actorId: string | null, include: (profile: MailProfile) => boolean = () => true) {
  const normalize = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";
  const actorEmails = new Set(profiles.filter((p) => actorId && p.user_id === actorId).map((p) => normalize(p.email)));
  return [...new Set(profiles
    .filter((p) => p.user_id && (p.family_party_id || p.role === "schlichter") && include(p))
    .map((p) => normalize(p.email))
    .filter((email) => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) && !actorEmails.has(email)))].sort();
}

export function buildAppUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "production" ? "https://lu-fraili-kalender.vercel.app" : "http://localhost:3000");
  return new URL(path, base).toString();
}

export function cleanSubjectPart(value: string) {
  return value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function sendEmail(input: { to: string[]; subject: string; text: string; html: string; eventKey: string }): Promise<EmailResult> {
  if (!bookingEmailEnabled() || !input.to.length) return { ok: true, skipped: true };
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || key.toLowerCase() === "dummy" || !from) {
    console.warn(!key || key.toLowerCase() === "dummy" ? "E-Mail-Versand übersprungen: RESEND_API_KEY fehlt." : "E-Mail-Versand übersprungen: EMAIL_FROM fehlt.");
    return { ok: false };
  }
  if (input.to.length > 100) return { ok: false };
  try {
    const idempotencyKey = createHash("sha256").update(input.eventKey).digest("hex");
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      redirect: "error",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify(input.to.map((email) => ({ from, to: [email], subject: input.subject, text: input.text, html: input.html })))
    });
    if (!response.ok) {
      console.error("Resend hat die Benachrichtigung nicht angenommen:", response.status);
      return { ok: false };
    }
    const result = await response.json() as { data?: { id?: string }[] };
    return result.data?.length === input.to.length && result.data.every((item) => item.id)
      ? { ok: true, count: result.data.length }
      : { ok: false };
  } catch {
    console.error("Der E-Mail-Versand konnte nicht bestätigt werden.");
    return { ok: false };
  }
}
