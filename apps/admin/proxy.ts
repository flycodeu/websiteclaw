import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { adminConfig } from "@/lib/admin-config";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/api/auth/");
}

export function proxy(request: NextRequest) {
  if (adminConfig.bypassAuth) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const session = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const email = verifySessionToken(session);

  if (isPublicPath(pathname)) {
    if (pathname === "/login" && email) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    return NextResponse.next();
  }

  if (email) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        code: 401,
        message: "unauthorized",
        data: null,
        traceId: "auth_required"
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
