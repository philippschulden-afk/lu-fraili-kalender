import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingSaveResult } from "@/lib/booking-store";

const resend = vi.hoisted(() => vi.fn());
import { getNotificationRecipients, sendEmail, sendUnassignedUserEmail } from "@/lib/email";
import { notifyBookingSave, recordEmailResult } from "@/lib/booking-notifications";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("disabled app email notifications", () => {
  it.each(["", "dummy", "configured-key"])("never contacts Resend with key %s", async (key) => {
    vi.stubEnv("RESEND_API_KEY", key);
    vi.stubGlobal("fetch", resend);
    expect(await sendEmail({ to: ["peter@example.com"], subject: "Test", html: "Test" }))
      .toEqual({ ok: true, skipped: true });
    expect(resend).not.toHaveBeenCalled();
  });

  it("does not query profiles for disabled notifications", async () => {
    const from = vi.fn();
    expect(await getNotificationRecipients({ from })).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("does not write new email history, even for old callers", async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient;
    await recordEmailResult(client, "booking", null, { ok: true }, "email_auto_confirmed");
    await recordEmailResult(client, "booking", null, { ok: false }, "email_failed");
    expect(from).not.toHaveBeenCalled();
  });

  it("does not send or query anything after booking changes or auto-confirmation", async () => {
    const from = vi.fn();
    const client = { from } as unknown as SupabaseClient;
    const saved = { changed: true, forfeited_days: 3 } as BookingSaveResult;
    await notifyBookingSave(client, saved, null);
    await notifyBookingSave(client, saved, null, { autoConfirmed: true });
    expect(from).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });

  it("also disables app messages about unassigned profiles", async () => {
    expect(await sendUnassignedUserEmail(["peter@example.com"], "new@example.com"))
      .toEqual({ ok: true, skipped: true });
    expect(resend).not.toHaveBeenCalled();
  });
});
