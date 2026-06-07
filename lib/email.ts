import { Resend } from "resend";
import type { Booking, BookingStatus, Profile } from "@/lib/types";
import { formatGermanRange } from "@/lib/date-format";
import { statusLabels } from "@/lib/status";

export type EmailResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

export function buildAppUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "dummy") return null;
  return new Resend(apiKey);
}

export async function sendEmail(input: { to: string[]; subject: string; html: string }): Promise<EmailResult> {
  const resend = getResend();
  const recipients = uniqueEmails(input.to);

  if (!resend) {
    console.info("E-Mail-Versand übersprungen: RESEND_API_KEY fehlt.");
    return { ok: true, skipped: true };
  }

  if (recipients.length === 0) return { ok: true, skipped: true };

  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "Lu Fraili <onboarding@resend.dev>",
      to: recipients,
      subject: input.subject,
      html: shell(input.html)
    });
    return { ok: true };
  } catch (error) {
    console.error("E-Mail-Versand fehlgeschlagen:", error);
    return { ok: false, error: "E-Mail konnte nicht versendet werden." };
  }
}

export async function getNotificationRecipients(
  supabase: { from: (table: string) => any },
  options: {
    excludeUserId?: string | null;
    onlySchlichter?: boolean;
    familyPartyIds?: string[];
    userIds?: string[];
  } = {}
) {
  const { data } = await supabase.from("profiles").select("*");
  const profiles = (data ?? []) as Profile[];
  return uniqueEmails(
    profiles
      .filter((profile) => {
        const maybeActive = profile as Profile & { is_active?: boolean | null };
        if (maybeActive.is_active === false) return false;
        if (!profile.email) return false;
        if (options.excludeUserId && profile.user_id === options.excludeUserId) return false;
        if (options.onlySchlichter && profile.role !== "schlichter") return false;
        if (options.familyPartyIds?.length && (!profile.family_party_id || !options.familyPartyIds.includes(profile.family_party_id))) return false;
        if (options.userIds?.length && (!profile.user_id || !options.userIds.includes(profile.user_id))) return false;
        return true;
      })
      .map((profile) => profile.email)
  );
}

export async function sendBookingNotification(input: {
  to: string[];
  type:
    | "new_request"
    | "cancelled"
    | "status_changed"
    | "objection_created"
    | "auto_confirmed"
    | "priority_displacement"
    | "booking_changed"
    | "priority_days_forfeited";
  booking: Booking;
  partyName: string;
  actorPartyName?: string;
  affectedPartyName?: string;
  affectedBooking?: Booking;
  reason?: string;
  newStatus?: BookingStatus;
  forfeitedDays?: number;
}) {
  const range = formatGermanRange(input.booking.start_date, input.booking.end_date);
  const url = buildAppUrl(`/buchung/${input.booking.id}`);
  const pZeit = input.booking.is_priority ? "Ja" : "Nein";
  const status = input.newStatus ? statusLabels[input.newStatus] : statusLabels[input.booking.status];

  if (input.type === "new_request") {
    return sendEmail({
      to: input.to,
      subject: `Neue Buchungsanfrage Lu Fraili: ${input.partyName} vom ${range}`,
      html: `
        <p>${input.partyName} möchte Lu Fraili vom ${range} buchen.</p>
        <p>P-Zeit: ${pZeit}<br>Status: Angefragt</p>
        <p>Wenn innerhalb von drei Tagen niemand widerspricht, wird die Buchung automatisch bestätigt.</p>
        <p>Zur Buchung:</p>${button(url)}
      `
    });
  }

  if (input.type === "cancelled") {
    return sendEmail({
      to: input.to,
      subject: `Buchung storniert: Lu Fraili ${range}`,
      html: `
        <p>Die Buchung von ${input.partyName} vom ${range} wurde storniert.</p>
        <p>Der Zeitraum ist wieder verfügbar.</p>
        <p>Zur Buchung:</p>${button(url)}
      `
    });
  }

  if (input.type === "status_changed") {
    return sendEmail({
      to: input.to,
      subject: `Status geändert: Lu Fraili ${range}`,
      html: `
        <p>Der Status der Buchung von ${input.partyName} vom ${range} wurde geändert.</p>
        <p>Neuer Status: ${status}</p>
        <p>Zur Buchung:</p>${button(url)}
      `
    });
  }

  if (input.type === "objection_created") {
    return sendEmail({
      to: input.to,
      subject: `Widerspruch gegen Buchung: Lu Fraili ${range}`,
      html: `
        <p>Gegen die Buchung von ${input.partyName} vom ${range} wurde widersprochen.</p>
        <p><strong>Grund:</strong><br>${input.reason ?? ""}</p>
        <p>Die Schlichter können die Buchung nun bestätigen oder ablehnen.</p>
        <p>Zur Buchung:</p>${button(url)}
      `
    });
  }

  if (input.type === "auto_confirmed") {
    return sendEmail({
      to: input.to,
      subject: `Buchung automatisch bestätigt: Lu Fraili ${range}`,
      html: `
        <p>Die Buchung von ${input.partyName} vom ${range} wurde automatisch bestätigt, da innerhalb der Drei-Tage-Frist kein Widerspruch eingegangen ist.</p>
        <p>Zur Buchung:</p>${button(url)}
      `
    });
  }

  if (input.type === "priority_displacement") {
    const affected = input.affectedBooking;
    const affectedRange = affected ? formatGermanRange(affected.start_date, affected.end_date) : "dem betroffenen Zeitraum";
    return sendEmail({
      to: input.to,
      subject: "P-Zeit überschneidet sich mit deiner Buchung: Lu Fraili",
      html: `
        <p>Eine P-Zeit von ${input.partyName} vom ${range} überschneidet sich mit der normalen Buchung von ${input.affectedPartyName ?? "einer anderen Partei"} vom ${affectedRange}.</p>
        <p>Nach den Regeln kann eine normale Buchung durch eine gültige P-Zeit verdrängt werden.</p>
        <p>Bitte prüft den Zeitraum und stimmt euch ab.</p>
        <p>Zur neuen Buchung:</p>${button(url)}
      `
    });
  }

  if (input.type === "priority_days_forfeited") {
    return sendEmail({
      to: input.to,
      subject: `P-Tage verfallen: Lu Fraili ${range}`,
      html: `
        <p>Die P-Zeit von ${input.partyName} vom ${range} wurde weniger als einen Monat vor Beginn storniert oder geändert.</p>
        <p>Nach den Regeln werden ${input.forfeitedDays ?? 0} P-Tage nicht wieder gutgeschrieben.</p>
        <p>Zur Buchung:</p>${button(url)}
      `
    });
  }

  return sendEmail({
    to: input.to,
    subject: `Buchung geändert: Lu Fraili ${range}`,
    html: `
      <p>Eine Buchung wurde geändert.</p>
      <p>Partei: ${input.partyName}<br>Zeitraum: ${range}<br>P-Zeit: ${pZeit}<br>Status: ${status}</p>
      <p>Zur Buchung:</p>${button(url)}
    `
  });
}

export async function sendUnassignedUserEmail(to: string[], email: string) {
  return sendEmail({
    to,
    subject: "Neuer Nutzer wartet auf Zuordnung",
    html: `
      <p>Ein neuer Nutzer hat sich angemeldet und muss einer Familienpartei zugeordnet werden.</p>
      <p>E-Mail: ${email}</p>
      <p>Zur Verwaltung:</p>${button(buildAppUrl("/verwaltung"))}
    `
  });
}

export async function sendNewBookingEmail(to: string[], booking: Booking, partyName: string) {
  return sendBookingNotification({ to, type: "new_request", booking, partyName });
}

export async function sendObjectionEmail(to: string[], booking: Booking, partyName: string, reason: string) {
  return sendBookingNotification({ to, type: "objection_created", booking, partyName, reason });
}

export async function sendConfirmationEmail(to: string[], booking: Booking, partyName: string) {
  return sendBookingNotification({ to, type: "auto_confirmed", booking, partyName });
}

export async function sendCancellationEmail(to: string[], booking: Booking, partyName: string) {
  return sendBookingNotification({ to, type: "cancelled", booking, partyName });
}

function button(url: string) {
  return `<p><a href="${url}" style="display:inline-block;background:#0f766e;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700">Zur Buchung</a></p>`;
}

function shell(body: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:17px;line-height:1.5;color:#1f2933;max-width:620px">${body}</div>`;
}

function uniqueEmails(emails: string[]) {
  return Array.from(new Set(emails.map((email) => email.trim()).filter(Boolean)));
}
