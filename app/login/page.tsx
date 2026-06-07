import { AuthButtons } from "@/components/auth-buttons";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-lg rounded-lg border border-teal-100 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold text-teal-950 sm:text-4xl">Lu Fraili Belegungskalender</h1>
        <p className="mt-4 text-xl text-gray-700">Bitte melde dich an, um Buchungen anzusehen oder einzutragen.</p>
        <div className="mt-8">
          <AuthButtons />
        </div>
      </section>
    </main>
  );
}
