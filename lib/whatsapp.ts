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
  priorityDisplacementPartyName?: string;
};

export function buildWhatsAppShareUrl(input: WhatsAppBookingShareInput) {
  return `https://wa.me/?text=${encodeURIComponent(buildWhatsAppMessage(input))}`;
}

export function buildWhatsAppMessage(input: WhatsAppBookingShareInput) {
  const range = formatGermanRange(input.startDate, input.endDate);
  const priority = input.isPriority ? "Ja" : "Nein";
  const status = statusLabels[input.status];

  if (input.type === "new_request") {
    const displacementHint = input.priorityDisplacementPartyName
      ? `\n\nHinweis: Diese P-Zeit überschneidet sich mit einer normalen Buchung von ${input.priorityDisplacementPartyName}. Bitte stimmt euch dazu ab.`
      : "";
    return `Neue Buchungsanfrage Lu Fraili

${input.familyPartyName} möchte vom ${range} nach Lu Fraili.

P-Zeit: ${priority}

Falls niemand widerspricht, wird die Buchung in 3 Tagen automatisch bestätigt.${displacementHint}`;
  }

  if (input.type === "confirmed") {
    return `Buchung bestätigt Lu Fraili

${input.familyPartyName} ist vom ${range} in Lu Fraili eingetragen.

P-Zeit: ${priority}`;
  }

  if (input.type === "cancelled") {
    return `Buchung storniert Lu Fraili

${input.familyPartyName} hat seinen Aufenthalt vom ${range} storniert.

P-Zeit: ${priority}`;
  }

  return `Lu Fraili Buchung

${input.familyPartyName}

${range}
P-Zeit: ${priority}
Status: ${status}`;
}
