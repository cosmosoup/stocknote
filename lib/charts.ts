import type { PortfolioEval, HistoryPoint, Charts, MarketData } from "@/types";

const QUICKCHART_BASE = "https://quickchart.io/chart";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#14b8a6", "#94a3b8", "#64748b",
];

function toUrl(config: object, width = 700, height = 300): string {
  const encoded = encodeURIComponent(JSON.stringify(config));
  return `${QUICKCHART_BASE}?c=${encoded}&backgroundColor=%23ffffff&width=${width}&height=${height}&v=3`;
}

/** 構成比 横棒グラフ（ドーナツ置換） */
function buildAllocationBar(portfolio: PortfolioEval[], cashJpy = 0, totalJpyWan = 0): string {
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

  // 投資資金はオレンジで表示（assets/page.tsx の BREAKDOWN カラーと統一）
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

  const height = Math.max(180, labels.length * 28 + 40);
  return toUrl(config, 700, height);
}

/** 銘柄別含損益 横棒グラフ */
function buildBar(portfolio: PortfolioEval[]): string {
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

  const height = Math.max(180, labels.length * 28 + 40);
  return toUrl(config, 700, height);
}

/** ポートフォリオ vs S&P500 累積リターン + ドローダウン
 *  - ポートフォリオ: daily_pct（銘柄ごとの前日比%を加重平均した日次リターン）を複利チェーン
 *  - S&P500: sp500_chg を複利チェーン（同じローカル通貨ベースで対等比較）
 *  ★ 同日に複数レコードがある場合は最新を使用（二重カウント防止）
 */
function buildCompare(history: HistoryPoint[]): { url: string; portPct: number; sp500Pct: number } {
  // 土日は市場が休場 → Yahoo Financeが前営業日と同じデータを返すため複利チェーンで二重カウントになる
  // → 平日データのみを使用して正確な累積リターンを計算する
  const tradingDays = history.filter(h => {
    const day = new Date(h.date + "T12:00:00Z").getUTCDay(); // 0=日, 6=土
    return day !== 0 && day !== 6;
  });
  if (tradingDays.length < 2) return { url: "", portPct: 0, sp500Pct: 0 };

  // ★ 同日の重複レコードを排除: 同じ日付の場合、最後のレコード（最新生成）を使用
  // report_date（JST）のupsert制約があっても、created_at（UTC）ベースの日付では重複が生じうる
  const uniqueByDate = new Map<string, HistoryPoint>();
  for (const h of tradingDays) {
    uniqueByDate.set(h.date, h); // 同日の場合は後から来た（より新しい）レコードで上書き
  }
  const uniqueDays = [...uniqueByDate.values()]; // Mapは挿入順を保持 → 時系列順を維持

  let portMul = 1;
  let sp500Mul = 1;
  let peakPort = 1;
  const portData: number[] = [];
  const sp500Data: number[] = [];
  const drawdownData: number[] = [];
  const labels: string[] = [];

  for (const h of uniqueDays) {
    // ポートフォリオ: 各銘柄の前日比%を現在価値で加重した日次リターンを複利チェーン
    portMul *= 1 + (h.daily_pct ?? 0) / 100;
    // S&P500: 前日比%を複利チェーン（同じローカル通貨ベース）
    sp500Mul *= 1 + (h.sp500_chg ?? 0) / 100;
    // ドローダウン: ポートフォリオのピークからの下落幅
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
    url: toUrl(config, 900, 280),
    portPct: portData[portData.length - 1] ?? 0,
    sp500Pct: sp500Data[sp500Data.length - 1] ?? 0,
  };
}

/** セクター別配分 横棒グラフ */
function buildSectorBar(portfolio: PortfolioEval[], cashJpy = 0, totalJpyWan = 0): string {
  const grandTotalJpy = totalJpyWan * 10000 + cashJpy;
  if (grandTotalJpy <= 0) return "";

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

  const height = Math.max(180, entries.length * 34 + 50);
  return toUrl(config, 700, height);
}

/** 全チャートURLを生成 */
export function buildCharts(
  portfolio: PortfolioEval[],
  history: HistoryPoint[],
  market?: Pick<MarketData, "cash_jpy" | "total_jpy">
): Charts {
  const compareResult = history.length >= 2 ? buildCompare(history) : null;
  return {
    alloc: buildAllocationBar(portfolio, market?.cash_jpy ?? 0, market?.total_jpy ?? 0),
    bar: buildBar(portfolio),
    compare: compareResult?.url ?? "",
    sector: buildSectorBar(portfolio, market?.cash_jpy ?? 0, market?.total_jpy ?? 0),
    compareStats: compareResult && history.length >= 2 ? (() => {
      const td = history.filter(h => {
        const day = new Date(h.date + "T12:00:00Z").getUTCDay();
        return day !== 0 && day !== 6;
      });
      // 重複排除（buildCompare と同じロジック）
      const uniqueMap = new Map<string, HistoryPoint>();
      for (const h of td) { uniqueMap.set(h.date, h); }
      const uniqueDays = [...uniqueMap.values()];
      return {
        portPct: compareResult.portPct,
        sp500Pct: compareResult.sp500Pct,
        startDate: uniqueDays[0]?.date ?? history[0].date,
        days: uniqueDays.length,
      };
    })() : undefined,
  };
}
