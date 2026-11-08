import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth-context";

export default async function AccessPage() {
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");
  if (profile?.family_party_id || profile?.role === "schlichter") redirect("/dashboard");
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-3xl font-bold text-teal-950">Zugang noch nicht freigegeben</h1>
      <p className="mt-4 text-lg">Bitte wende dich an einen Schlichter. Er kann deinen Zugang einer Familienpartei zuordnen.</p>
      <form action="/api/logout" method="post" className="mt-6"><button className="focus-ring rounded-lg border border-teal-700 px-5 py-3 font-bold" type="submit">Abmelden</button></form>
    </main>
  );
}
