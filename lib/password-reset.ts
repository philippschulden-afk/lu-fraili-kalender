import { buildPasswordSetupRedirectUrl } from "@/lib/auth-redirects";

export async function requestPasswordReset(
  auth: { resetPasswordForEmail: (email: string, options: { redirectTo: string }) => Promise<{ error: unknown }> },
  email: string,
  appUrl: string
) {
  try {
    const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: buildPasswordSetupRedirectUrl(appUrl) });
    return !error;
  } catch { return false; }
}
