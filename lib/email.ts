import { Resend } from "resend";
import type { Booking } from "@/lib/types";
import { formatGermanRange } from "@/lib/date-format";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function getResend() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: { to: string[]; subject: string; html: string }) {
  const resend = getResend();
  if (!resend || input.to.length === 0) return;

  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Lu Fraili <buchungen@example.com>",
    to: input.to,
    subject: input.subject,
    html: input.html
  });
}

function button(url: string) {
  return `<p><a href="${url}" style="display:inline-block;background:#0f766e;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:700">Zur Buchung</a></p>`;
}

function shell(body: string) {
  return `<div style="font-family:Arial,sans-serif;font-size:17px;line-height:1.5;color:#1f2933;max-width:620px">${body}</div>`;
}

export async function sendNewBookingEmail(to: string[], booking: Booking, partyName: string) {
  const range = formatGermanRange(booking.start_date, booking.end_date);
  const url = `${appUrl}/buchung/${booking.id}`;
  await sendEmail({
    to,
    subject: `Neue Buchungsanfrage Lu Fraili: ${range}`,
    html: shell(`
      <p><strong>${partyName}</strong> möchte das Haus von ${range} buchen.</p>
      <p>P-Zeit: ${booking.is_priority ? "Ja" : "Nein"}</p>
      <p>Wenn du widersprechen möchtest, kannst du das innerhalb von drei Tagen über diesen Link tun:</p>
      ${button(url)}
      <p>Wenn niemand widerspricht, wird die Buchung automatisch bestätigt.</p>
    `)
  });
}

export async function sendObjectionEmail(to: string[], booking: Booking, partyName: string, reason: string) {
  await sendEmail({
    to,
    subject: "Widerspruch gegen Buchungsanfrage Lu Fraili",
    html: shell(`
      <p>Gegen die Buchungsanfrage von ${partyName} für ${formatGermanRange(booking.start_date, booking.end_date)} wurde widersprochen.</p>
      <p><strong>Grund:</strong></p>
      <p>${reason}</p>
      <p>Die Buchung wurde auf 'Klärung erforderlich' gesetzt.</p>
      ${button(`${appUrl}/buchung/${booking.id}`)}
    `)
  });
}

export async function sendConfirmationEmail(to: string[], booking: Booking, partyName: string) {
  const range = formatGermanRange(booking.start_date, booking.end_date);
  await sendEmail({
    to,
    subject: `Buchung bestätigt: Lu Fraili ${range}`,
    html: shell(`
      <p>Die Buchung von ${partyName} für ${range} wurde automatisch bestätigt, da innerhalb der Drei-Tage-Frist kein Widerspruch eingegangen ist.</p>
      ${button(`${appUrl}/buchung/${booking.id}`)}
    `)
  });
}

export async function sendCancellationEmail(to: string[], booking: Booking, partyName: string) {
  const range = formatGermanRange(booking.start_date, booking.end_date);
  await sendEmail({
    to,
    subject: `Zeitraum wieder frei: Lu Fraili ${range}`,
    html: shell(`
      <p>Die Buchung von ${partyName} für ${range} wurde storniert. Der Zeitraum ist wieder verfügbar.</p>
      ${button(`${appUrl}/buchung/${booking.id}`)}
    `)
  });
}
