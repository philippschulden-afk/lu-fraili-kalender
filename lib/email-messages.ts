import { buildAppUrl, cleanSubjectPart } from "@/lib/email";
import { formatGermanRange } from "@/lib/date-format";
import { statusLabels } from "@/lib/status";
import type { Booking } from "@/lib/types";

export type BookingEmailType = "requested" | "requested_again" | "changed" | "confirmed" | "auto_confirmed" | "rejected" | "cancelled" | "objection" | "clarification" | "auto_clarification" | "displacement" | "forfeited" | "deleted" | "commented";
type MessageBooking = Pick<Booking, "id" | "start_date" | "end_date" | "status" | "is_priority" | "family_parties">;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function emailMessage(subject: string, lines: string[], path: string, linkLabel: string) {
  const url = buildAppUrl(path);
  return {
    subject,
    text: [...lines, `${linkLabel}: ${url}`].join("\n\n"),
    html: `<div style="max-width:600px;margin:auto;padding:20px;font:17px/1.5 system-ui,sans-serif;color:#17332f"><h1 style="font-size:23px">${escapeHtml(subject)}</h1>${lines.map((line) => `<p>${escapeHtml(line).replace(/\n/g, "<br>")}</p>`).join("")}<p><a style="display:inline-block;padding:12px 18px;background:#16675a;color:white;border-radius:6px" href="${escapeHtml(url)}">${escapeHtml(linkLabel)}</a></p></div>`
  };
}

export function buildBookingEmail(input: {
  type: BookingEmailType; booking: MessageBooking; actorName: string; previous?: MessageBooking;
  reason?: string; forfeitedDays?: number; affectedParties?: string[];
}) {
  const { booking, type, previous } = input;
  const actor = cleanSubjectPart(input.actorName) || "Ein Familienmitglied";
  const party = cleanSubjectPart(booking.family_parties?.name ?? "Familienpartei");
  const days = input.forfeitedDays ?? 0;
  const range = formatGermanRange(booking.start_date, booking.end_date);
  const actions: Record<BookingEmailType, string> = {
    requested: `${actor} fragt an`,
    requested_again: `${actor} fragt nach Änderung erneut an`,
    changed: `${actor} ändert Buchung`,
    confirmed: `${actor} bestätigt Buchung`,
    auto_confirmed: "App bestätigt Buchung automatisch",
    rejected: `${actor} lehnt Buchung ab`,
    cancelled: `${actor} storniert Buchung`,
    objection: `${actor} widerspricht der Buchung`,
    clarification: `${actor} stellt Buchung zur Klärung`,
    auto_clarification: "App stoppt Bestätigung: Klärung nötig",
    displacement: `${actor}: P-Zeit betrifft normale Buchung`,
    forfeited: `Nach ${booking.status === "storniert" ? "Stornierung" : "Änderung"} durch ${actor}: ${days} P-Tage verfallen`,
    deleted: `${actor} löscht Buchung`,
    commented: `${actor} kommentiert Buchung`
  };
  const action = actions[type];
  const affected = input.affectedParties?.map(cleanSubjectPart).filter(Boolean).join(", ");
  const subject = `Lu Fraili: ${action} | ${party}${type === "displacement" && affected ? ` / ${affected}` : ""} | ${range}`;
  const lines = [`Familienpartei: ${party}\nZeitraum: ${range}\nP-Zeit: ${booking.is_priority ? "Ja" : "Nein"}${type === "deleted" ? "" : `\nStatus: ${type === "objection" ? statusLabels.klaerung : statusLabels[booking.status]}`}`];
  if (previous && (previous.start_date !== booking.start_date || previous.end_date !== booking.end_date)) {
    lines.push(`Vorheriger Zeitraum: ${formatGermanRange(previous.start_date, previous.end_date)}`);
  }
  if ((type === "requested" || type === "requested_again") && booking.status === "angefragt") lines.push("Wenn innerhalb von drei Tagen niemand widerspricht, kann die App die Anfrage automatisch bestätigen.");
  if (type === "objection" && input.reason) lines.push(`Grund für den Widerspruch: ${input.reason}`);
  if (type === "commented") lines.push("Der neue Kommentar steht im Verlauf der Buchung.");
  if (type === "displacement") lines.push(`Betroffene normale Buchung${affected ? `: ${affected}` : ""}. Bitte gemeinsam mit den Schlichtern klären. Es wird nichts automatisch storniert oder verkürzt.`);
  if (type === "forfeited") lines.push(`${days} P-Tage werden dem Jahreskontingent nicht wieder gutgeschrieben.`);
  return emailMessage(subject, lines, type === "deleted" ? "/jahresplanung" : `/buchung/${encodeURIComponent(booking.id)}`, type === "deleted" ? "Zur Jahresplanung" : "Zur Buchung");
}
