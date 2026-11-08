"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAppUrl } from "@/lib/auth-redirects";
import { requestPasswordReset } from "@/lib/password-reset";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function AuthButtons() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [showReset, setShowReset] = useState(false);
  const [message, setMessage] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetOk, setResetOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function signIn(formData: FormData) {
    setMessage(""); setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: String(formData.get("email") ?? "").trim(), password: String(formData.get("password") ?? "")
      });
      if (error) setMessage("Die Anmeldung hat nicht geklappt. Bitte E-Mail und Passwort prüfen.");
      else router.replace("/dashboard");
    } catch { setMessage("Die Anmeldung ist gerade nicht möglich. Bitte versuche es erneut."); }
    finally { setBusy(false); }
  }

  async function sendResetLink(formData: FormData) {
    setResetMessage(""); setBusy(true);
    const ok = await requestPasswordReset(supabase.auth, String(formData.get("reset_email") ?? ""), getAppUrl(window.location.origin));
    setResetOk(ok);
    setResetMessage(ok
      ? "Wenn die E-Mail-Adresse bekannt ist, wurde ein Link zum Zurücksetzen angefordert."
      : "Der Link konnte nicht angefordert werden. Bitte versuche es später erneut oder wende dich an einen Schlichter.");
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <form action={signIn} className="space-y-4">
        <label className="block font-bold">E-Mail-Adresse<input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" name="email" type="email" autoComplete="username" required /></label>
        <label className="block font-bold">Passwort<input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" name="password" type="password" autoComplete="current-password" required /></label>
        <button disabled={busy} className="focus-ring w-full rounded-lg bg-teal-700 px-6 py-4 text-xl font-bold text-white disabled:bg-gray-400">{busy ? "Bitte warten..." : "Anmelden"}</button>
        {message ? <p role="alert" className="text-red-800">{message}</p> : null}
      </form>
      <button type="button" aria-expanded={showReset} onClick={() => setShowReset((value) => !value)} className="focus-ring w-full rounded-lg border border-teal-700 px-5 py-3 font-bold text-teal-900">Passwort vergessen?</button>
      {showReset ? (
        <form action={sendResetLink} className="space-y-3 border-t border-teal-100 pt-4">
          <label className="block font-bold">E-Mail-Adresse<input className="focus-ring mt-2 w-full rounded-md border p-3 text-lg" name="reset_email" type="email" autoComplete="email" required /></label>
          <button disabled={busy} className="focus-ring w-full rounded-lg bg-teal-700 px-5 py-3 font-bold text-white disabled:bg-gray-400">Link zum Zurücksetzen senden</button>
          {resetMessage ? <p role={resetOk ? "status" : "alert"} className={`rounded-lg p-3 ${resetOk ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>{resetMessage}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
