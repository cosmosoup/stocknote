import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("portfolio_auth");
  return response;
}
