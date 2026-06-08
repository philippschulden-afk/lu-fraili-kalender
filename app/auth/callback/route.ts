import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSafeNextPath } from "@/lib/auth-redirects";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = getSafeNextPath(requestUrl.searchParams.get("next"));

  if (process.env.NODE_ENV !== "production") {
    console.log("Auth Callback URL:", requestUrl.toString());
    console.log("Auth Callback next:", next);
  }

  if (code) {
    const supabase = createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const redirectTarget = next ?? "/dashboard";

  if (process.env.NODE_ENV !== "production") {
    console.log("Auth Callback Ziel:", redirectTarget);
  }

  return NextResponse.redirect(new URL(redirectTarget, requestUrl.origin));
}
