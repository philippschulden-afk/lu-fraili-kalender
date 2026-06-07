import Link from "next/link";
import { formatGermanDate } from "@/lib/date-format";
import { StatusBadge } from "@/components/status-badge";
import type { Booking } from "@/lib/types";

export function BookingCard({ booking }: { booking: Booking }) {
  const partyName = booking.family_parties?.name ?? "Familienpartei";
  return (
    <Link
      href={`/buchung/${booking.id}`}
      className="block rounded-lg border border-teal-100 bg-white p-4 shadow-sm transition hover:border-teal-300"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-lg font-bold text-teal-950">
            {booking.is_priority ? <span className="mr-2 rounded bg-teal-800 px-2 py-1 text-sm text-white">P</span> : null}
            {partyName}
          </p>
          <p className="mt-2 text-xl">
            {formatGermanDate(booking.start_date)} - {formatGermanDate(booking.end_date)}
          </p>
          {booking.comment ? <p className="mt-2 text-gray-700">{booking.comment}</p> : null}
        </div>
        <StatusBadge status={booking.status} />
      </div>
    </Link>
  );
}
