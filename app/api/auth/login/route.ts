import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { password?: string };
    const password = body.password ?? "";

    const correctPassword = process.env.AUTH_PASSWORD;
    const secret = process.env.AUTH_SECRET;

    if (!correctPassword || !secret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    if (password !== correctPassword) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // 認証成功 → httpOnlyクッキーをセット（30日間）
    const response = NextResponse.json({ ok: true });
    response.cookies.set("portfolio_auth", secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30日
      path: "/",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
