import type { BookingStatus } from "@/lib/types";

export const statusLabels: Record<BookingStatus, string> = {
  angefragt: "Angefragt",
  bestaetigt: "Bestätigt",
  klaerung: "Klärung erforderlich",
  storniert: "Storniert",
  abgelehnt: "Abgelehnt"
};

export const statusClasses: Record<BookingStatus, string> = {
  angefragt: "bg-blue-100 text-blue-900 border-blue-200",
  bestaetigt: "bg-green-100 text-green-900 border-green-200",
  klaerung: "bg-orange-100 text-orange-950 border-orange-200",
  storniert: "bg-gray-100 text-gray-800 border-gray-200",
  abgelehnt: "bg-red-100 text-red-900 border-red-200"
};
