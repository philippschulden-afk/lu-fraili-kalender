import { formatGermanRange } from "@/lib/date-format";
import { statusLabels } from "@/lib/status";
import type { BookingStatus } from "@/lib/types";

export type WhatsAppShareType = "new_request" | "confirmed" | "cancelled" | "generic";

export type WhatsAppBookingShareInput = {
  type: WhatsAppShareType;
  bookingId: string;
  familyPartyName: string;
  startDate: string;
  endDate: string;
  isPriority: boolean;
  status: BookingStatus;
  appOrigin?: string;
};

export function buildWhatsAppShareUrl(input: WhatsAppBookingShareInput) {
  return `https://wa.me/?text=${encodeURIComponent(buildWhatsAppMessage(input))}`;
}

export function buildBookingShareLink(bookingId: string, appOrigin?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || appOrigin || "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/buchung/${bookingId}`;
}

export function buildWhatsAppMessage(input: WhatsAppBookingShareInput) {
  const range = formatGermanRange(input.startDate, input.endDate);
  const priority = input.isPriority ? "Ja" : "Nein";
  const status = statusLabels[input.status];
  const link = buildBookingShareLink(input.bookingId, input.appOrigin);

  if (input.type === "new_request") {
    return `🏡 Neue Buchungsanfrage Lu Fraili

${input.familyPartyName} möchte Lu Fraili buchen:

📅 ${range}
🏷️ P-Zeit: ${priority}
📌 Status: ${status}

Zur Buchung:
${link}`;
  }

  if (input.type === "confirmed") {
    return `🏡 Buchung bestätigt Lu Fraili

${input.familyPartyName} ist bestätigt:

📅 ${range}
🏷️ P-Zeit: ${priority}

Zur Buchung:
${link}`;
  }

  if (input.type === "cancelled") {
    return `🏡 Buchung storniert Lu Fraili

Die Buchung von ${input.familyPartyName} wurde storniert:

📅 ${range}
🏷️ P-Zeit: ${priority}

Zur Buchung:
${link}`;
  }

  return `🏡 Lu Fraili Buchung

${input.familyPartyName}

📅 ${range}
🏷️ P-Zeit: ${priority}
📌 Status: ${status}

Zur Buchung:
${link}`;
}
