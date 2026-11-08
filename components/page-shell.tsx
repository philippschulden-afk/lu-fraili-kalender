import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getAuthContext } from "@/lib/auth-context";

export async function getCurrentProfile() {
  return getAuthContext();
}

export async function requireProfile() {
  const context = await getCurrentProfile();
  if (!context.user) redirect("/login");
  if (!context.profile || (!context.profile.family_party_id && context.profile.role !== "schlichter")) redirect("/zugang");
  return context;
}

export async function PageShell({ children }: { children: React.ReactNode }) {
  const { profile } = await requireProfile();
  return (
    <>
      <Nav profile={profile} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </>
  );
}
