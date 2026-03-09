import Anthropic from "@anthropic-ai/sdk";
import { getSupabase, getMacroStrategy } from "./supabase";
import { convertMdToHtml, escHtml } from "./markdown";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export interface DailyPoint {
  date: string;
  daily_pct: number;
  total_pct: number;
  total_jpy: number;
  sp500_chg: number;
  usdjpy: number;
  vix: number;
  fear_greed: number;
}

export interface MonthlyAggregate {
  month: string;           // "2026-02"
  days: DailyPoint[];
  start_jpy: number;       // 期間最初の評価額
  end_jpy: number;         // 期間最後の評価額
  monthly_pct: number;     // (end - start) / start * 100
  end_total_pct: number;   // 月末時点の通算損益%
  max_jpy: number;
  min_jpy: number;
  avg_daily_pct: number;
  volatility: number;      // 日次リターンの標準偏差
  sp500_monthly: number;   // S&P500日次合計（月次累積の近似）
  usdjpy_start: number;
  usdjpy_end: number;
  avg_vix: number;
}

/** report_logから最新31件を取得してMonthlyAggregateを構築 */
export async function buildMonthlyAggregate(): Promise<MonthlyAggregate | null> {
  const db = getSupabase();
  const { data, error } = await db
    .from("report_log")
    .select("created_at, daily_pct, total_pct, total_jpy, market_data")
    .order("created_at", { ascending: false })
    .limit(31);

  if (error || !data || data.length < 2) return null;

  // 昇順に並び替え
  const sorted = [...data].reverse();

  const days: DailyPoint[] = sorted.map((r) => {
    const md = r.market_data as Record<string, number> | null;
    return {
      date: (r.created_at as string).slice(0, 10),
      daily_pct: (r.daily_pct as number) ?? 0,
      total_pct: (r.total_pct as number) ?? 0,
      total_jpy: (r.total_jpy as number) ?? 0,
      sp500_chg: md?.sp500_chg ?? 0,
      usdjpy: md?.usdjpy ?? 0,
      vix: md?.vix ?? 0,
      fear_greed: md?.fear_greed ?? 0,
    };
  });

  const jpyValues = days.map((d) => d.total_jpy).filter((v) => v > 0);
  const start_jpy = jpyValues[0] ?? 0;
  const end_jpy = jpyValues[jpyValues.length - 1] ?? 0;
  const monthly_pct = start_jpy > 0 ? ((end_jpy - start_jpy) / start_jpy) * 100 : 0;

  const dailyPcts = days.map((d) => d.daily_pct);
  const avg_daily_pct = dailyPcts.reduce((a, b) => a + b, 0) / dailyPcts.length;
  const variance =
    dailyPcts.reduce((a, b) => a + Math.pow(b - avg_daily_pct, 2), 0) / dailyPcts.length;
  const volatility = Math.sqrt(variance);

  const lastDate = days[days.length - 1].date;
  const month = lastDate.slice(0, 7);

  const usdjpyValues = days.map((d) => d.usdjpy).filter((v) => v > 0);
  const vixValues = days.map((d) => d.vix).filter((v) => v > 0);

  return {
    month,
    days,
    start_jpy,
    end_jpy,
    monthly_pct,
    end_total_pct: days[days.length - 1].total_pct,
    max_jpy: Math.max(...jpyValues),
    min_jpy: Math.min(...jpyValues),
    avg_daily_pct,
    volatility,
    sp500_monthly: days.reduce((sum, d) => sum + d.sp500_chg, 0),
    usdjpy_start: usdjpyValues[0] ?? 0,
    usdjpy_end: usdjpyValues[usdjpyValues.length - 1] ?? 0,
    avg_vix: vixValues.length > 0 ? vixValues.reduce((a, b) => a + b, 0) / vixValues.length : 0,
  };
}

function buildMonthlyPrompt(agg: MonthlyAggregate, macroStrategy: string): string {
  const sign = (n: number) => (n >= 0 ? "+" : "");

  const dailyTable = agg.days
    .map(
      (d) =>
        `${d.date}: 評価額 ${d.total_jpy.toFixed(0)}万円 / 日次 ${sign(d.daily_pct)}${d.daily_pct.toFixed(2)}% / S&P500 ${sign(d.sp500_chg)}${d.sp500_chg.toFixed(2)}% / USD/JPY ${d.usdjpy.toFixed(2)} / VIX ${d.vix.toFixed(2)}`
    )
    .join("\n");

  const macroSection = macroStrategy
    ? `\n## 投資戦略・マクロ仮説（オーナー設定）\n${macroStrategy}\n`
    : "";

  return `${macroSection}
## 月次サマリー（${agg.month}）
- 期間: ${agg.days[0].date} 〜 ${agg.days[agg.days.length - 1].date}（${agg.days.length}営業日）
- 期間開始評価額: ${agg.start_jpy.toFixed(0)}万円
- 期間終了評価額: ${agg.end_jpy.toFixed(0)}万円
- 月次騰落率: ${sign(agg.monthly_pct)}${agg.monthly_pct.toFixed(2)}%
- 期間中最高額: ${agg.max_jpy.toFixed(0)}万円
- 期間中最低額: ${agg.min_jpy.toFixed(0)}万円
- 通算損益率（月末）: ${sign(agg.end_total_pct)}${agg.end_total_pct.toFixed(2)}%
- 日次リターン平均: ${sign(agg.avg_daily_pct)}${agg.avg_daily_pct.toFixed(3)}%
- 日次ボラティリティ（標準偏差）: ${agg.volatility.toFixed(3)}%
- S&P500月次累積（日次合計）: ${sign(agg.sp500_monthly)}${agg.sp500_monthly.toFixed(2)}%
- vs S&P500 超過リターン: ${sign(agg.monthly_pct - agg.sp500_monthly)}${(agg.monthly_pct - agg.sp500_monthly).toFixed(2)}%
- USD/JPY: ${agg.usdjpy_start.toFixed(2)} → ${agg.usdjpy_end.toFixed(2)}
- VIX平均: ${agg.avg_vix.toFixed(2)}

## 日次データ（全${agg.days.length}日）
${dailyTable}`;
}

async function generateMonthlyReportMd(
  agg: MonthlyAggregate,
  macroStrategy: string
): Promise<string> {
  const systemPrompt = `あなたは長期投資を専門とするトップヘッジファンド・マネージャーです。
このポートフォリオのオーナーは中長期投資家（保有期間5年以上を基本とする）です。
デイトレードや短期売買は想定していません。

【投資哲学（必ず遵守）】
- 地政学リスク・戦争・パニック売りによる下落は、歴史的に見て中長期優良資産は必ず回復してきた（WWI・WWII・湾岸戦争・9.11・リーマン・コロナすべて回復）
- 売るべき判断基準は「株価が下がったこと」ではなく「中長期の投資仮説が根本から毀損されたか否か」
- 優良な個別株・インデックスは短期下落で売ることを推奨しない。耐えることが原則

【月次レポートの要件】
- これは月次戦略レポートである。日次の値動き説明ではなく、1ヶ月を通じて何が起きたのか、中長期的にどう捉えるべきかを深く分析すること
- 「今後3〜6ヶ月のポートフォリオ戦略」を必ず提言すること
- ボラティリティ・S&P500との比較・通貨影響（USD/JPY変動が円建て評価額に与えた影響の推定）について掘り下げること
- 月中の重要局面（最高値・最低値の時期・要因）を分析すること
- 月次レポートなので、日次より深く・具体的・戦略的に書くこと

【出力形式】
- 最初の出力は必ず ## から始める（タイトル行・日時行を先頭に出さない）
- 必ず絵文字見出しを使用する（例: ## 📅 月次サマリー）
- 日本語で出力する
- 【出力長の厳守】レポート全体を必ず3000トークン（目安：日本語4800文字）以内に収めること。最後のセクションを含むすべての文章を必ず完結させること。文章の途中で終わることは絶対に禁止。`;

  const userContent = buildMonthlyPrompt(agg, macroStrategy);

  const message = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    messages: [{ role: "user", content: userContent }],
    system: systemPrompt,
  });

  const content = message.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type from Claude API");
  return content.text;
}

function buildMonthlyHtml(agg: MonthlyAggregate, reportHtml: string): string {
  const monthLabel = new Date(agg.month + "-01").toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    timeZone: "Asia/Tokyo",
  });

  const generatedAt = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sign = (n: number) => (n >= 0 ? "+" : "");
  const pctColor = (n: number) => (n > 0 ? "#10b981" : n < 0 ? "#f87171" : "#94a3b8");
  const pctColorLight = (n: number) => (n > 0 ? "#008b8b" : n < 0 ? "#dc2626" : "#94a3b8");
  const excessReturn = agg.monthly_pct - agg.sp500_monthly;

  // ポートフォリオ vs S&P500 累積チャート
  const labels = agg.days.map((d) => d.date.slice(5)); // "MM-DD"
  let sp500Cum = 0;
  const chartData = agg.days.map((d) => {
    sp500Cum += d.sp500_chg;
    return {
      portfolio: ((d.total_jpy - agg.start_jpy) / agg.start_jpy * 100).toFixed(2),
      sp500: sp500Cum.toFixed(2),
    };
  });

  const chartConfig = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Portfolio",
          data: chartData.map((d) => d.portfolio),
          borderColor: "#008b8b",
          backgroundColor: "rgba(0,139,139,0.07)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: "S&P 500",
          data: chartData.map((d) => d.sp500),
          borderColor: "#94a3b8",
          backgroundColor: "transparent",
          tension: 0.3,
          pointRadius: 1,
          borderWidth: 1.5,
          borderDash: [4, 3],
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "top", labels: { color: "#64748b", font: { size: 11 } } },
      },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#f1f5f9" } },
        y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#f1f5f9" } },
      },
    },
  };
  const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&w=900&h=220&bkg=%23ffffff&v=3`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockNote 月次レポート — ${escHtml(monthLabel)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #f1f5f9;
    color: #1e293b;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', sans-serif;
    font-size: 14px;
    line-height: 1.7;
  }
  .container { max-width: 1000px; margin: 0 auto; padding: 28px 20px; }
  .header {
    padding: 24px 28px 22px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-radius: 16px;
    margin-bottom: 20px;
  }
  .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .header-brand { font-size: 1.1rem; font-weight: 400; color: #ffffff; letter-spacing: 0.06em; }
  .header-date { font-size: 0.72rem; color: #475569; }
  .hero-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
  .hero-item { padding: 0 20px; border-left: 1px solid #334155; }
  .hero-item:first-child { padding-left: 0; border-left: none; }
  .hero-label { font-size: 0.63rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 5px; }
  .hero-value { font-size: 1.4rem; font-weight: 700; color: #f8fafc; line-height: 1.1; letter-spacing: -0.02em; }
  .hero-sub { font-size: 0.78rem; font-weight: 500; margin-top: 3px; }
  @media (max-width: 700px) { .hero-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } .hero-item { padding: 0; border-left: none; } }
  .section { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 22px; margin-bottom: 18px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .section-title { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #008b8b; margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
  .section-title::after { content: ""; flex: 1; height: 1px; background: #e2e8f0; }
  .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @media (max-width: 600px) { .stats-grid { grid-template-columns: 1fr 1fr; } }
  .stat-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 12px; }
  .stat-label { font-size: 0.62rem; color: #94a3b8; letter-spacing: 0.04em; margin-bottom: 4px; text-transform: uppercase; }
  .stat-value { font-size: 1.15rem; font-weight: 700; color: #1e293b; }
  .stat-sub { font-size: 0.78rem; font-weight: 500; margin-top: 2px; color: #64748b; }
  .chart-img { width: 100%; border-radius: 10px; display: block; border: 1px solid #f1f5f9; }
  .report { line-height: 1.85; }
  .report h2:first-child { margin-top: 0; margin-bottom: 20px; padding: 0 0 14px 0; border-left: none; border-radius: 0; background: none; border-bottom: 1px solid #e2e8f0; font-size: 1.0rem; font-weight: 400; color: #64748b; }
  .report h2 { font-size: 1.05rem; color: #1e293b; margin: 26px 0 11px; padding: 9px 16px; background: #f8fafc; border-left: 3px solid #008b8b; border-radius: 0 8px 8px 0; font-weight: 600; }
  .report h3 { font-size: 0.96rem; color: #008b8b; margin: 18px 0 7px; font-weight: 600; }
  .report h4 { font-size: 0.87rem; color: #64748b; margin: 13px 0 5px; font-weight: 500; }
  .report p { margin-bottom: 11px; color: #475569; }
  .report ul, .report ol { padding-left: 22px; margin-bottom: 11px; color: #475569; }
  .report li { margin-bottom: 4px; }
  .report table { margin: 12px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; font-size: 0.82rem; width: 100%; border-collapse: collapse; }
  .report table th { background: #f8fafc; font-size: 0.8rem; font-weight: 600; color: #64748b; padding: 8px 10px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  .report table td { color: #475569; border-bottom: 1px solid #f1f5f9; padding: 8px 10px; }
  .report blockquote { border-left: 3px solid #008b8b; padding: 10px 16px; background: #f8fafc; border-radius: 0 8px 8px 0; margin: 14px 0; color: #64748b; font-style: italic; }
  .report strong { color: #1e293b; font-weight: 600; }
  .report hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
  .verdict-ok   { background: #e6f7f7; color: #008b8b; border-radius: 5px; padding: 1px 8px; font-weight: 600; }
  .verdict-warn { background: #fffbeb; color: #b45309; border-radius: 5px; padding: 1px 8px; font-weight: 600; }
  .verdict-ng   { background: #fef2f2; color: #dc2626; border-radius: 5px; padding: 1px 8px; font-weight: 600; }
</style>
</head>
<body>
<div class="container">

  <!-- ヒーローヘッダー -->
  <div class="header">
    <div class="header-top">
      <span class="header-brand">StockNote — 月次レポート</span>
      <span class="header-date">${escHtml(generatedAt)} JST</span>
    </div>
    <div class="hero-grid">
      <div class="hero-item">
        <div class="hero-label">対象期間</div>
        <div class="hero-value" style="color:#f8fafc;font-size:1.05rem">${escHtml(monthLabel)}</div>
        <div class="hero-sub" style="color:#64748b">${agg.days.length}営業日</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">月次騰落</div>
        <div class="hero-value" style="color:${pctColor(agg.monthly_pct)}">${sign(agg.monthly_pct)}${agg.monthly_pct.toFixed(2)}%</div>
        <div class="hero-sub" style="color:#64748b">${agg.start_jpy.toFixed(0)}万 → ${agg.end_jpy.toFixed(0)}万円</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">通算損益（月末）</div>
        <div class="hero-value" style="color:${pctColor(agg.end_total_pct)}">${sign(agg.end_total_pct)}${agg.end_total_pct.toFixed(2)}%</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">vs S&amp;P500</div>
        <div class="hero-value" style="color:${pctColor(excessReturn)}">${sign(excessReturn)}${excessReturn.toFixed(2)}%</div>
        <div class="hero-sub" style="color:#64748b">超過リターン</div>
      </div>
    </div>
  </div>

  <!-- 統計カード -->
  <div class="section">
    <div class="section-title">月次統計</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">期間最高値</div>
        <div class="stat-value">${agg.max_jpy.toFixed(0)}万円</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">期間最低値</div>
        <div class="stat-value">${agg.min_jpy.toFixed(0)}万円</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">日次ボラティリティ</div>
        <div class="stat-value">${agg.volatility.toFixed(3)}%</div>
        <div class="stat-sub">標準偏差（日次）</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">S&amp;P500 月次累積</div>
        <div class="stat-value" style="color:${pctColorLight(agg.sp500_monthly)}">${sign(agg.sp500_monthly)}${agg.sp500_monthly.toFixed(2)}%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">USD/JPY レンジ</div>
        <div class="stat-value" style="font-size:1rem">${agg.usdjpy_start.toFixed(2)} → ${agg.usdjpy_end.toFixed(2)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">VIX 平均</div>
        <div class="stat-value" style="color:${agg.avg_vix > 25 ? "#dc2626" : "#1e293b"}">${agg.avg_vix.toFixed(2)}</div>
      </div>
    </div>
  </div>

  <!-- パフォーマンスチャート -->
  <div class="section">
    <div class="section-title">パフォーマンス比較</div>
    <p style="color:#94a3b8;font-size:0.72rem;margin-bottom:12px">Portfolio vs S&amp;P500（期間初日を0%として累積）</p>
    <img src="${chartUrl}" alt="月次パフォーマンス" class="chart-img">
  </div>

  <!-- AI月次分析 -->
  <div class="section">
    <div class="section-title">AI Monthly Analysis — claude-opus-4-6</div>
    <div class="report">${reportHtml}</div>
  </div>

</div>
</body>
</html>`;
}

/** メイン: 月次レポートを一連で生成して返す */
export async function createMonthlyReport(): Promise<{
  month: string;
  monthly_pct: number;
  total_pct: number;
  total_jpy: number;
  fullHtml: string;
}> {
  const [agg, macroStrategy] = await Promise.all([
    buildMonthlyAggregate(),
    getMacroStrategy(),
  ]);

  if (!agg) throw new Error("月次レポート生成に必要なデータが不足しています（最低2日のデータが必要）");

  const reportMd = await generateMonthlyReportMd(agg, macroStrategy);
  const reportHtml = convertMdToHtml(reportMd);
  const fullHtml = buildMonthlyHtml(agg, reportHtml);

  return {
    month: agg.month,
    monthly_pct: agg.monthly_pct,
    total_pct: agg.end_total_pct,
    total_jpy: agg.end_jpy,
    fullHtml,
  };
}
