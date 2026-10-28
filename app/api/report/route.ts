import { NextResponse } from "next/server";
import { loadPortfolio, saveReportLog, getHistoryData, getMacroStrategy, getCashJpy, getOtherAssets, saveAssetSnapshot } from "@/lib/supabase";
import { fetchMarketData, fetchBtcJpy } from "@/lib/market";
import { fetchNews } from "@/lib/news";
import { generateReport } from "@/lib/claude";
import { buildCharts, buildChartsHosted } from "@/lib/charts";
import { buildHtml } from "@/lib/html";
import { convertMdToHtml } from "@/lib/markdown";
import { sendReportEmail } from "@/lib/email";
import { appendDailyToSheets } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
// 構造分析を含むレポートはClaude APIの生成に2分前後かかる（実測128秒）ため、余裕を持って300秒（Fluid compute上限）
export const maxDuration = 300;

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

    // 2. 並行データ取得（市場データ・ニュース・履歴・マクロ戦略・キャッシュ・その他資産）
    // history: チャート用(直近30件) / longHistory: AIの構造分析用(約1年分。期間別の対S&P500成績・ドローダウン算出)
    const [cashJpy, news, history, longHistory, macroStrategy, otherAssets] = await Promise.all([
      getCashJpy(),
      fetchNews(),
      getHistoryData(30),
      getHistoryData(250),
      getMacroStrategy(),
      getOtherAssets(),
    ]);
    // withTrend: 1年分の日足から中期トレンド(騰落率・移動平均・高値比)を算出（AIの俯瞰分析用）
    const market = await fetchMarketData(portfolio, cashJpy, { withTrend: true });

    // 3. Claude APIでレポート生成
    const reportMd = await generateReport(market, news, longHistory, macroStrategy);

    // 「## 📰 本日のマーケットトピックス」セクションをAI分析と分離
    const TOPICS_MARKER = "## 📰 本日のマーケットトピックス";
    const markerIdx = reportMd.indexOf(TOPICS_MARKER);
    let analysisHtml: string;
    let topicsHtml: string;
    if (markerIdx !== -1) {
      analysisHtml = convertMdToHtml(reportMd.slice(0, markerIdx).trim());
      topicsHtml   = convertMdToHtml(reportMd.slice(markerIdx).trim());
    } else {
      analysisHtml = convertMdToHtml(reportMd);
      topicsHtml   = "";
    }

    // 4. チャートURL生成
    // Web表示・DB保存用: POST APIでbase64埋め込み → モバイルでも確実に表示
    const charts = await buildCharts(market.portfolio, history, market);
    // メール用: 外部URL参照（base64埋め込みだとHTMLが肥大化し、Gmailの102KB制限で
    // 本文が「メッセージの全文を表示」に切り詰められるため）
    const emailCharts = buildChartsHosted(market.portfolio, history, market);

    // 5. HTMLビルド（AI生成トピックスHTMLを渡す）
    const fullHtml = buildHtml(market, analysisHtml, charts, topicsHtml);
    const emailHtml = buildHtml(market, analysisHtml, emailCharts, topicsHtml);

    // 6. Supabaseに保存
    // 総資産スナップショット（失敗しても処理は続行）
    try {
      const btcPrice = await fetchBtcJpy();
      const btcJpy = Math.round(otherAssets.btc_amount * btcPrice);
      await saveAssetSnapshot({
        stocks_jpy: Math.round(market.total_jpy * 10000),
        trust_jpy: otherAssets.trust_jpy,
        btc_jpy: btcJpy,
        cash_jpy: cashJpy,
        free_cash_jpy: otherAssets.free_cash_jpy,
      });
    } catch (snapshotErr) {
      console.error("Asset snapshot save failed:", snapshotErr);
    }

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
      await sendReportEmail(emailHtml, dateStr);
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
