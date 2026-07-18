"use client";

import { useMemo, useState } from "react";
import { formatGermanDate } from "@/lib/date-format";
import { findBookingConflicts } from "@/lib/conflicts";
import { calculateBookingDays, isLessThanOneMonthBeforeStart } from "@/lib/rules";
import { statusLabels } from "@/lib/status";
import type { Booking, BookingStatus, FamilyParty, Objection, PriorityDayForfeiture, Profile, UserRole } from "@/lib/types";

type PartyRow = FamilyParty & {
  userCount: number;
  bookingCount: number;
  priorityDaysUsed: number;
};

type Message = {
  type: "success" | "error";
  text: string;
};

type ManagementPortalProps = {
  initialFamilyParties: PartyRow[];
  initialProfiles: Profile[];
  initialBookings: Booking[];
  initialObjections: Objection[];
  initialForfeitures: PriorityDayForfeiture[];
  septemberRuleEnabled: boolean;
  year: number;
  showInviteFlowDebug: boolean;
};

const bookingFilters: Array<{ value: string; label: string }> = [
  { value: "alle", label: "Alle" },
  { value: "angefragt", label: "Angefragt" },
  { value: "bestaetigt", label: "Bestätigt" },
  { value: "klaerung", label: "Klärung erforderlich" },
  { value: "storniert", label: "Storniert" },
  { value: "abgelehnt", label: "Abgelehnt" },
  { value: "p", label: "Nur P-Zeiten" }
];

export function ManagementPortal({
  initialFamilyParties,
  initialProfiles,
  initialBookings,
  initialObjections,
  initialForfeitures,
  septemberRuleEnabled,
  year,
  showInviteFlowDebug
}: ManagementPortalProps) {
  const [familyParties, setFamilyParties] = useState(initialFamilyParties);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [bookings, setBookings] = useState(initialBookings);
  const [objections] = useState(initialObjections);
  const [forfeitures] = useState(initialForfeitures);
  const [septemberEnabled, setSeptemberEnabled] = useState(septemberRuleEnabled);
  const [messages, setMessages] = useState<Record<string, Message>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [newPartyName, setNewPartyName] = useState("");
  const [showPartyForm, setShowPartyForm] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [bookingFilter, setBookingFilter] = useState("alle");
  const [priorityYear, setPriorityYear] = useState(year);
  const [newUser, setNewUser] = useState({ full_name: "", email: "", family_party_id: "", role: "user" as UserRole });
  const [comments, setComments] = useState<Record<string, string>>({});

  const partyNameById = useMemo(() => new Map(familyParties.map((party) => [party.id, party.name])), [familyParties]);
  const profileNameByUserId = useMemo(() => {
    return new Map(profiles.filter((profile) => profile.user_id).map((profile) => [profile.user_id as string, profile.full_name || profile.email]));
  }, [profiles]);

  const filteredBookings = bookings.filter((booking) => {
    if (bookingFilter === "p") return booking.is_priority;
    if (bookingFilter === "alle") return true;
    return booking.status === bookingFilter;
  });

  function setMessage(key: string, message: Message) {
    setMessages((current) => ({ ...current, [key]: message }));
  }

  async function readResult(response: Response) {
    const result = await response.json().catch(() => ({}));
    return result as { message?: string; error?: string; warning?: string; familyParty?: PartyRow; profile?: Profile };
  }

  async function createParty() {
    setSavingKey("party-new");
    const response = await fetch("/api/verwaltung/family-parties", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newPartyName })
    });
    const result = await readResult(response);
    setSavingKey(null);
    if (!response.ok || !result.familyParty) {
      setMessage("party-new", { type: "error", text: result.error ?? "Die Familienpartei konnte nicht angelegt werden." });
      return;
    }
    setFamilyParties((current) => [...current, { ...result.familyParty!, userCount: 0, bookingCount: 0, priorityDaysUsed: 0 }]);
    setNewPartyName("");
    setShowPartyForm(false);
    setMessage("party-new", { type: "success", text: "Familienpartei wurde angelegt." });
  }

  async function saveParty(partyId: string) {
    const party = familyParties.find((item) => item.id === partyId);
    if (!party) return;
    setSavingKey(`party-${partyId}`);
    const response = await fetch(`/api/verwaltung/family-parties/${partyId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: party.name })
    });
    const result = await readResult(response);
    setSavingKey(null);
    setMessage(`party-${partyId}`, response.ok ? { type: "success", text: "Änderung gespeichert." } : { type: "error", text: result.error ?? "Die Änderung konnte nicht gespeichert werden." });
  }

  async function deleteParty(partyId: string) {
    if (!window.confirm("Diese Familienpartei wirklich löschen?")) return;
    setSavingKey(`party-delete-${partyId}`);
    const response = await fetch(`/api/verwaltung/family-parties/${partyId}`, { method: "DELETE" });
    const result = await readResult(response);
    setSavingKey(null);
    if (!response.ok) {
      setMessage(`party-${partyId}`, { type: "error", text: result.error ?? "Die Familienpartei konnte nicht gelöscht werden." });
      return;
    }
    setFamilyParties((current) => current.filter((party) => party.id !== partyId));
    setMessage("party-new", { type: "success", text: "Änderung gespeichert." });
  }

  async function createUser() {
    setSavingKey("user-new");
    const response = await fetch("/api/verwaltung/profiles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(newUser)
    });
    const result = await readResult(response);
    setSavingKey(null);
    if (!response.ok || !result.profile) {
      setMessage("user-new", { type: "error", text: result.error ?? "Der Nutzer konnte nicht angelegt werden." });
      return;
    }
    setProfiles((current) => {
      const others = current.filter((profile) => profile.email !== result.profile!.email);
      return [...others, result.profile!].sort((a, b) => a.email.localeCompare(b.email));
    });
    setNewUser({ full_name: "", email: "", family_party_id: "", role: "user" });
    setShowUserForm(false);
    setMessage("user-new", { type: "success", text: result.message ?? "Der Nutzer wurde angelegt. Falls keine Einladung verschickt wurde, kann er sich über die Login-Seite anmelden." });
  }

  async function testInviteFlow() {
    setSavingKey("invite-flow-test");
    const response = await fetch("/api/verwaltung/debug/invite-flow", { method: "POST" });
    const result = await readResult(response);
    setSavingKey(null);
    setMessage(
      "invite-flow-test",
      response.ok
        ? { type: "success", text: result.message ?? "Test-Einladung wurde angestoßen." }
        : { type: "error", text: result.error ?? "Der Invite-Flow-Test konnte nicht gestartet werden." }
    );
  }

  async function saveProfile(profileId: string) {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return;
    setSavingKey(`profile-${profileId}`);
    const response = await fetch(`/api/verwaltung/profiles/${profileId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        full_name: profile.full_name,
        family_party_id: profile.family_party_id,
        role: profile.role
      })
    });
    const result = await readResult(response);
    setSavingKey(null);
    setMessage(`profile-${profileId}`, response.ok ? { type: "success", text: "Änderung gespeichert." } : { type: "error", text: result.error ?? "Die Änderung konnte nicht gespeichert werden." });
  }

  async function deleteProfile(profileId: string) {
    if (!window.confirm("Diesen Nutzer wirklich entfernen?")) return;
    setSavingKey(`profile-delete-${profileId}`);
    const response = await fetch(`/api/verwaltung/profiles/${profileId}`, { method: "DELETE" });
    const result = await readResult(response);
    setSavingKey(null);
    if (!response.ok) {
      setMessage(`profile-${profileId}`, { type: "error", text: result.error ?? "Der Nutzer konnte nicht entfernt werden." });
      return;
    }
    setProfiles((current) => current.filter((profile) => profile.id !== profileId));
    setMessage("user-new", { type: "success", text: result.message ?? "Änderung gespeichert." });
  }

  async function setStartPassword(profileId: string) {
    if (!window.confirm("Startpasswort für diesen Nutzer setzen?")) return;
    setSavingKey(`profile-password-${profileId}`);
    const response = await fetch(`/api/verwaltung/profiles/${profileId}/password`, { method: "POST" });
    const result = await readResult(response);
    setSavingKey(null);
    setMessage(
      `profile-${profileId}`,
      response.ok
        ? { type: "success", text: result.message ?? "Startpasswort wurde gesetzt." }
        : { type: "error", text: result.error ?? "Startpasswort konnte nicht gesetzt werden." }
    );
  }

  async function saveBooking(bookingId: string, statusOverride?: BookingStatus) {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking) return;
    const payload = { ...booking, status: statusOverride ?? booking.status };
    const originalBooking = initialBookings.find((item) => item.id === bookingId);
    if (originalBooking?.is_priority && originalBooking.status === "bestaetigt" && isLessThanOneMonthBeforeStart(originalBooking.start_date)) {
      const dateChanged = originalBooking.start_date !== payload.start_date || originalBooking.end_date !== payload.end_date;
      const pRemoved = !payload.is_priority;
      const reduced = payload.is_priority && calculateBookingDays(payload.start_date, payload.end_date) < calculateBookingDays(originalBooking.start_date, originalBooking.end_date);
      const cancelled = payload.status === "storniert";
      if ((dateChanged || pRemoved || reduced || cancelled) && !window.confirm("Diese bestätigte P-Zeit beginnt in weniger als einem Monat. Wenn sie jetzt geändert wird, können die ursprünglich reservierten P-Tage verfallen.")) {
        return;
      }
    }
    setSavingKey(`booking-${bookingId}`);
    const response = await fetch(`/api/verwaltung/bookings/${bookingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await readResult(response);
    setSavingKey(null);
    if (!response.ok) {
      setMessage(`booking-${bookingId}`, { type: "error", text: result.error ?? "Die Buchung konnte nicht gespeichert werden." });
      return;
    }
    setBookings((current) => current.map((item) => (item.id === bookingId ? { ...payload, status: payload.status } : item)));
    setMessage(`booking-${bookingId}`, { type: "success", text: result.warning ?? "Änderung gespeichert." });
  }

  async function deleteBooking(bookingId: string) {
    if (!window.confirm("Diese Buchung wirklich dauerhaft löschen?")) return;
    setSavingKey(`booking-delete-${bookingId}`);
    const response = await fetch(`/api/verwaltung/bookings/${bookingId}`, { method: "DELETE" });
    const result = await readResult(response);
    setSavingKey(null);
    if (!response.ok) {
      setMessage(`booking-${bookingId}`, { type: "error", text: result.error ?? "Die Buchung konnte nicht gelöscht werden." });
      return;
    }
    setBookings((current) => current.filter((booking) => booking.id !== bookingId));
    setMessage("bookings", { type: "success", text: "Änderung gespeichert." });
  }

  async function addBookingComment(bookingId: string) {
    const comment = comments[bookingId]?.trim() ?? "";
    setSavingKey(`booking-comment-${bookingId}`);
    const response = await fetch(`/api/verwaltung/bookings/${bookingId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment })
    });
    const result = await readResult(response);
    setSavingKey(null);
    setMessage(`booking-${bookingId}`, response.ok ? { type: "success", text: "Änderung gespeichert." } : { type: "error", text: result.error ?? "Der Kommentar konnte nicht gespeichert werden." });
    if (response.ok) setComments((current) => ({ ...current, [bookingId]: "" }));
  }

  async function saveSettings() {
    setSavingKey("settings");
    const response = await fetch("/api/verwaltung/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ september_rule_enabled: septemberEnabled })
    });
    const result = await readResult(response);
    setSavingKey(null);
    setMessage("settings", response.ok ? { type: "success", text: "Änderung gespeichert." } : { type: "error", text: result.error ?? "Die Änderung konnte nicht gespeichert werden." });
  }

  function updateProfile(profileId: string, patch: Partial<Pick<Profile, "full_name" | "family_party_id" | "role">>) {
    setProfiles((current) => current.map((profile) => (profile.id === profileId ? { ...profile, ...patch } : profile)));
  }

  function updateParty(partyId: string, name: string) {
    setFamilyParties((current) => current.map((party) => (party.id === partyId ? { ...party, name } : party)));
  }

  function updateBooking(bookingId: string, patch: Partial<Booking>) {
    setBookings((current) => current.map((booking) => (booking.id === bookingId ? { ...booking, ...patch } : booking)));
  }

  function pDaysUsedForParty(partyId: string) {
    return bookings
      .filter((booking) => booking.family_party_id === partyId && booking.is_priority && ["angefragt", "bestaetigt", "klaerung"].includes(booking.status) && new Date(`${booking.start_date}T00:00:00`).getFullYear() === priorityYear)
      .reduce((sum, booking) => sum + calculateBookingDays(booking.start_date, booking.end_date), 0);
  }

  function forfeitedDaysForParty(partyId: string) {
    return forfeitures
      .filter((forfeiture) => forfeiture.family_party_id === partyId && forfeiture.year === priorityYear)
      .reduce((sum, forfeiture) => sum + forfeiture.forfeited_days, 0);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold text-teal-950">Familienparteien verwalten</h2>
          <button className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white" onClick={() => setShowPartyForm((value) => !value)}>
            + Familienpartei anlegen
          </button>
        </div>
        {showPartyForm ? (
          <div className="mt-4 rounded-lg bg-paper p-4">
            <label className="block">
              <span className="font-bold">Name</span>
              <input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" value={newPartyName} onChange={(event) => setNewPartyName(event.target.value)} />
            </label>
            <button className="focus-ring mt-3 rounded-lg bg-teal-700 px-5 py-3 font-bold text-white" disabled={savingKey === "party-new"} onClick={createParty}>
              Speichern
            </button>
          </div>
        ) : null}
        {messages["party-new"] ? <MessageLine message={messages["party-new"]} /> : null}
        <div className="mt-5 space-y-4">
          {familyParties.map((party) => {
            const userCount = profiles.filter((profile) => profile.family_party_id === party.id).length;
            const bookingCount = bookings.filter((booking) => booking.family_party_id === party.id).length;
            return (
              <div key={party.id} className="rounded-lg border border-teal-100 p-4">
                <div className="grid gap-3 lg:grid-cols-[1.2fr_120px_140px_170px_auto_auto] lg:items-end">
                  <label className="block">
                    <span className="font-bold">Name</span>
                    <input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" value={party.name} onChange={(event) => updateParty(party.id, event.target.value)} />
                  </label>
                  <Metric label="Nutzer" value={userCount} />
                  <Metric label="Buchungen" value={bookingCount} />
                  <Metric label={`P-Tage ${year}`} value={`${party.priorityDaysUsed} / 42`} />
                  <button className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white disabled:bg-gray-400" disabled={savingKey === `party-${party.id}`} onClick={() => saveParty(party.id)}>
                    Speichern
                  </button>
                  <button className="focus-ring rounded-lg border border-red-300 bg-white px-5 py-3 text-lg font-bold text-red-800 disabled:bg-gray-100" disabled={savingKey === `party-delete-${party.id}`} onClick={() => deleteParty(party.id)}>
                    Löschen
                  </button>
                </div>
                {messages[`party-${party.id}`] ? <MessageLine message={messages[`party-${party.id}`]} /> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-teal-950">Nutzer verwalten</h2>
            <p className="mt-2 text-gray-700">Neue Nutzer erscheinen hier nach der ersten Anmeldung und können dann einer Familienpartei zugeordnet werden.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {showInviteFlowDebug ? (
              <button
                className="focus-ring rounded-lg border border-orange-300 bg-orange-50 px-5 py-3 text-lg font-bold text-orange-950 disabled:bg-gray-100"
                disabled={savingKey === "invite-flow-test"}
                onClick={testInviteFlow}
              >
                Invite-Flow testen
              </button>
            ) : null}
            <button className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white" onClick={() => setShowUserForm((value) => !value)}>
              + Nutzer einladen
            </button>
          </div>
        </div>
        {messages["invite-flow-test"] ? <MessageLine message={messages["invite-flow-test"]} /> : null}
        {showUserForm ? (
          <div className="mt-4 grid gap-3 rounded-lg bg-paper p-4 lg:grid-cols-[1fr_1fr_220px_170px_auto] lg:items-end">
            <TextInput label="Name" value={newUser.full_name} onChange={(value) => setNewUser((current) => ({ ...current, full_name: value }))} />
            <TextInput label="E-Mail" value={newUser.email} type="email" onChange={(value) => setNewUser((current) => ({ ...current, email: value }))} />
            <Select label="Familienpartei" value={newUser.family_party_id} onChange={(value) => setNewUser((current) => ({ ...current, family_party_id: value }))}>
              <option value="">Bitte zuordnen</option>
              {familyParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
            </Select>
            <Select label="Rolle" value={newUser.role} onChange={(value) => setNewUser((current) => ({ ...current, role: value as UserRole }))}>
              <option value="user">Nutzer</option>
              <option value="schlichter">Schlichter</option>
            </Select>
            <button className="focus-ring rounded-lg bg-teal-700 px-5 py-3 font-bold text-white" disabled={savingKey === "user-new"} onClick={createUser}>Speichern</button>
          </div>
        ) : null}
        {messages["user-new"] ? <MessageLine message={messages["user-new"]} /> : null}
        <div className="mt-5 space-y-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-lg border border-teal-100 p-4">
              <div className="grid gap-3 xl:grid-cols-[1fr_1.2fr_220px_170px_130px_auto_auto_auto] xl:items-end">
                <TextInput label="Name" value={profile.full_name ?? ""} onChange={(value) => updateProfile(profile.id, { full_name: value })} />
                <div><p className="font-bold">E-Mail</p><p className="mt-2 rounded-md bg-paper p-3 text-lg break-words">{profile.email}</p></div>
                <Select label="Familienpartei" value={profile.family_party_id ?? ""} onChange={(value) => updateProfile(profile.id, { family_party_id: value || null })}>
                  <option value="">Bitte zuordnen</option>
                  {familyParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                </Select>
                <Select label="Rolle" value={profile.role} onChange={(value) => updateProfile(profile.id, { role: value as UserRole })}>
                  <option value="user">Nutzer</option>
                  <option value="schlichter">Schlichter</option>
                </Select>
                <div><p className="font-bold">Erstellt am</p><p className="mt-2 rounded-md bg-paper p-3">{formatGermanDate(profile.created_at)}</p></div>
                <button className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white disabled:bg-gray-400" disabled={savingKey === `profile-${profile.id}`} onClick={() => saveProfile(profile.id)}>Speichern</button>
                <button className="focus-ring rounded-lg border border-teal-700 bg-white px-5 py-3 text-lg font-bold text-teal-900 disabled:bg-gray-100" disabled={savingKey === `profile-password-${profile.id}`} onClick={() => setStartPassword(profile.id)}>Startpasswort setzen</button>
                <button className="focus-ring rounded-lg border border-red-300 bg-white px-5 py-3 text-lg font-bold text-red-800 disabled:bg-gray-100" disabled={savingKey === `profile-delete-${profile.id}`} onClick={() => deleteProfile(profile.id)}>Nutzer entfernen</button>
              </div>
              {!profile.family_party_id ? <p className="mt-3 inline-flex rounded-full bg-orange-100 px-3 py-1 font-bold text-orange-950">Noch keiner Familienpartei zugeordnet</p> : <p className="mt-3 text-gray-700">Zugeordnet zu {partyNameById.get(profile.family_party_id) ?? "Familienpartei"}</p>}
              {messages[`profile-${profile.id}`] ? <MessageLine message={messages[`profile-${profile.id}`]} /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">Buchungen verwalten</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {bookingFilters.map((filter) => (
            <button key={filter.value} className={`rounded-lg border px-4 py-3 font-bold ${bookingFilter === filter.value ? "border-teal-700 bg-teal-700 text-white" : "border-teal-200 bg-white text-teal-950"}`} onClick={() => setBookingFilter(filter.value)}>
              {filter.label}
            </button>
          ))}
        </div>
        {messages.bookings ? <MessageLine message={messages.bookings} /> : null}
        <div className="mt-5 space-y-4">
          {filteredBookings.map((booking) => {
            const bookingObjections = objections.filter((objection) => objection.booking_id === booking.id);
            const conflictLabels = findBookingConflicts({
              requested: booking,
              existingBookings: bookings,
              ignoreBookingId: booking.id
            });
            const hasConfirmedOverlap = conflictLabels.some((conflict) => conflict.booking.status === "bestaetigt");
            const hasDisplacement = conflictLabels.some((conflict) => conflict.kind === "priority_displacement");
            const canDecideBooking = booking.status === "angefragt" && bookingObjections.length > 0;
            return (
              <div key={booking.id} className="rounded-lg border border-teal-100 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {hasConfirmedOverlap ? <Label text="Überschneidung" tone="amber" /> : null}
                  {bookingObjections.length ? <Label text="Widerspruch" tone="orange" /> : null}
                  {booking.status === "klaerung" ? <Label text="Klärung erforderlich" tone="orange" /> : null}
                  {hasDisplacement ? <Label text="P-Zeit verdrängt normale Buchung" tone="red" /> : null}
                </div>
                <div className="grid gap-3 xl:grid-cols-[150px_150px_220px_120px_150px_1fr] xl:items-end">
                  <TextInput label="Startdatum" value={booking.start_date} type="date" onChange={(value) => updateBooking(booking.id, { start_date: value })} />
                  <TextInput label="Enddatum" value={booking.end_date} type="date" onChange={(value) => updateBooking(booking.id, { end_date: value })} />
                  <Select label="Familienpartei" value={booking.family_party_id} onChange={(value) => updateBooking(booking.id, { family_party_id: value })}>
                    {familyParties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
                  </Select>
                  <Select label="P-Zeit" value={booking.is_priority ? "ja" : "nein"} onChange={(value) => updateBooking(booking.id, { is_priority: value === "ja" })}>
                    <option value="nein">Nein</option>
                    <option value="ja">Ja</option>
                  </Select>
                  <Select label="Status" value={booking.status} onChange={(value) => updateBooking(booking.id, { status: value as BookingStatus })}>
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                  <TextInput label="Kommentar" value={booking.comment ?? ""} onChange={(value) => updateBooking(booking.id, { comment: value })} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_1fr]">
                  <label className="flex gap-3 rounded-lg bg-paper p-3">
                    <input className="mt-1 h-5 w-5" type="checkbox" checked={booking.shared_stay_allowed} onChange={(event) => updateBooking(booking.id, { shared_stay_allowed: event.target.checked })} />
                    <span className="font-bold">Gemeinsamer Aufenthalt ist möglich</span>
                  </label>
                  <Info label="Erstellt von" value={profileNameByUserId.get(booking.created_by) ?? "Unbekannt"} />
                  <Info label="Erstellt am" value={formatGermanDate(booking.created_at)} />
                </div>
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-950">Diese Änderung überschreibt die normale Regelprüfung.</p>
                {canDecideBooking ? (
                  <div className="mt-3 rounded-lg bg-orange-50 p-3 text-orange-950">
                    <p className="font-bold">Widersprüche</p>
                    {bookingObjections.map((objection) => <p key={objection.id} className="mt-1">{objection.reason}</p>)}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="rounded-lg bg-green-700 px-4 py-3 font-bold text-white" onClick={() => saveBooking(booking.id, "bestaetigt")}>Trotz Widerspruch bestätigen</button>
                      <button className="rounded-lg bg-red-700 px-4 py-3 font-bold text-white" onClick={() => saveBooking(booking.id, "abgelehnt")}>Buchung ablehnen</button>
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="rounded-lg bg-teal-700 px-4 py-3 font-bold text-white" disabled={savingKey === `booking-${booking.id}`} onClick={() => saveBooking(booking.id)}>Speichern</button>
                  {!["storniert", "abgelehnt"].includes(booking.status) ? (
                    <button className="rounded-lg border border-gray-400 bg-white px-4 py-3 font-bold" onClick={() => saveBooking(booking.id, "storniert")}>Stornieren</button>
                  ) : null}
                  <button className="rounded-lg border border-red-300 bg-white px-4 py-3 font-bold text-red-800" onClick={() => deleteBooking(booking.id)}>Buchung löschen</button>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
                  <input className="focus-ring rounded-md border p-3" placeholder="Kommentar hinzufügen" value={comments[booking.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [booking.id]: event.target.value }))} />
                  <button className="rounded-lg bg-teal-700 px-4 py-3 font-bold text-white" onClick={() => addBookingComment(booking.id)}>Kommentar speichern</button>
                </div>
                {messages[`booking-${booking.id}`] ? <MessageLine message={messages[`booking-${booking.id}`]} /> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="text-2xl font-bold text-teal-950">P-Tage prüfen</h2>
          <TextInput label="Jahr" value={String(priorityYear)} type="number" onChange={(value) => setPriorityYear(Number(value) || year)} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <p className="rounded-lg bg-blue-50 p-4 text-blue-950 lg:col-span-2">
            Verfallene P-Tage entstehen, wenn eine bestätigte P-Zeit weniger als einen Monat vor Beginn storniert oder wesentlich geändert wurde.
          </p>
          {familyParties.map((party) => {
            const activeUsed = pDaysUsedForParty(party.id);
            const forfeitedUsed = forfeitedDaysForParty(party.id);
            const used = activeUsed + forfeitedUsed;
            const activePriorityBookings = bookings.filter((booking) => booking.family_party_id === party.id && booking.is_priority && ["angefragt", "bestaetigt", "klaerung"].includes(booking.status) && new Date(`${booking.start_date}T00:00:00`).getFullYear() === priorityYear);
            return (
              <div key={party.id} className="rounded-lg border border-teal-100 p-4">
                <h3 className="text-xl font-bold">{party.name}</h3>
                <p className="mt-2 text-lg">Aktive P-Tage: <strong>{activeUsed}</strong></p>
                <p className="text-lg">Verfallene P-Tage: <strong>{forfeitedUsed}</strong></p>
                <p className="text-lg">Verbraucht gesamt: <strong>{used} / 42</strong></p>
                <p className="text-lg">Verbleibend: <strong>{Math.max(42 - used, 0)}</strong></p>
                <div className="mt-3 space-y-1">
                  {activePriorityBookings.length ? activePriorityBookings.map((booking) => (
                    <p key={booking.id} className="rounded bg-paper p-2">{formatGermanDate(booking.start_date)} bis {formatGermanDate(booking.end_date)}: {calculateBookingDays(booking.start_date, booking.end_date)} Tage</p>
                  )) : <p className="text-gray-700">Keine aktiven P-Buchungen in diesem Jahr.</p>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">Einstellungen</h2>
        <label className="mt-5 flex gap-3 rounded-lg border border-teal-100 p-4">
          <input className="mt-1 h-6 w-6" type="checkbox" checked={septemberEnabled} onChange={(event) => setSeptemberEnabled(event.target.checked)} />
          <span><span className="block text-lg font-bold">September-Regel aktivieren</span><span className="text-gray-700">Wenn aktiv, zeigt die App bei Buchungen im September einen Hinweis, dass September bevorzugt Peter und Christoph zur Verfügung stehen soll.</span></span>
        </label>
        <button className="focus-ring mt-4 rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white disabled:bg-gray-400" disabled={savingKey === "settings"} onClick={saveSettings}>Speichern</button>
        {messages.settings ? <MessageLine message={messages.settings} /> : null}
      </section>
    </div>
  );
}

function TextInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="font-bold">{label}</span>
      <input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-bold">{label}</span>
      <select className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-md bg-paper p-3"><p className="text-sm font-bold text-gray-700">{label}</p><p className="text-2xl font-bold">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-paper p-3"><p className="text-sm font-bold text-gray-700">{label}</p><p className="font-bold">{value}</p></div>;
}

function Label({ text, tone }: { text: string; tone: "amber" | "orange" | "red" }) {
  const classes = {
    amber: "bg-amber-100 text-amber-950",
    orange: "bg-orange-100 text-orange-950",
    red: "bg-red-100 text-red-900"
  };
  return <span className={`rounded-full px-3 py-1 text-sm font-bold ${classes[tone]}`}>{text}</span>;
}

function MessageLine({ message }: { message: Message }) {
  return <p className={`mt-3 rounded-lg p-3 font-bold ${message.type === "success" ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{message.text}</p>;
}
