"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-3xl font-bold text-teal-950">Die Daten konnten nicht geladen werden.</h1>
      <p className="mt-4 text-lg">Bitte versuche es erneut. Ein Ladefehler bedeutet nicht, dass der Zeitraum frei ist.</p>
      <button onClick={reset} className="focus-ring mt-6 rounded-lg bg-teal-700 px-5 py-3 text-lg font-bold text-white">Erneut versuchen</button>
    </main>
  );
}
