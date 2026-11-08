import type { SupabaseClient } from "@supabase/supabase-js";

type SessionAuth = Pick<SupabaseClient["auth"], "getSession" | "setSession" | "exchangeCodeForSession">;

export async function initializePasswordSession(auth: SessionAuth, url: URL, clearUrl: () => void) {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const code = url.searchParams.get("code");
  const access = hash.get("access_token");
  const refresh = hash.get("refresh_token");
  try {
    if (url.searchParams.has("error") || hash.has("error")) return false;
    // getSession waits for the SDK's URL initialization; do not redeem a code twice.
    const initial = await auth.getSession();
    if (!initial.error && initial.data.session) return true;
    if (code) {
      const { error } = await auth.exchangeCodeForSession(code);
      if (error) return false;
    } else if (access && refresh) {
      const { error } = await auth.setSession({ access_token: access, refresh_token: refresh });
      if (error) return false;
    } else if (access || refresh) return false;
    const { data, error } = await auth.getSession();
    return !error && Boolean(data.session);
  } finally {
    if (code || hash.size || url.searchParams.has("error")) clearUrl();
  }
}
