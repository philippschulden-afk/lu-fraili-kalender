"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { initializePasswordSession } from "@/lib/password-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const invalidLink = new URLSearchParams(window.location.search).has("error") || new URLSearchParams(window.location.hash.replace(/^#/, "")).has("error");
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted || invalidLink) return;
      if (session) {
        setHasSession(true);
        setSessionChecked(true);
      } else if (event === "SIGNED_OUT") {
        setHasSession(false);
      }
      if (process.env.NODE_ENV !== "production") {
        console.log("Passwort setzen Auth-Ereignis:", event, "Session aktiv:", Boolean(session));
      }
    });

    initializePasswordSession(supabase.auth, new URL(window.location.href), () => window.history.replaceState(null, "", "/auth/passwort-setzen")).then((sessionExists) => {
      if (!mounted) return;
      setHasSession(sessionExists);
      setSessionChecked(true);
      if (process.env.NODE_ENV !== "production") {
        console.log("Passwort setzen Session-Prüfung abgeschlossen:", sessionExists);
      }
    }).catch(() => {
      if (!mounted) return;
      setHasSession(false);
      setSessionChecked(true);
      setMessage("Der Zugang konnte nicht geprüft werden. Bitte lade die Seite erneut oder fordere einen neuen Link an.");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function savePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Das Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    if (password !== passwordRepeat) {
      setMessage("Die Passwörter stimmen nicht überein.");
      return;
    }

    setBusy(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) { setHasSession(false); return; }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    } catch {
      setMessage("Das Passwort konnte nicht gespeichert werden.");
      return;
    } finally { setBusy(false); }

    setPassword(""); setPasswordRepeat("");
    setSuccess(true);
    setMessage("Dein Passwort wurde gespeichert.");
    window.setTimeout(() => {
      router.replace("/dashboard");
    }, 2000);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-teal-100 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold text-teal-950 sm:text-4xl">Passwort setzen</h1>
        <p className="mt-4 text-xl text-gray-700">
          Bitte lege ein neues Passwort für deinen Zugang zum Lu-Fraili-Belegungskalender fest.
        </p>

        {sessionChecked && !hasSession ? (
          <p className="mt-6 rounded-lg bg-red-50 p-4 text-red-900">
            Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.
          </p>
        ) : null}

        {sessionChecked && hasSession ? (
          <form onSubmit={savePassword} className="mt-8 space-y-4">
            <label className="block">
              <span className="text-lg font-bold">Neues Passwort</span>
              <input
                className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="text-lg font-bold">Passwort wiederholen</span>
              <input
                className="focus-ring mt-2 w-full rounded-md border p-3 text-lg"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={passwordRepeat}
                onChange={(event) => setPasswordRepeat(event.target.value)}
                required
              />
            </label>
            <button
              className="focus-ring w-full rounded-lg bg-teal-700 px-6 py-4 text-xl font-bold text-white disabled:bg-gray-400"
              disabled={busy || success}
            >
              Passwort speichern
            </button>
          </form>
        ) : null}

        {!sessionChecked ? <p className="mt-6 rounded-lg bg-paper p-4">Link wird geprüft...</p> : null}
        {message ? (
          <p className={`mt-4 rounded-lg p-4 font-bold ${success ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"}`}>
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
