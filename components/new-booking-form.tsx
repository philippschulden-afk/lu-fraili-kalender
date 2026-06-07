"use client";

import { useMemo, useState } from "react";
import type { Booking, FamilyParty, Profile } from "@/lib/types";
import { calculateBookingDays, checkOverlaps } from "@/lib/rules";

export function NewBookingForm({
  profile,
  familyParties,
  remainingPriorityDays,
  septemberRuleEnabled,
  existingBookings
}: {
  profile: Profile;
  familyParties: FamilyParty[];
  remainingPriorityDays: number;
  septemberRuleEnabled: boolean;
  existingBookings: Booking[];
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isPriority, setIsPriority] = useState(false);
  const [sharedStayAllowed, setSharedStayAllowed] = useState(false);
  const [comment, setComment] = useState("");
  const [intention, setIntention] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedParty = familyParties.find((party) => party.id === profile.family_party_id);
  const days = startDate && endDate ? calculateBookingDays(startDate, endDate) : 0;
  const overlapResult = startDate && endDate && profile.family_party_id
    ? checkOverlaps({
        requested: {
          family_party_id: profile.family_party_id,
          start_date: startDate,
          end_date: endDate,
          is_priority: isPriority,
          shared_stay_allowed: sharedStayAllowed
        },
        existingBookings
      })
    : null;

  const septemberWarning = useMemo(() => {
    if (!septemberRuleEnabled || !startDate || !endDate) return "";
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const touchesSeptember = start.getMonth() <= 8 && end.getMonth() >= 8;
    if (!touchesSeptember || ["Peter", "Christoph"].includes(selectedParty?.name ?? "")) return "";
    return "Hinweis: Der September soll bevorzugt Peter und Christoph zur Verfügung stehen. Bitte vorher besonders sorgfältig abstimmen.";
  }, [endDate, septemberRuleEnabled, selectedParty?.name, startDate]);

  async function submit() {
    setMessage("");
    if (!intention) {
      setMessage("Bitte bestätige zuerst, dass du den Zeitraum wirklich nutzen möchtest.");
      return;
    }

    setBusy(true);
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        family_party_id: profile.family_party_id,
        start_date: startDate,
        end_date: endDate,
        is_priority: isPriority,
        shared_stay_allowed: sharedStayAllowed,
        comment
      })
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(result.error ?? "Die Buchungsanfrage konnte nicht gespeichert werden.");
      return;
    }

    window.location.href = `/buchung/${result.id}`;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <form className="space-y-5 rounded-lg border border-teal-100 bg-white p-5 shadow-sm" onSubmit={(event) => event.preventDefault()}>
        <label className="block">
          <span className="text-lg font-bold">Familienpartei</span>
          <select className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" value={profile.family_party_id ?? ""} disabled>
            {familyParties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-lg font-bold">Startdatum</span>
            <input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label className="block">
            <span className="text-lg font-bold">Enddatum</span>
            <input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </label>
        </div>
        <label className="flex gap-3 rounded-lg border border-teal-100 p-4">
          <input className="mt-1 h-6 w-6" type="checkbox" checked={isPriority} onChange={(e) => setIsPriority(e.target.checked)} />
          <span>
            <span className="block text-lg font-bold">P-Zeit: Ja</span>
            <span className="text-gray-700">P-Zeit bedeutet: Diese Zeit ist Teil deiner sechs Wochen Vorrangzeit pro Jahr.</span>
          </span>
        </label>
        <label className="flex gap-3 rounded-lg border border-teal-100 p-4">
          <input className="mt-1 h-6 w-6" type="checkbox" checked={sharedStayAllowed} onChange={(e) => setSharedStayAllowed(e.target.checked)} />
          <span>
            <span className="block text-lg font-bold">Gemeinsamer Aufenthalt ist möglich</span>
            <span className="text-gray-700">Aktivieren, wenn es okay ist, dass eine andere Partei im gleichen Zeitraum ebenfalls im Haus ist.</span>
          </span>
        </label>
        {!isPriority ? (
          <p className="rounded-lg bg-amber-50 p-4 text-amber-950">
            Diese Buchung ist keine P-Zeit. Sie kann durch eine gültige P-Buchung einer anderen Partei verdrängt werden.
          </p>
        ) : null}
        {overlapResult?.warning ? <p className="rounded-lg bg-amber-50 p-4 text-amber-950">{overlapResult.warning}</p> : null}
        {overlapResult && !overlapResult.allowed ? <p className="rounded-lg bg-red-50 p-4 text-red-900">{overlapResult.message}</p> : null}
        {septemberWarning ? <p className="rounded-lg bg-orange-50 p-4 text-orange-950">{septemberWarning}</p> : null}
        <label className="block">
          <span className="text-lg font-bold">Kommentar</span>
          <textarea className="focus-ring mt-2 min-h-28 w-full rounded-md border p-3 text-lg" value={comment} onChange={(e) => setComment(e.target.value)} />
        </label>
        <label className="flex gap-3 rounded-lg border border-teal-100 p-4">
          <input className="mt-1 h-6 w-6" type="checkbox" checked={intention} onChange={(e) => setIntention(e.target.checked)} />
          <span className="text-lg font-bold">Ich habe die konkrete Absicht, diesen Zeitraum zu nutzen.</span>
        </label>
      </form>
      <aside className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">Zusammenfassung</h2>
        <p className="mt-4 text-lg">Du möchtest folgenden Zeitraum anfragen:</p>
        <p className="mt-3 text-2xl font-bold">{startDate || "Startdatum"} bis {endDate || "Enddatum"}</p>
        <p className="mt-3 text-lg">P-Zeit: {isPriority ? "Ja" : "Nein"}</p>
        {isPriority ? <p className="mt-2 text-lg">Verbleibende P-Tage: {remainingPriorityDays}</p> : null}
        {days > 0 ? <p className="mt-2 text-lg">Dauer: {days} Tage</p> : null}
        <p className="mt-5 text-gray-700">
          Diese Anfrage wird an alle Familienparteien geschickt. Wenn innerhalb von drei Tagen niemand widerspricht, wird sie automatisch bestätigt.
        </p>
        <button
          onClick={submit}
          disabled={busy || !startDate || !endDate || overlapResult?.allowed === false}
          className="focus-ring mt-6 w-full rounded-lg bg-teal-700 px-6 py-4 text-xl font-bold text-white hover:bg-teal-800 disabled:bg-gray-400"
        >
          Buchungsanfrage senden
        </button>
        {message ? <p className="mt-4 rounded-lg bg-red-50 p-4 text-red-900">{message}</p> : null}
      </aside>
    </div>
  );
}
