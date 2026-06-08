"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function SetPasswordPage() {
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
    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (session) {
        setHasSession(true);
        setSessionChecked(true);
      }
      if (process.env.NODE_ENV !== "production") {
        console.log("Passwort setzen Auth-Ereignis:", event, "Session aktiv:", Boolean(session));
      }
    });

    initializeSessionFromUrl().then((sessionExists) => {
      if (!mounted) return;
      setHasSession(sessionExists);
      setSessionChecked(true);
      if (process.env.NODE_ENV !== "production") {
        console.log("Passwort setzen Session-Prüfung abgeschlossen:", sessionExists);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function initializeSessionFromUrl() {
    if (process.env.NODE_ENV !== "production") {
      const searchParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      console.log("Passwort setzen Suchparameter:", Array.from(searchParams.keys()));
      console.log("Passwort setzen Hash-Typ:", hashParams.get("type"));
      console.log("Passwort setzen Hash enthält Session:", Boolean(hashParams.get("access_token") && hashParams.get("refresh_token")));
    }

    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get("code");
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
      window.history.replaceState(null, "", "/auth/passwort-setzen");
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      });
      window.history.replaceState(null, "", "/auth/passwort-setzen");
    }

    await new Promise((resolve) => window.setTimeout(resolve, 300));
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  }

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
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage("Das Passwort konnte nicht gespeichert werden.");
      return;
    }

    setSuccess(true);
    setMessage("Dein Passwort wurde gespeichert.");
    window.setTimeout(() => {
      window.location.href = "/dashboard";
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
