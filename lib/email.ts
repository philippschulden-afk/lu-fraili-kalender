import type { Booking } from "@/lib/types";

// App emails are disabled. Supabase Auth invitations and recovery are separate.
export const EMAIL_NOTIFICATIONS_ENABLED = false;
export type EmailResult = { ok: boolean; skipped?: boolean; error?: string };
export async function sendEmail(_input: { to: string[]; subject: string; html: string }): Promise<EmailResult> {
  return { ok: true, skipped: true };
}
export async function getNotificationRecipients(
  _supabase: { from: (table: string) => unknown },
  _options: { excludeUserId?: string | null; onlySchlichter?: boolean; familyPartyIds?: string[]; userIds?: string[] } = {}
): Promise<string[]> { return []; }
export async function sendBookingNotification(_input: {
  to: string[]; type: string; booking: Booking; partyName: string; reason?: string;
}): Promise<EmailResult> { return { ok: true, skipped: true }; }
export async function sendUnassignedUserEmail(_to: string[], _email: string): Promise<EmailResult> {
  return { ok: true, skipped: true };
}
