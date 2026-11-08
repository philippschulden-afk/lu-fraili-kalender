import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), save: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/booking-store", () => ({ saveBooking: mocks.save }));
vi.mock("@/lib/booking-notifications", () => ({ notifyBookingSave: mocks.notify }));
import { GET } from "@/app/api/cron/confirm-bookings/route";

function candidateQuery(data: { id: string }[] | null, error: object | null = null) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data, error })
  };
  const client = { from: vi.fn().mockReturnValue(query) };
  mocks.admin.mockReturnValue(client);
  return client;
}

const request = () => new Request("http://localhost/api/cron/confirm-bookings", {
  headers: { authorization: "Bearer test-secret" }
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("daily booking confirmation", () => {
  it("never reports or emails a confirmation when saving fails", async () => {
    candidateQuery([{ id: "booking" }]);
    mocks.save.mockResolvedValue({ result: null, error: { code: "P0001" } });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ confirmed: 0, failed: 1 });
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("notifies once after persistence and not on a repeated run", async () => {
    const client = candidateQuery([{ id: "booking" }]);
    const saved = { changed: true, booking: { id: "booking", status: "bestaetigt" } };
    mocks.save.mockResolvedValueOnce({ result: saved, error: null })
      .mockResolvedValueOnce({ result: { ...saved, changed: false }, error: null });
    expect(await (await GET(request())).json()).toEqual({ confirmed: 1, failed: 0 });
    expect(await (await GET(request())).json()).toEqual({ confirmed: 0, failed: 0 });
    expect(mocks.save).toHaveBeenCalledWith(client, { bookingId: "booking", changes: {}, autoConfirm: true });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(client, saved, null, { autoConfirmed: true });
  });

  it("does not treat a failed database read as a successful empty run", async () => {
    candidateQuery(null, { code: "failed" });
    expect((await GET(request())).status).toBe(500);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("handles a nullable candidate list", async () => {
    candidateQuery(null);
    expect(await (await GET(request())).json()).toEqual({ confirmed: 0, failed: 0 });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects an unconfigured secret before accessing bookings", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(401);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
