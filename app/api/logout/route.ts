import { NextResponse } from "next/server";
import { familyLoginCookieName } from "@/lib/family-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303
  });
  response.cookies.set(familyLoginCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  try {
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    // Logout should still clear the family cookie even if Supabase is not configured.
  }

  return response;
}
