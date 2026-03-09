import { NextResponse } from "next/server";
import { saveMonthlyReportLog, getMacroStrategy } from "@/lib/supabase";
import { createMonthlyReport } from "@/lib/monthly";
import { sendReportEmail } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    // 月次レポート生成
    const result = await createMonthlyReport();

    // Supabaseに保存（同月はupsert）
    await saveMonthlyReportLog({
      month: result.month,
      monthly_pct: result.monthly_pct,
      total_pct: result.total_pct,
      total_jpy: result.total_jpy,
      report_html: result.fullHtml,
    });

    // メール送信（失敗しても処理を続ける）
    const monthLabel = new Date(result.month + "-01").toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Tokyo",
    });
    try {
      await sendReportEmail(result.fullHtml, `${monthLabel} 月次`);
    } catch (emailErr) {
      console.error("Monthly email send failed:", emailErr);
    }

    return NextResponse.json({
      ok: true,
      month: result.month,
      monthly_pct: result.monthly_pct,
      total_pct: result.total_pct,
      total_jpy: result.total_jpy,
    });
  } catch (err) {
    console.error("Monthly report generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
