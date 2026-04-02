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
      labels.push("キャッシュ");
      data.push(cashWeight);
    }
  }

  // キャッシュは薄いグレーで表示
  const bgColors = labels.map((l, i) =>
    l === "キャッシュ" ? "#cbd5e1" : COLORS[i % COLORS.length]
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
          ticks: { color: "#94a3b8", font: { size: 10 } },
          grid: { color: "#e2e8f0" },
          max: Math.ceil(Math.max(...data) * 1.2),
        },
        y: {
          ticks: { color: "#334155", font: { size: 11 } },
          grid: { display: false },
        },
      },
    },
  };

  const height = Math.max(220, labels.length * 34 + 50);
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
          ticks: { color: "#94a3b8", font: { size: 10 } },
          grid: { color: "#e2e8f0" },
        },
        y: {
          ticks: { color: "#334155", font: { size: 11 } },
          grid: { display: false },
        },
      },
    },
  };

  const height = Math.max(220, labels.length * 34 + 50);
  return toUrl(config, 700, height);
}

/** ポートフォリオ vs S&P500 累積リターン比較 */
function buildCompare(history: HistoryPoint[]): string {
  // 複利で累積リターンを計算: (1 + r1/100) × (1 + r2/100) × … - 1
  let portMul = 1;
  let sp500Mul = 1;
  const portData: number[] = [];
  const sp500Data: number[] = [];
  const labels: string[] = [];

  for (const h of history) {
    portMul *= 1 + (h.daily_pct ?? 0) / 100;
    sp500Mul *= 1 + (h.sp500_chg ?? 0) / 100;
    portData.push(parseFloat(((portMul - 1) * 100).toFixed(2)));
    sp500Data.push(parseFloat(((sp500Mul - 1) * 100).toFixed(2)));
    // MM/DD 形式
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
          backgroundColor: "rgba(0,139,139,0.08)",
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
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
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          labels: { color: "#64748b", font: { size: 11 }, boxWidth: 16 },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", font: { size: 10 }, maxTicksLimit: 12 },
          grid: { color: "#e2e8f0" },
        },
        y: {
          ticks: { color: "#94a3b8", font: { size: 10 } },
          grid: { color: "#e2e8f0" },
        },
      },
    },
  };

  return toUrl(config, 900, 260);
}

/** 全チャートURLを生成 */
export function buildCharts(
  portfolio: PortfolioEval[],
  history: HistoryPoint[],
  market?: Pick<MarketData, "cash_jpy" | "total_jpy">
): Charts {
  return {
    alloc: buildAllocationBar(portfolio, market?.cash_jpy ?? 0, market?.total_jpy ?? 0),
    bar: buildBar(portfolio),
    compare: history.length >= 2 ? buildCompare(history) : "",
  };
}
