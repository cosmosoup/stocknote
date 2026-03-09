import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Vercel Cron Jobから毎日 22:00 UTC (翌日07:00 JST) に呼ばれる
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  // CRON_SECRETで保護（必須 — 未設定の場合は500を返す）
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const secret = request.headers.get("authorization");
  if (secret !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // /api/report と同じ処理を内部呼び出し
  // （コード重複を避けるためRouteHandlerを直接importして再利用）
  const { POST } = await import("@/app/api/report/route");

  // GETリクエストをPOSTとして転送
  return POST();
}
