export const passwordSetupPath = "/auth/passwort-setzen";

export function getAppUrl(origin?: string) {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (origin) return origin;
  return "http://localhost:3000";
}

export function buildPasswordSetupRedirectUrl(appUrl: string) {
  return `${appUrl.replace(/\/$/, "")}${passwordSetupPath}`;
}

export function buildPasswordSetupCallbackRedirectUrl(appUrl: string) {
  return `${appUrl}/auth/callback?next=${passwordSetupPath}`;
}

export function getSafeNextPath(next: string | null) {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(next)) return null;
  try {
    const base = "https://lu-fraili.invalid";
    const target = new URL(next, base);
    return target.origin === base ? `${target.pathname}${target.search}${target.hash}` : null;
  } catch { return null; }
}
