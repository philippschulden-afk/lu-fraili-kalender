import { AuthButtons } from "@/components/auth-buttons";
import { FamilyLoginForm } from "@/components/family-login-form";
import { isFamilyLoginModeEnabled } from "@/lib/family-login";

export default function LoginPage() {
  const familyLoginMode = isFamilyLoginModeEnabled();

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-teal-100 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold text-teal-950 sm:text-4xl">Lu Fraili Belegungskalender</h1>
        <p className="mt-4 text-xl text-gray-700">Bitte melde dich an, um Buchungen anzusehen oder einzutragen.</p>
        <div className="mt-8">
          {familyLoginMode ? <FamilyLoginForm /> : <AuthButtons />}
        </div>
      </section>
    </main>
  );
}
