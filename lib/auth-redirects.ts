export const passwordSetupPath = "/auth/passwort-setzen";

export function getAppUrl(origin?: string) {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (origin) return origin;
  return "http://localhost:3000";
}

export function buildPasswordSetupRedirectUrl(appUrl: string) {
  return `${appUrl}${passwordSetupPath}`;
}

export function buildPasswordSetupCallbackRedirectUrl(appUrl: string) {
  return `${appUrl}/auth/callback?next=${passwordSetupPath}`;
}

export function getSafeNextPath(next: string | null) {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}
