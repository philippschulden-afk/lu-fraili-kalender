"use client";

import { useMemo, useState } from "react";
import { formatGermanDate } from "@/lib/date-format";
import type { FamilyParty, Profile, UserRole } from "@/lib/types";

type PartyRow = FamilyParty & {
  userCount: number;
  priorityDaysUsed: number;
};

type ManagementPortalProps = {
  initialFamilyParties: PartyRow[];
  initialProfiles: Profile[];
  septemberRuleEnabled: boolean;
  year: number;
};

type Message = {
  type: "success" | "error";
  text: string;
};

export function ManagementPortal({
  initialFamilyParties,
  initialProfiles,
  septemberRuleEnabled,
  year
}: ManagementPortalProps) {
  const [familyParties, setFamilyParties] = useState(initialFamilyParties);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [septemberEnabled, setSeptemberEnabled] = useState(septemberRuleEnabled);
  const [messages, setMessages] = useState<Record<string, Message>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const partyNameById = useMemo(() => {
    return new Map(familyParties.map((party) => [party.id, party.name]));
  }, [familyParties]);

  function setMessage(key: string, message: Message) {
    setMessages((current) => ({ ...current, [key]: message }));
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
    const result = await response.json();
    setSavingKey(null);
    setMessage(`party-${partyId}`, response.ok ? { type: "success", text: "Änderung gespeichert." } : { type: "error", text: result.error ?? "Die Änderung konnte nicht gespeichert werden." });
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
    const result = await response.json();
    setSavingKey(null);
    setMessage(`profile-${profileId}`, response.ok ? { type: "success", text: "Änderung gespeichert." } : { type: "error", text: result.error ?? "Die Änderung konnte nicht gespeichert werden." });
  }

  async function saveSettings() {
    setSavingKey("settings");
    const response = await fetch("/api/verwaltung/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ september_rule_enabled: septemberEnabled })
    });
    const result = await response.json();
    setSavingKey(null);
    setMessage("settings", response.ok ? { type: "success", text: "Änderung gespeichert." } : { type: "error", text: result.error ?? "Die Änderung konnte nicht gespeichert werden." });
  }

  function updateProfile(profileId: string, patch: Partial<Pick<Profile, "full_name" | "family_party_id" | "role">>) {
    setProfiles((current) =>
      current.map((profile) => (profile.id === profileId ? { ...profile, ...patch } : profile))
    );
  }

  function updateParty(partyId: string, name: string) {
    setFamilyParties((current) => current.map((party) => (party.id === partyId ? { ...party, name } : party)));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">Familienparteien verwalten</h2>
        <div className="mt-5 space-y-4">
          {familyParties.map((party) => (
            <div key={party.id} className="rounded-lg border border-teal-100 p-4">
              <div className="grid gap-3 lg:grid-cols-[1.2fr_150px_170px_auto] lg:items-end">
                <label className="block">
                  <span className="font-bold">Name</span>
                  <input
                    className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
                    value={party.name}
                    onChange={(event) => updateParty(party.id, event.target.value)}
                  />
                </label>
                <div className="rounded-md bg-paper p-3">
                  <p className="text-sm font-bold text-gray-700">Nutzer</p>
                  <p className="text-2xl font-bold">{party.userCount}</p>
                </div>
                <div className="rounded-md bg-paper p-3">
                  <p className="text-sm font-bold text-gray-700">P-Tage {year}</p>
                  <p className="text-2xl font-bold">{party.priorityDaysUsed} / 42</p>
                </div>
                <button
                  className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white disabled:bg-gray-400"
                  disabled={savingKey === `party-${party.id}`}
                  onClick={() => saveParty(party.id)}
                >
                  Speichern
                </button>
              </div>
              {messages[`party-${party.id}`] ? <MessageLine message={messages[`party-${party.id}`]} /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">Nutzer verwalten</h2>
        <p className="mt-2 text-gray-700">
          Neue Nutzer erscheinen hier nach der ersten Anmeldung und können dann einer Familienpartei zugeordnet werden.
        </p>
        <div className="mt-5 space-y-4">
          {profiles.map((profile) => (
            <div key={profile.id} className="rounded-lg border border-teal-100 p-4">
              <div className="grid gap-3 xl:grid-cols-[1.1fr_1.3fr_220px_170px_140px_auto] xl:items-end">
                <label className="block">
                  <span className="font-bold">Name</span>
                  <input
                    className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
                    value={profile.full_name ?? ""}
                    onChange={(event) => updateProfile(profile.id, { full_name: event.target.value })}
                  />
                </label>
                <div>
                  <p className="font-bold">E-Mail</p>
                  <p className="mt-2 rounded-md bg-paper p-3 text-lg break-words">{profile.email}</p>
                </div>
                <label className="block">
                  <span className="font-bold">Familienpartei</span>
                  <select
                    className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
                    value={profile.family_party_id ?? ""}
                    onChange={(event) => updateProfile(profile.id, { family_party_id: event.target.value || null })}
                  >
                    <option value="">Bitte zuordnen</option>
                    {familyParties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-bold">Rolle</span>
                  <select
                    className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
                    value={profile.role}
                    onChange={(event) => updateProfile(profile.id, { role: event.target.value as UserRole })}
                  >
                    <option value="user">Nutzer</option>
                    <option value="schlichter">Schlichter</option>
                  </select>
                </label>
                <div>
                  <p className="font-bold">Erstellt am</p>
                  <p className="mt-2 rounded-md bg-paper p-3">{formatGermanDate(profile.created_at)}</p>
                </div>
                <button
                  className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white disabled:bg-gray-400"
                  disabled={savingKey === `profile-${profile.id}`}
                  onClick={() => saveProfile(profile.id)}
                >
                  Speichern
                </button>
              </div>
              {!profile.family_party_id ? (
                <p className="mt-3 inline-flex rounded-full bg-orange-100 px-3 py-1 font-bold text-orange-950">
                  Noch keiner Familienpartei zugeordnet
                </p>
              ) : (
                <p className="mt-3 text-gray-700">Zugeordnet zu {partyNameById.get(profile.family_party_id) ?? "Familienpartei"}</p>
              )}
              {messages[`profile-${profile.id}`] ? <MessageLine message={messages[`profile-${profile.id}`]} /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-teal-100 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-bold text-teal-950">Einstellungen</h2>
        <label className="mt-5 flex gap-3 rounded-lg border border-teal-100 p-4">
          <input
            className="mt-1 h-6 w-6"
            type="checkbox"
            checked={septemberEnabled}
            onChange={(event) => setSeptemberEnabled(event.target.checked)}
          />
          <span>
            <span className="block text-lg font-bold">September-Regel aktivieren</span>
            <span className="text-gray-700">
              Wenn aktiv, zeigt die App bei Buchungen im September einen Hinweis, dass September bevorzugt Peter und Christoph zur Verfügung stehen soll.
            </span>
          </span>
        </label>
        <button
          className="focus-ring mt-4 rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white disabled:bg-gray-400"
          disabled={savingKey === "settings"}
          onClick={saveSettings}
        >
          Speichern
        </button>
        {messages.settings ? <MessageLine message={messages.settings} /> : null}
      </section>
    </div>
  );
}

function MessageLine({ message }: { message: Message }) {
  return (
    <p className={`mt-3 rounded-lg p-3 font-bold ${message.type === "success" ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
      {message.text}
    </p>
  );
}
