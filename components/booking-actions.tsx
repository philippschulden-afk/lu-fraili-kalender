"use client";

import { useState } from "react";
import { WhatsAppShareButton } from "@/components/whatsapp-share-button";
import type { Booking, Profile } from "@/lib/types";
import { priorityCancellationForfeitureWarning, shouldForfeitPriorityDaysOnCancel } from "@/lib/rules";
import type { WhatsAppShareType } from "@/lib/whatsapp";

export function BookingActions({ booking, profile, objectionCount }: { booking: Booking; profile: Profile; objectionCount: number }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [successShare, setSuccessShare] = useState<{ type: WhatsAppShareType; label: string; status: typeof booking.status } | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwnBooking = booking.created_by === profile.user_id;
  const isOtherParty = booking.family_party_id !== profile.family_party_id;
  const isSchlichter = profile.role === "schlichter";
  const canDecideObjection = isSchlichter && booking.status === "angefragt" && objectionCount > 0;
  const forfeitureWarningApplies = shouldForfeitPriorityDaysOnCancel(booking);

  const familyPartyName = booking.family_parties?.name ?? "Familienpartei";

  async function post(url: string, body: { status?: typeof booking.status } & Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    setSuccessShare(null);
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
    if (body.status === "storniert") {
      setMessage("Buchung wurde storniert.");
      setSuccessShare({ type: "cancelled", label: "Stornierung per WhatsApp teilen", status: "storniert" });
      return;
    }
    if (body.status === "bestaetigt") {
      setMessage("Buchung wurde bestätigt.");
      setSuccessShare({ type: "confirmed", label: "Per WhatsApp teilen", status: "bestaetigt" });
      return;
    }
    if (body.status === "abgelehnt") {
      setMessage("Buchung wurde abgelehnt.");
      setSuccessShare({ type: "generic", label: "Per WhatsApp teilen", status: "abgelehnt" });
      return;
    }
    window.location.reload();
  }

  return (
    <div className="space-y-4 rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
      <h2 className="text-2xl font-bold text-teal-950">Aktionen</h2>
      <WhatsAppShareButton
        input={{
          type: "generic",
          bookingId: booking.id,
          familyPartyName,
          startDate: booking.start_date,
          endDate: booking.end_date,
          isPriority: booking.is_priority,
          status: booking.status
        }}
      />
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
          {forfeitureWarningApplies ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-amber-950">{priorityCancellationForfeitureWarning}</p> : null}
          <button
            disabled={busy}
            onClick={() => {
              if (
                forfeitureWarningApplies &&
                !window.confirm(`${priorityCancellationForfeitureWarning} Trotzdem stornieren?`)
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
      {message ? <p className={`rounded-lg p-3 font-bold ${successShare ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{message}</p> : null}
      {successShare ? (
        <WhatsAppShareButton
          label={successShare.label}
          input={{
            type: successShare.type,
            bookingId: booking.id,
            familyPartyName,
            startDate: booking.start_date,
            endDate: booking.end_date,
            isPriority: booking.is_priority,
            status: successShare.status
          }}
        />
      ) : null}
    </div>
  );
}
