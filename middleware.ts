import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/cron"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // パブリックパスはスキップ
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 認証クッキー確認
  const authCookie = request.cookies.get("portfolio_auth");
  const secret = process.env.AUTH_SECRET;

  if (!secret || authCookie?.value !== secret) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
