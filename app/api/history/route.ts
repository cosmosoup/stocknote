import { NextResponse } from "next/server";
import { getReportHistory } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 過去のデイリーレポート一覧（全件） */
export async function GET() {
  const history = await getReportHistory();
  return NextResponse.json(history);
}
