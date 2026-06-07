import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";

export function formatGermanDate(date: string | Date) {
  const value = typeof date === "string" ? parseISO(date) : date;
  return format(value, "dd.MM.yyyy", { locale: de });
}

export function formatGermanRange(startDate: string, endDate: string) {
  return `${formatGermanDate(startDate)} bis ${formatGermanDate(endDate)}`;
}
