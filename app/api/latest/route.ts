import { NextResponse } from "next/server";
import { getLatestReport } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await getLatestReport();
  if (!report) {
    return NextResponse.json({ error: "No report found" }, { status: 404 });
  }

  return NextResponse.json({
    report_html: report.report_html,
    summary: {
      id: report.id,
      created_at: report.created_at,
      daily_pct: report.daily_pct,
      total_pct: report.total_pct,
      total_jpy: report.total_jpy,
    },
  });
}
