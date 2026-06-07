"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthButtons() {
  const [showEmail, setShowEmail] = useState(false);
  const [message, setMessage] = useState("");
  const supabase = createSupabaseBrowserClient();

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
  }

  async function signInWithEmail(formData: FormData) {
    setMessage("");
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage("Die Anmeldung hat nicht geklappt. Bitte E-Mail und Passwort prüfen.");
    else window.location.href = "/dashboard";
  }

  return (
    <div className="space-y-4">
      <button
        onClick={signInWithGoogle}
        className="focus-ring w-full rounded-lg bg-teal-700 px-6 py-4 text-xl font-bold text-white hover:bg-teal-800"
      >
        Mit Google anmelden
      </button>
      <button
        onClick={() => setShowEmail((value) => !value)}
        className="focus-ring w-full rounded-lg border border-teal-700 bg-white px-6 py-4 text-lg font-bold text-teal-900"
      >
        Mit E-Mail anmelden
      </button>
      {showEmail ? (
        <form action={signInWithEmail} className="space-y-3 rounded-lg border border-teal-100 bg-white p-4">
          <label className="block">
            <span className="font-bold">E-Mail</span>
            <input className="focus-ring mt-1 w-full rounded-md border p-3" name="email" type="email" required />
          </label>
          <label className="block">
            <span className="font-bold">Passwort</span>
            <input className="focus-ring mt-1 w-full rounded-md border p-3" name="password" type="password" required />
          </label>
          <button className="focus-ring w-full rounded-lg bg-teal-700 px-5 py-3 font-bold text-white">Anmelden</button>
          {message ? <p className="text-red-800">{message}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
