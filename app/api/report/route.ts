import { NextResponse } from "next/server";
import { loadPortfolio, saveReportLog, getHistoryData, getMacroStrategy, getCashJpy } from "@/lib/supabase";
import { fetchMarketData } from "@/lib/market";
import { fetchNews } from "@/lib/news";
import { generateReport } from "@/lib/claude";
import { buildCharts } from "@/lib/charts";
import { buildHtml } from "@/lib/html";
import { convertMdToHtml } from "@/lib/markdown";
import { sendReportEmail } from "@/lib/email";
import { appendDailyToSheets } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
// Vercel Pro以上でタイムアウト延長（Claude APIが最大90秒かかる）
export const maxDuration = 120;

export async function POST() {
  try {
    // 1. ポートフォリオ読み込み
    const portfolio = await loadPortfolio();
    if (portfolio.length === 0) {
      return NextResponse.json(
        { error: "No portfolio data found in Supabase" },
        { status: 400 }
      );
    }

    // 2. 並行データ取得（市場データ・ニュース・履歴・マクロ戦略・キャッシュ）
    const [cashJpy, news, history, macroStrategy] = await Promise.all([
      getCashJpy(),
      fetchNews(),
      getHistoryData(30),
      getMacroStrategy(),
    ]);
    const market = await fetchMarketData(portfolio, cashJpy);

    // 3. Claude APIでレポート生成
    const reportMd = await generateReport(market, news, history, macroStrategy);
    const reportHtml = convertMdToHtml(reportMd);

    // 4. チャートURL生成
    const charts = buildCharts(market.portfolio, history, market);

    // 5. HTMLビルド
    const fullHtml = buildHtml(market, reportHtml, charts);

    // 6. Supabaseに保存
    await saveReportLog({
      daily_pct: market.daily_pct,
      total_pct: market.total_pct,
      total_jpy: market.total_jpy,
      market_data: market as object,
      report_html: fullHtml,
    });

    // 7. Google Sheets に日次データ追記（環境変数未設定時はスキップ）
    try {
      await appendDailyToSheets(market);
    } catch (sheetsErr) {
      console.error("Google Sheets append failed:", sheetsErr);
    }

    // 8. メール送信（失敗しても処理を続ける）
    const dateStr = new Date(market.generated_at).toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
    });
    try {
      await sendReportEmail(fullHtml, dateStr);
    } catch (emailErr) {
      console.error("Email send failed:", emailErr);
    }

    return NextResponse.json({
      ok: true,
      daily_pct: market.daily_pct,
      total_pct: market.total_pct,
      total_jpy: market.total_jpy,
      generated_at: market.generated_at,
    });
  } catch (err) {
    console.error("Report generation error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
