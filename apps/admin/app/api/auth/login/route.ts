import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, createSessionToken, isAllowedEmail, sanitizeNextPath } from "@/lib/auth";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nextPath = sanitizeNextPath(String(formData.get("next") ?? "/"));
  const fallbackUrl = new URL(`/login?error=forbidden&email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`, request.url);

  if (!email || !isAllowedEmail(email)) {
    return NextResponse.redirect(fallbackUrl);
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: createSessionToken(email),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60
  });

  return response;
}
