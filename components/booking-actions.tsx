"use client";

import { useState } from "react";
import type { Booking, Profile } from "@/lib/types";
import { checkCancellationWarning, shouldForfeitPriorityDaysOnCancel } from "@/lib/rules";

export function BookingActions({ booking, profile, objectionCount }: { booking: Booking; profile: Profile; objectionCount: number }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwnBooking = booking.created_by === profile.user_id;
  const isOtherParty = booking.family_party_id !== profile.family_party_id;
  const isSchlichter = profile.role === "schlichter";
  const canDecideObjection = isSchlichter && booking.status === "angefragt" && objectionCount > 0;
  const cancellationWarning = checkCancellationWarning({
    startDate: booking.start_date,
    isPriority: booking.is_priority,
    status: booking.status
  });
  const forfeitureWarningApplies = shouldForfeitPriorityDaysOnCancel(booking);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setMessage("");
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error ?? "Die Änderung konnte nicht gespeichert werden.");
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-4 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
      <h2 className="text-2xl font-bold text-teal-950">Aktionen</h2>
      {booking.status === "angefragt" && isOtherParty ? (
        <div className="space-y-3">
          <label className="block">
            <span className="font-bold">Grund für den Widerspruch</span>
            <textarea className="focus-ring mt-2 min-h-24 w-full rounded-md border p-3" value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <button
            disabled={busy}
            onClick={() => post(`/api/bookings/${booking.id}/object`, { reason })}
            className="focus-ring w-full rounded-lg bg-orange-600 px-5 py-3 text-lg font-bold text-white"
          >
            Widersprechen
          </button>
        </div>
      ) : null}
      {(isOwnBooking || isSchlichter) && !["storniert", "abgelehnt"].includes(booking.status) ? (
        <div>
          {cancellationWarning ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-amber-950">{cancellationWarning}</p> : null}
          <button
            disabled={busy}
            onClick={() => {
              if (
                forfeitureWarningApplies &&
                !window.confirm("Diese P-Zeit beginnt in weniger als einem Monat. Wenn du sie jetzt stornierst, werden die P-Tage nicht wieder deinem Kontingent gutgeschrieben. Trotzdem stornieren?")
              ) {
                return;
              }
              post(`/api/bookings/${booking.id}/status`, { status: "storniert" });
            }}
            className="focus-ring w-full rounded-lg border border-gray-400 bg-white px-5 py-3 text-lg font-bold text-gray-900"
          >
            Stornieren
          </button>
        </div>
      ) : null}
      {canDecideObjection ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button disabled={busy} onClick={() => post(`/api/bookings/${booking.id}/status`, { status: "bestaetigt" })} className="focus-ring rounded-lg bg-green-700 px-4 py-3 font-bold text-white">
            Bestätigen
          </button>
          <button disabled={busy} onClick={() => post(`/api/bookings/${booking.id}/status`, { status: "abgelehnt" })} className="focus-ring rounded-lg bg-red-700 px-4 py-3 font-bold text-white">
            Ablehnen
          </button>
        </div>
      ) : null}
      {message ? <p className="rounded-lg bg-red-50 p-3 text-red-900">{message}</p> : null}
    </div>
  );
}
