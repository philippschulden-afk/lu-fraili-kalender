import Link from "next/link";
import type { Profile } from "@/lib/types";

export function Nav({ profile }: { profile: Profile | null }) {
  return (
    <header className="border-b border-teal-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/dashboard" className="text-2xl font-bold text-teal-900">
          Lu Fraili
        </Link>
        <nav className="flex flex-wrap gap-2 text-base font-semibold">
          <Link className="rounded-md px-3 py-2 hover:bg-teal-50" href="/dashboard">
            Start
          </Link>
          <Link className="rounded-md px-3 py-2 hover:bg-teal-50" href="/jahresplanung">
            Jahresplanung
          </Link>
          <Link className="rounded-md px-3 py-2 hover:bg-teal-50" href="/buchung/neu">
            Neue Buchung
          </Link>
          <Link className="rounded-md px-3 py-2 hover:bg-teal-50" href="/meine-buchungen">
            Meine Buchungen
          </Link>
          {profile?.role === "schlichter" ? (
            <Link className="rounded-md px-3 py-2 hover:bg-teal-50" href="/verwaltung">
              Verwaltung
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
