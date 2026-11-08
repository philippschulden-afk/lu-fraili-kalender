"use client";

import { buildWhatsAppShareUrl, type WhatsAppBookingShareInput } from "@/lib/whatsapp";

export function WhatsAppShareButton({
  input,
  label = "Per WhatsApp teilen",
  prominent = false
}: {
  input: WhatsAppBookingShareInput;
  label?: string;
  prominent?: boolean;
}) {
  const shareUrl = buildWhatsAppShareUrl(input);
  const hasValidShareUrl = shareUrl.startsWith("https://wa.me/?text=");

  if (!hasValidShareUrl) return null;

  return (
    <div className="rounded-lg border border-teal-100 bg-paper p-3">
      <button
        className={`focus-ring rounded-lg border border-teal-700 px-4 py-3 font-bold ${prominent ? "w-full bg-teal-700 text-lg text-white hover:bg-teal-800" : "bg-white text-teal-900"}`}
        type="button"
        onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
      >
        {label}
      </button>
      <p className="mt-2 text-sm text-gray-700">
        Öffnet WhatsApp mit einem vorbereiteten Text. Du kannst ihn vor dem Senden noch ändern.
      </p>
    </div>
  );
}
