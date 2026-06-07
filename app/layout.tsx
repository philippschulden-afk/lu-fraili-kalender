import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lu Fraili Belegungskalender",
  description: "Privater Familienkalender für das Ferienhaus in Lu Fraili."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
