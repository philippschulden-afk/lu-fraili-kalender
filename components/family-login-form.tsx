"use client";

import { useState } from "react";
import { familyIdentities, type FamilyIdentityName } from "@/lib/family-login-options";

export function FamilyLoginForm() {
  const [identity, setIdentity] = useState<FamilyIdentityName>(familyIdentities[0]);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/family-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ identity, password })
    });
    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setMessage(result.error ?? "Die Anmeldung hat nicht geklappt.");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form onSubmit={login} className="space-y-4">
      <label className="block">
        <span className="text-lg font-bold">Wer bist du?</span>
        <select
          className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
          value={identity}
          onChange={(event) => setIdentity(event.target.value as FamilyIdentityName)}
        >
          {familyIdentities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-lg font-bold">Passwort</span>
        <input
          className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button className="focus-ring w-full rounded-lg bg-teal-700 px-6 py-4 text-xl font-bold text-white disabled:bg-gray-400" disabled={busy}>
        Anmelden
      </button>
      {message ? <p className="rounded-lg bg-red-50 p-3 font-bold text-red-900">{message}</p> : null}
    </form>
  );
}
