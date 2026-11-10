"use client";

import { useActionState } from "react";
import { sendTestBookingEmail } from "@/app/verwaltung/test-booking-email";

export function TestBookingEmailForm() {
  const [result, action, pending] = useActionState<Awaited<ReturnType<typeof sendTestBookingEmail>> | null>(sendTestBookingEmail, null);
  return (
    <section className="mt-6 space-y-3 border-t border-teal-100 pt-6" aria-labelledby="test-booking-email-title">
      <h2 id="test-booking-email-title" className="text-xl font-bold text-teal-950">Buchungs-Mail testen</h2>
      <form action={action}>
        <button type="submit" disabled={pending} className="rounded-lg border border-teal-700 px-4 py-3 font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-60">
          {pending ? "Testmail wird gesendet …" : "Testmail nur an mich senden"}
        </button>
      </form>
      {result && <p role="status" className={result.ok ? "text-teal-900" : "text-red-800"}>{result.message}</p>}
    </section>
  );
}
