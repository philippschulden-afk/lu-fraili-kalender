import { calculateForfeitedPriorityDays, hasExistingForfeiture } from "@/lib/rules";
import type { Booking, PriorityDayForfeiture } from "@/lib/types";

type AdminClient = {
  from: (table: string) => any;
};

export async function createPriorityDayForfeitureIfNeeded(input: {
  admin: AdminClient;
  booking: Booking;
  reason: string;
  createdBy: string | null;
  forfeitedDays?: number;
}) {
  const { data: existingData } = await input.admin
    .from("priority_day_forfeitures")
    .select("*")
    .eq("booking_id", input.booking.id);
  const existing = (existingData ?? []) as PriorityDayForfeiture[];
  if (hasExistingForfeiture(existing, input.booking.id, input.reason)) {
    return { created: false, forfeitedDays: 0 };
  }

  const forfeitedDays = input.forfeitedDays ?? calculateForfeitedPriorityDays(input.booking);
  if (forfeitedDays <= 0) return { created: false, forfeitedDays: 0 };

  await input.admin.from("priority_day_forfeitures").insert({
    family_party_id: input.booking.family_party_id,
    booking_id: input.booking.id,
    year: new Date(`${input.booking.start_date}T00:00:00`).getFullYear(),
    forfeited_days: forfeitedDays,
    reason: input.reason,
    created_by: input.createdBy
  });

  await input.admin.from("booking_events").insert({
    booking_id: input.booking.id,
    event_type: "priority_days_forfeited",
    message: `${forfeitedDays} P-Tage verfallen: ${input.reason}.`,
    created_by: input.createdBy
  });

  return { created: true, forfeitedDays };
}
