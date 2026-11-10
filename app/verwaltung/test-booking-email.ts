"use server";

import { bookingEmailEnabled, getNotificationRecipients, sendEmail } from "@/lib/email";
import { buildBookingEmail } from "@/lib/email-messages";
import { getSchlichterContext } from "@/lib/schlichter";

export async function sendTestBookingEmail(): Promise<{ ok: boolean; message: string }> {
  const { error, user, profile } = await getSchlichterContext();
  if (error || !user || !profile) return { ok: false, message: error ?? "Bitte zuerst anmelden." };
  if (!bookingEmailEnabled()) return { ok: false, message: "Buchungs-Mails sind nicht aktiviert." };

  const to = getNotificationRecipients([profile], null);
  if (to.length !== 1) return { ok: false, message: "In deinem Profil ist keine gültige E-Mail-Adresse hinterlegt." };

  const now = new Date();
  const year = now.getUTCFullYear() + 1;
  const message = buildBookingEmail({
    test: true,
    type: "requested",
    actorName: profile.full_name || profile.family_parties?.name || "Schlichter",
    booking: {
      id: "test", start_date: `${year}-06-01`, end_date: `${year}-06-08`,
      status: "angefragt", is_priority: true, family_parties: profile.family_parties
    }
  });
  const result = await sendEmail({ to, ...message, eventKey: `booking-test:${user.id}:${Math.floor(now.getTime() / 60_000)}` });
  return result.ok && result.count === 1
    ? { ok: true, message: "Resend hat die Testmail an deine hinterlegte Adresse angenommen." }
    : { ok: false, message: "Die Testmail konnte nicht versendet werden." };
}
