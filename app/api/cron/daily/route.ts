import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Vercel Cron Jobから毎日07:00 UTC (16:00 JST) に呼ばれる
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  // CRON_SECRETで保護
  const secret = request.headers.get("authorization");
  const expectedSecret = `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.CRON_SECRET && secret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // /api/report と同じ処理を内部呼び出し
  // （コード重複を避けるためRouteHandlerを直接importして再利用）
  const { POST } = await import("@/app/api/report/route");

  // GETリクエストをPOSTとして転送
  return POST();
}
