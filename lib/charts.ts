import type { PortfolioEval, HistoryPoint, Charts, MarketData } from "@/types";

const QUICKCHART_BASE = "https://quickchart.io/chart";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6", "#94a3b8", "#64748b",
];

/** GET URLを生成（フォールバック用） */
function toUrl(config: object, width = 700, height = 300): string {
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `${QUICKCHART_BASE}?c=${encoded}&backgroundColor=%23ffffff&width=${width}&height=${height}&v=3`;
}

/**
 * QuickChart POST APIで画像を取得し base64 data URI を返す
 * → URLが長すぎてモバイルで壊れる問題を解消（画像をHTML内に埋め込む）
 * フォールバック: 取得失敗時は従来のGET URLを返す
 */
async function fetchChartBase64(config: object, width = 700, height = 300): Promise<string> {
  try {
    const res = await fetch(QUICKCHART_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: config,
        width,
        height,
        backgroundColor: "#ffffff",
        version: "3",
        devicePixelRatio: 2,
      }),
    });
    if (!res.ok) throw new Error(`QuickChart POST ${res.status}`);
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch {
    // フォールバック: 従来のGET URL
    return toUrl(config, width, height);
  }
}

/** 構成比 横棒グラフ設定を返す */
function buildAllocationBarConfig(
  portfolio: PortfolioEval[],
  cashJpy = 0,
  totalJpyWan = 0
): { config: object; height: number } {
  const sorted = [...portfolio].sort((a, b) => b.weight - a.weight);
  const top = sorted.slice(0, 11); // キャッシュ用に1枠空ける
  const othersWeight = sorted.slice(11).reduce((s, e) => s + e.weight, 0);

  const labels = top.map((e) => e.ticker);
  const data = top.map((e) => parseFloat(e.weight.toFixed(1)));
  if (othersWeight > 0.1) {
    labels.push("その他");
    data.push(parseFloat(othersWeight.toFixed(1)));
  }

  // キャッシュを追加（保有がある場合）
  if (cashJpy > 0 && totalJpyWan > 0) {
    const grandTotalJpy = totalJpyWan * 10000 + cashJpy;
    const cashWeight = parseFloat(((cashJpy / grandTotalJpy) * 100).toFixed(1));
    if (cashWeight > 0.1) {
      labels.push("投資資金");
      data.push(cashWeight);
    }
  }

  // 投資資金はオレンジで表示
  const bgColors = labels.map((l, i) =>
    l === "投資資金" ? "#f97316" : COLORS[i % COLORS.length]
  );

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: bgColors,
          borderWidth: 0,
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", font: { size: 11 } },
          grid: { color: "#e2e8f0" },
          max: Math.ceil(Math.max(...data) * 1.2),
        },
        y: {
          ticks: { color: "#334155", font: { size: 12 } },
          grid: { display: false },
        },
      },
    },
  };

  return { config, height: Math.max(180, labels.length * 28 + 40) };
}

/** 銘柄別含損益 横棒グラフ設定を返す */
function buildBarConfig(portfolio: PortfolioEval[]): { config: object; height: number } {
  const sorted = [...portfolio].sort((a, b) => b.gain_pct - a.gain_pct);
  const labels = sorted.map((e) => e.ticker);
  const data = sorted.map((e) => parseFloat(e.gain_pct.toFixed(1)));
  const colors = data.map((v) =>
    v >= 0 ? "rgba(16,185,129,0.85)" : "rgba(239,68,68,0.85)"
  );

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 0,
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { color: "#94a3b8", font: { size: 11 } },
          grid: { color: "#e2e8f0" },
        },
        y: {
          ticks: { color: "#334155", font: { size: 12 } },
          grid: { display: false },
        },
      },
    },
  };

  return { config, height: Math.max(180, labels.length * 28 + 40) };
}

/** ポートフォリオ vs S&P500 累積リターン + ドローダウン
 *  - ポートフォリオ: daily_pct（銘柄ごとの前日比%を加重平均した日次リターン）を複利チェーン
 *  - S&P500: sp500_chg を複利チェーン（同じローカル通貨ベースで対等比較）
 *  ★ 同日に複数レコードがある場合は最新を使用（二重カウント防止）
 */
function buildCompareConfig(
  history: HistoryPoint[]
): { config: object; portPct: number; sp500Pct: number } | null {
  // 土日は市場が休場 → Yahoo Financeが前営業日と同じデータを返すため複利チェーンで二重カウントになる
  // ※ dateキーは report_date（UNIQUE制約あり）なので同日重複は発生しない
  const tradingDays = history.filter(h => {
    const day = new Date(h.date + "T12:00:00Z").getUTCDay(); // 0=日, 6=土
    return day !== 0 && day !== 6;
  });
  if (tradingDays.length < 2) return null;

  let portMul = 1;
  let sp500Mul = 1;
  let peakPort = 1;
  const portData: number[] = [];
  const sp500Data: number[] = [];
  const drawdownData: number[] = [];
  const labels: string[] = [];

  for (const h of tradingDays) {
    portMul *= 1 + (h.daily_pct ?? 0) / 100;
    sp500Mul *= 1 + (h.sp500_chg ?? 0) / 100;
    if (portMul > peakPort) peakPort = portMul;

    portData.push(parseFloat(((portMul - 1) * 100).toFixed(2)));
    sp500Data.push(parseFloat(((sp500Mul - 1) * 100).toFixed(2)));
    drawdownData.push(parseFloat(((portMul / peakPort - 1) * 100).toFixed(2)));
    labels.push(h.date.slice(5).replace("-", "/"));
  }

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "ポートフォリオ",
          data: portData,
          borderColor: "#008b8b",
          backgroundColor: "rgba(0,139,139,0.06)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
          yAxisID: "y",
        },
        {
          label: "S&P 500",
          data: sp500Data,
          borderColor: "#94a3b8",
          backgroundColor: "transparent",
          fill: false,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 1.5,
          borderDash: [5, 3],
          yAxisID: "y",
        },
        {
          label: "ドローダウン",
          data: drawdownData,
          borderColor: "rgba(239,68,68,0.6)",
          backgroundColor: "rgba(239,68,68,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 1,
          borderDash: [3, 2],
          yAxisID: "y",
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          labels: { color: "#64748b", font: { size: 12 }, boxWidth: 16 },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", font: { size: 11 }, maxTicksLimit: 12 },
          grid: { color: "#e2e8f0" },
        },
        y: {
          ticks: { color: "#94a3b8", font: { size: 11 } },
          grid: { color: "#e2e8f0" },
        },
      },
    },
  };

  return {
    config,
    portPct: portData[portData.length - 1] ?? 0,
    sp500Pct: sp500Data[sp500Data.length - 1] ?? 0,
  };
}

/** セクター別配分 横棒グラフ設定を返す */
function buildSectorBarConfig(
  portfolio: PortfolioEval[],
  cashJpy = 0,
  totalJpyWan = 0
): { config: object; height: number } | null {
  const grandTotalJpy = totalJpyWan * 10000 + cashJpy;
  if (grandTotalJpy <= 0) return null;

  const sectorTotals = new Map<string, number>();
  for (const e of portfolio) {
    const s = e.sector ?? "その他";
    const val = e.current_price_jpy * e.shares;
    sectorTotals.set(s, (sectorTotals.get(s) ?? 0) + val);
  }
  if (cashJpy > 0) {
    sectorTotals.set("現金", (sectorTotals.get("現金") ?? 0) + cashJpy);
  }

  const entries = [...sectorTotals.entries()].sort(([, a], [, b]) => b - a);
  const labels = entries.map(([l]) => l);
  const data = entries.map(([, v]) => parseFloat(((v / grandTotalJpy) * 100).toFixed(1)));
  const bgColors = labels.map((l, i) =>
    l === "現金" ? "#cbd5e1" : COLORS[i % COLORS.length]
  );

  const config = {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 0, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 11 } }, grid: { color: "#e2e8f0" } },
        y: { ticks: { color: "#334155", font: { size: 12 } }, grid: { display: false } },
      },
    },
  };

  return { config, height: Math.max(180, entries.length * 34 + 50) };
}

/** buildCompareConfig と同じ平日フィルターで compareStats を算出 */
function computeCompareStats(
  history: HistoryPoint[],
  compareCfg: { portPct: number; sp500Pct: number }
): Charts["compareStats"] {
  const tradingDays = history.filter(h => {
    const day = new Date(h.date + "T12:00:00Z").getUTCDay();
    return day !== 0 && day !== 6;
  });
  return {
    portPct: compareCfg.portPct,
    sp500Pct: compareCfg.sp500Pct,
    startDate: tradingDays[0]?.date ?? history[0].date,
    days: tradingDays.length,
  };
}

/**
 * 全チャートを生成（base64埋め込み・非同期）
 * QuickChart POST API でグラフを base64 PNG として取得し HTML に埋め込む
 * → 長すぎる GET URL によるモバイル表示崩れを解消
 * Web表示・DB保存用（report_log.report_html）に使用する
 */
export async function buildCharts(
  portfolio: PortfolioEval[],
  history: HistoryPoint[],
  market?: Pick<MarketData, "cash_jpy" | "total_jpy">
): Promise<Charts> {
  const cashJpy = market?.cash_jpy ?? 0;
  const totalJpy = market?.total_jpy ?? 0;

  // 各チャートのconfig・高さを先に同期で計算
  const allocCfg = buildAllocationBarConfig(portfolio, cashJpy, totalJpy);
  const barCfg   = buildBarConfig(portfolio);
  const sectorCfg = buildSectorBarConfig(portfolio, cashJpy, totalJpy);
  const compareCfg = history.length >= 2 ? buildCompareConfig(history) : null;

  // 全チャートを並行して base64 取得
  const [allocUrl, barUrl, compareUrl, sectorUrl] = await Promise.all([
    fetchChartBase64(allocCfg.config, 700, allocCfg.height),
    fetchChartBase64(barCfg.config, 700, barCfg.height),
    compareCfg ? fetchChartBase64(compareCfg.config, 900, 280) : Promise.resolve(""),
    sectorCfg  ? fetchChartBase64(sectorCfg.config, 700, sectorCfg.height) : Promise.resolve(""),
  ]);

  return {
    alloc:   allocUrl,
    bar:     barUrl,
    compare: compareUrl,
    sector:  sectorUrl,
    compareStats: compareCfg ? computeCompareStats(history, compareCfg) : undefined,
  };
}

/**
 * 全チャートを生成（QuickChart GET URL・同期）
 * 画像をHTMLに埋め込まず外部URL参照にする → HTML自体が軽量
 * メール配信用に使用する（base64埋め込みだとGmailの102KB制限で本文が
 * 「メッセージの全文を表示」に切り詰められてしまうため）
 */
export function buildChartsHosted(
  portfolio: PortfolioEval[],
  history: HistoryPoint[],
  market?: Pick<MarketData, "cash_jpy" | "total_jpy">
): Charts {
  const cashJpy = market?.cash_jpy ?? 0;
  const totalJpy = market?.total_jpy ?? 0;

  const allocCfg = buildAllocationBarConfig(portfolio, cashJpy, totalJpy);
  const barCfg   = buildBarConfig(portfolio);
  const sectorCfg = buildSectorBarConfig(portfolio, cashJpy, totalJpy);
  const compareCfg = history.length >= 2 ? buildCompareConfig(history) : null;

  return {
    alloc:   toUrl(allocCfg.config, 700, allocCfg.height),
    bar:     toUrl(barCfg.config, 700, barCfg.height),
    compare: compareCfg ? toUrl(compareCfg.config, 900, 280) : "",
    sector:  sectorCfg ? toUrl(sectorCfg.config, 700, sectorCfg.height) : "",
    compareStats: compareCfg ? computeCompareStats(history, compareCfg) : undefined,
  };
}
