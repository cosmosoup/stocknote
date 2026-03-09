import type { MarketData } from "@/types";
import type { MonthlyAggregate } from "./monthly";

/** Google Sheets APIクライアント（lazy初期化） */
function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) return null;

  // require を使った動的インポート（ビルド時エラー防止）
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { google } = require("googleapis") as typeof import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

const SHEET_ID = () => process.env.GOOGLE_SHEETS_ID ?? "";

/**
 * 指定シートの1行目にヘッダーがなければ挿入する
 * （初回実行時のみ）
 */
async function ensureHeader(
  sheets: ReturnType<typeof getSheetsClient>,
  sheetName: string,
  headers: string[]
): Promise<void> {
  if (!sheets) return;
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID(),
      range: `${sheetName}!A1:A1`,
    });
    const existing = res.data.values?.[0]?.[0];
    if (!existing) {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID(),
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    }
  } catch {
    // シートが存在しない場合等は無視（手動でシートを作成してもらう）
  }
}

/**
 * 日次レポートデータを Google Sheets の4シートに追記する
 * 環境変数が未設定の場合は何もしない（graceful skip）
 */
export async function appendDailyToSheets(market: MarketData): Promise<void> {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID()) return;

  const dateStr = new Date(market.generated_at).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  // ── Daily シート ──────────────────────────────────────────
  await ensureHeader(sheets, "Daily", [
    "日付", "評価額(万円)", "通算損益%", "本日損益%",
    "S&P500", "NASDAQ", "VIX", "USD/JPY", "Gold", "Oil(WTI)", "Fear&Greed",
  ]);
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: "Daily!A:K",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        dateStr,
        market.total_jpy.toFixed(2),
        market.total_pct.toFixed(4),
        market.daily_pct.toFixed(4),
        market.sp500.toFixed(2),
        market.nasdaq.toFixed(2),
        market.vix.toFixed(2),
        market.usdjpy.toFixed(4),
        market.gold.toFixed(2),
        market.oil.toFixed(2),
        market.fear_greed,
      ]],
    },
  });

  // ── Holdings シート（銘柄別） ─────────────────────────────
  await ensureHeader(sheets, "Holdings", [
    "日付", "Ticker", "現在値", "前日比%", "含損益%", "構成比%",
  ]);
  const holdingRows = market.portfolio.map((e) => [
    dateStr,
    e.ticker,
    e.current_price.toFixed(e.is_jpy ? 0 : 4),
    e.change_pct.toFixed(4),
    e.gain_pct.toFixed(4),
    e.weight.toFixed(4),
  ]);
  if (holdingRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID(),
      range: "Holdings!A:F",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: holdingRows },
    });
  }

  // ── Currency シート（通貨影響分析） ──────────────────────
  await ensureHeader(sheets, "Currency", [
    "日付", "評価額(万円)", "USD/JPY", "推計評価額USD",
    "本日損益%(JPY建て)", "本日損益%(USD建て換算)",
  ]);
  const totalUsd = market.usdjpy > 0 ? (market.total_jpy * 10000) / market.usdjpy / 10000 : 0;
  // USD建て日次変動の推計: USD/JPY前日比を使って為替影響を分離
  // 近似: USD建て日次% ≈ JPY建て日次% - USD/JPYの前日変動%
  // （USD/JPY前日変動は market_data に含まれていないので、JPY建てをそのまま参考値として記録）
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: "Currency!A:F",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        dateStr,
        market.total_jpy.toFixed(2),
        market.usdjpy.toFixed(4),
        totalUsd.toFixed(4),
        market.daily_pct.toFixed(4),
        "—", // USD建て日次%は別途計算
      ]],
    },
  });
}

/**
 * 月次レポートデータを Google Sheets の Monthly シートに追記する
 */
export async function appendMonthlyToSheets(
  agg: MonthlyAggregate,
  sp500MonthlyApprox: number
): Promise<void> {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID()) return;

  await ensureHeader(sheets, "Monthly", [
    "月", "月次騰落%", "月末評価額(万円)", "月末通算損益%",
    "S&P500月次%(推計)", "超過リターン%",
    "ボラティリティ%(日次標準偏差)", "USD/JPY(月初)", "USD/JPY(月末)", "VIX平均",
  ]);

  const excessReturn = agg.monthly_pct - sp500MonthlyApprox;

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID(),
    range: "Monthly!A:J",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        agg.month,
        agg.monthly_pct.toFixed(4),
        agg.end_jpy.toFixed(2),
        agg.end_total_pct.toFixed(4),
        sp500MonthlyApprox.toFixed(4),
        excessReturn.toFixed(4),
        agg.volatility.toFixed(4),
        agg.usdjpy_start.toFixed(4),
        agg.usdjpy_end.toFixed(4),
        agg.avg_vix.toFixed(2),
      ]],
    },
  });
}
