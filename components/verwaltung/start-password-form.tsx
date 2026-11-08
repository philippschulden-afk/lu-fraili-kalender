"use client";

import { useState, type FormEvent } from "react";

export function StartPasswordForm({ profileId, name, onCancel, onSaved }: {
  profileId: string;
  name: string;
  onCancel: () => void;
  onSaved: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("Das Passwort ist zu lang. Bitte verwende ein kürzeres Passwort.");
      return;
    }
    if (password !== repeat) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    if (!window.confirm(`Startpasswort für ${name} wirklich ändern? Das bisherige Passwort wird ersetzt.`)) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/verwaltung/profiles/${profileId}/password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(result.error ?? "Startpasswort konnte nicht gesetzt werden.");
        return;
      }
      setPassword("");
      setRepeat("");
      onSaved(result.message ?? "Startpasswort wurde gesetzt.");
    } catch {
      setError("Startpasswort konnte nicht gesetzt werden. Bitte versuche es erneut.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="mt-4 space-y-4 border-t border-teal-100 pt-4" onSubmit={save}>
      <h3 className="text-xl font-bold text-teal-950">Startpasswort für {name}</h3>
      <p className="text-gray-700">Wähle ein eigenes Passwort mit mindestens 8 Zeichen. Es wird keine E-Mail verschickt. Bitte teile das Passwort danach nur dieser Person privat mit.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block font-bold">
          Neues Startpasswort
          <input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} required />
        </label>
        <label className="block font-bold">
          Startpasswort wiederholen
          <input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" type={visible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={72} value={repeat} onChange={(event) => setRepeat(event.target.value)} disabled={busy} required />
        </label>
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5" checked={visible} onChange={(event) => setVisible(event.target.checked)} disabled={busy} />
        Passwort anzeigen
      </label>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 font-bold text-red-900">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button className="focus-ring rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white disabled:bg-gray-400" type="submit" disabled={busy}>{busy ? "Wird gespeichert…" : "Startpasswort speichern"}</button>
        <button className="focus-ring rounded-lg border px-5 py-3 text-lg font-bold disabled:bg-gray-100" type="button" disabled={busy} onClick={onCancel}>Abbrechen</button>
      </div>
    </form>
  );
}
