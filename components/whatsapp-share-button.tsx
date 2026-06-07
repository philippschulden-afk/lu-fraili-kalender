"use client";

import { useEffect, useState } from "react";
import { buildWhatsAppShareUrl, type WhatsAppBookingShareInput } from "@/lib/whatsapp";

export function WhatsAppShareButton({
  input,
  label = "Per WhatsApp teilen"
}: {
  input: Omit<WhatsAppBookingShareInput, "appOrigin">;
  label?: string;
}) {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const href = buildWhatsAppShareUrl({ ...input, appOrigin: origin || undefined });

  return (
    <div className="rounded-lg border border-teal-100 bg-paper p-3">
      <a
        className="focus-ring inline-block rounded-lg border border-teal-700 bg-white px-4 py-3 font-bold text-teal-900"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {label}
      </a>
      <p className="mt-2 text-sm text-gray-700">
        Öffnet WhatsApp mit einem vorbereiteten Text. Du kannst ihn vor dem Senden noch ändern.
      </p>
    </div>
  );
}
