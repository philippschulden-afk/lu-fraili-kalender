import { statusClasses, statusLabels } from "@/lib/status";
import type { BookingStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}
