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

/** ポートフォリオ vs S&P500 累積リターン + ドローダウン
 *  - ポートフォリオ: total_pct（取得コストベース含損益%）を初日基準で相対化
 *  - S&P500: sp500_chg を初日から複利チェーン（初日 ≈ 0%）
 *  → 両線とも「ログ開始日からどれだけ動いたか」で揃えることで正当な比較を実現
 */
function buildCompare(history: HistoryPoint[]): string {
  if (history.length === 0) return "";

  // 初日の total_pct を基準（0%スタート）に揃える
  const basePct = history[0].total_pct;
  let sp500Mul = 1;
  let peakPort = 0;
  const portData: number[] = [];
  const sp500Data: number[] = [];
  const drawdownData: number[] = [];
  const labels: string[] = [];

  for (const h of history) {
    // ポートフォリオ: 取得コストベースの含損益を初日差分で相対化
    const portVal = parseFloat((h.total_pct - basePct).toFixed(2));

    // S&P500: 日次リターンを複利チェーン（初日の変動も含む）
    sp500Mul *= 1 + (h.sp500_chg ?? 0) / 100;
    const sp500Val = parseFloat(((sp500Mul - 1) * 100).toFixed(2));

    // ドローダウン: ポートフォリオラインのピークからの乖離
    if (portVal > peakPort) peakPort = portVal;
    const drawdown = parseFloat((portVal - peakPort).toFixed(2));

    portData.push(portVal);
    sp500Data.push(sp500Val);
    drawdownData.push(drawdown);
    labels.push(h.date.slice(5).replace("-", "/"));
  }

  const config = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "ポートフォリオ（含損益%・初日比）",
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
          label: "S&P 500（同期間累積）",
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

  return toUrl(config, 900, 280);
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
    sectorTotals.set("キャッシュ", (sectorTotals.get("キャッシュ") ?? 0) + cashJpy);
  }

  const entries = [...sectorTotals.entries()].sort(([, a], [, b]) => b - a);
  const labels = entries.map(([l]) => l);
  const data = entries.map(([, v]) => parseFloat(((v / grandTotalJpy) * 100).toFixed(1)));
  const bgColors = labels.map((l, i) =>
    l === "キャッシュ" ? "#cbd5e1" : COLORS[i % COLORS.length]
  );

  const config = {
    type: "bar",
    data: { labels, datasets: [{ data, backgroundColor: bgColors, borderWidth: 0, borderRadius: 4 }] },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#e2e8f0" } },
        y: { ticks: { color: "#334155", font: { size: 11 } }, grid: { display: false } },
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
  return {
    alloc: buildAllocationBar(portfolio, market?.cash_jpy ?? 0, market?.total_jpy ?? 0),
    bar: buildBar(portfolio),
    compare: history.length >= 2 ? buildCompare(history) : "",
    sector: buildSectorBar(portfolio, market?.cash_jpy ?? 0, market?.total_jpy ?? 0),
  };
}
