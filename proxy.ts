import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const adminEnabled = process.env.ENABLE_ADMIN_UI === "true";

export function proxy(request: NextRequest) {
  if (!adminEnabled && request.nextUrl.pathname.startsWith("/admin")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
