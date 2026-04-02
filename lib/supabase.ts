import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PortfolioItem, ReportLog, HistoryPoint } from "@/types";

// ビルド時に初期化されないようlazyパターンで実装
let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    }
    _client = createClient(url, key);
  }
  return _client;
}

/** ポートフォリオ全件取得 */
export async function loadPortfolio(): Promise<PortfolioItem[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("portfolio")
    .select("*")
    .order("id");
  if (error) throw new Error(`Supabase portfolio error: ${error.message}`);
  return data as PortfolioItem[];
}

/** レポートログを保存（同日JST内はupsertで最新を上書き） */
export async function saveReportLog(params: {
  daily_pct: number;
  total_pct: number;
  total_jpy: number;
  market_data: object;
  report_html: string;
}): Promise<void> {
  const db = getSupabase();
  // UTC+9でJST当日日付を算出
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const reportDate = jstNow.toISOString().slice(0, 10); // "YYYY-MM-DD"
  const { error } = await db
    .from("report_log")
    .upsert(
      [{ ...params, report_date: reportDate, created_at: new Date().toISOString() }],
      { onConflict: "report_date" }
    );
  if (error) throw new Error(`Supabase upsert error: ${error.message}`);
}

/** 最新レポートを1件取得 */
export async function getLatestReport(): Promise<ReportLog | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("report_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data as ReportLog;
}

/** 過去ログ一覧（グラフ用）— 直近limit件を降順取得→時系列に戻す */
export async function getHistoryData(limit = 30): Promise<HistoryPoint[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("report_log")
    .select("created_at, daily_pct, total_pct, total_jpy, market_data")
    .order("created_at", { ascending: false }) // 最新から取得して直近limit件を確実に得る
    .limit(limit);
  if (error) return [];
  // 時系列順（古い→新しい）に並び替えて返す
  return ([...(data as {
    created_at: string;
    daily_pct: number;
    total_pct: number;
    total_jpy: number;
    market_data: { sp500_chg?: number } | null;
  }[])].reverse()).map((r) => ({
    date: r.created_at.slice(0, 10),
    daily_pct: r.daily_pct ?? 0,
    total_pct: r.total_pct,
    total_jpy: r.total_jpy,
    sp500_chg: r.market_data?.sp500_chg ?? 0,
  }));
}

/** 過去ログ一覧（履歴ページ用） */
export async function getReportHistory(limit = 60): Promise<Omit<ReportLog, "report_html" | "market_data">[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("report_log")
    .select("id, created_at, daily_pct, total_pct, total_jpy")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data as Omit<ReportLog, "report_html" | "market_data">[];
}

/** マクロ投資戦略を取得 */
export async function getMacroStrategy(): Promise<string> {
  const db = getSupabase();
  const { data, error } = await db
    .from("settings")
    .select("value")
    .eq("key", "macro_strategy")
    .single();
  if (error || !data) return "";
  return (data as { value: string }).value;
}

/** キャッシュ残高（円）を取得 */
export async function getCashJpy(): Promise<number> {
  const db = getSupabase();
  const { data, error } = await db
    .from("settings")
    .select("value")
    .eq("key", "cash_jpy")
    .single();
  if (error || !data) return 0;
  return parseInt((data as { value: string }).value, 10) || 0;
}

/** キャッシュ残高（円）を保存 */
export async function saveCashJpy(value: number): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from("settings")
    .upsert([{ key: "cash_jpy", value: String(Math.max(0, value)) }], { onConflict: "key" });
  if (error) throw new Error(`Supabase cash_jpy error: ${error.message}`);
}

/** マクロ投資戦略を保存（upsert） */
export async function saveMacroStrategy(value: string): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from("settings")
    .upsert([{ key: "macro_strategy", value }], { onConflict: "key" });
  if (error) throw new Error(`Supabase settings error: ${error.message}`);
}

export interface ReportDetail {
  id: number;
  created_at: string;
  daily_pct: number;
  total_pct: number;
  total_jpy: number;
  report_html: string;
}

/** 特定レポートの全データ取得（IDで） */
export async function getReportById(id: number): Promise<ReportDetail | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("report_log")
    .select("id, created_at, daily_pct, total_pct, total_jpy, report_html")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as ReportDetail;
}

// ─── 月次レポート関数 ───────────────────────────────────────────

export interface MonthlyReportSummary {
  id: number;
  created_at: string;
  month: string;
  total_pct: number;
  total_jpy: number;
  monthly_pct: number;
}

export interface MonthlyReportDetail extends MonthlyReportSummary {
  report_html: string;
}

/** 月次レポートを保存（同月はupsertで上書き） */
export async function saveMonthlyReportLog(params: {
  month: string;
  total_pct: number;
  total_jpy: number;
  monthly_pct: number;
  report_html: string;
}): Promise<void> {
  const db = getSupabase();
  const { error } = await db
    .from("monthly_report_log")
    .upsert(
      [{ ...params, created_at: new Date().toISOString() }],
      { onConflict: "month" }
    );
  if (error) throw new Error(`Supabase monthly upsert error: ${error.message}`);
}

/** 最新の月次レポートを1件取得 */
export async function getLatestMonthlyReport(): Promise<MonthlyReportDetail | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("monthly_report_log")
    .select("*")
    .order("month", { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  return data as MonthlyReportDetail;
}

/** 月次レポート一覧（一覧ページ用） */
export async function getMonthlyReportList(limit = 24): Promise<MonthlyReportSummary[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from("monthly_report_log")
    .select("id, created_at, month, total_pct, total_jpy, monthly_pct")
    .order("month", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data as MonthlyReportSummary[];
}

/** 指定IDの月次レポート全データを取得 */
export async function getMonthlyReportById(id: number): Promise<MonthlyReportDetail | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("monthly_report_log")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as MonthlyReportDetail;
}
