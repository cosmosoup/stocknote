import type { MarketData, Charts } from "@/types";
import { escHtml } from "./markdown";

function fmt(n: number, decimals = 2): string {
  return n.toLocaleString("ja-JP", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${fmt(n, 2)}%`;
}

/** For dark hero header background */
function pctColor(n: number): string {
  if (n > 0) return "#10b981";
  if (n < 0) return "#f87171";
  return "#94a3b8";
}

/** For light section/card backgrounds */
function pctColorLight(n: number): string {
  if (n > 0) return "#008b8b";
  if (n < 0) return "#dc2626";
  return "#94a3b8";
}

function fearGreedLabel(score: number): string {
  if (score >= 75) return "Extreme Greed";
  if (score >= 55) return "Greed";
  if (score >= 45) return "Neutral";
  if (score >= 25) return "Fear";
  return "Extreme Fear";
}

function fearGreedColor(score: number): string {
  if (score >= 75) return "#dc2626";
  if (score >= 55) return "#b45309";
  if (score >= 45) return "#64748b";
  if (score >= 25) return "#2563eb";
  return "#7c3aed";
}

/** Fear&Greed 半円SVGメーター */
function buildFearGreedMeter(score: number): string {
  const cx = 100, cy = 88, r = 70, sw = 17;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // θ=0が左端、θ=180が右端、θ=90が頂点 の半円上の座標
  const pt = (theta: number, radius = r) => ({
    x: +(cx - radius * Math.cos(toRad(theta))).toFixed(1),
    y: +(cy - radius * Math.sin(toRad(theta))).toFixed(1),
  });

  // large-arc=0, sweep=1（時計回り）で上半円を通る弧（< 180°）
  const arc = (t1: number, t2: number, color: string) => {
    const p1 = pt(t1), p2 = pt(t2);
    return `<path d="M${p1.x} ${p1.y}A${r} ${r} 0 0 1 ${p2.x} ${p2.y}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="butt"/>`;
  };

  const needleAngle = Math.min(180, Math.max(0, score * 1.8));
  const tip = pt(needleAngle, r - 8);
  const scoreColor =
    score < 25 ? "#7c3aed" : score < 45 ? "#3b82f6" : score < 55 ? "#94a3b8" : score < 75 ? "#f59e0b" : "#ef4444";

  return `<svg viewBox="0 0 200 120" style="width:100%;display:block">
    ${arc(0, 45, "#7c3aed")}
    ${arc(45, 81, "#3b82f6")}
    ${arc(81, 99, "#94a3b8")}
    ${arc(99, 135, "#f59e0b")}
    ${arc(135, 180, "#ef4444")}
    <line x1="${cx}" y1="${cy}" x2="${tip.x}" y2="${tip.y}" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="#0f172a"/>
    <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="22" font-weight="700" fill="${scoreColor}" font-family="-apple-system,sans-serif">${score}</text>
  </svg>`;
}

/** HTML全体を組み立てる */
export function buildHtml(
  market: MarketData,
  reportHtml: string,
  charts: Charts
): string {
  const now = new Date(market.generated_at);
  const dateStr = now.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const fgLabel = fearGreedLabel(market.fear_greed);
  const fgColor = fearGreedColor(market.fear_greed);

  // ── マーケット指標（8個グリッド） ──
  const marketItems = [
    { label: "S&P 500",       value: fmt(market.sp500, 0),      chg: market.sp500_chg,  sub: null,    color: null },
    { label: "NASDAQ",         value: fmt(market.nasdaq, 0),     chg: market.nasdaq_chg, sub: null,    color: null },
    { label: "Gold (USD/oz)",  value: fmt(market.gold, 0),       chg: market.gold_chg,   sub: null,    color: null },
    { label: "WTI Oil",        value: fmt(market.oil, 2),        chg: market.oil_chg,    sub: null,    color: null },
    { label: "USD/JPY",        value: fmt(market.usdjpy, 2),     chg: null,              sub: null,    color: "#64748b" },
    { label: "Fear & Greed",   value: `${market.fear_greed}`,    chg: null,              sub: fgLabel, color: fgColor },
    { label: "VIX",            value: fmt(market.vix, 2),        chg: null,              sub: null,    color: market.vix > 25 ? "#dc2626" : "#64748b" },
    { label: "米10年金利",     value: `${fmt(market.tnx, 3)}%`,  chg: null,              sub: null,    color: "#64748b" },
  ];

  // 為替感応度：USD建て保有合計 → ±1円で±XX万円
  const usdHoldingsUsd = market.portfolio
    .filter((e) => !e.is_jpy)
    .reduce((sum, e) => sum + e.current_price * e.shares, 0);
  const forexImpactWan = usdHoldingsUsd / 10000;

  const marketHtml = marketItems.map((m) => {
    const valColor = m.color ?? "#1e293b";
    if (m.label === "Fear & Greed") {
      return `
    <div class="mkt-card">
      <div class="mkt-label">Fear &amp; Greed</div>
      ${buildFearGreedMeter(market.fear_greed)}
      <div class="mkt-chg" style="color:${fgColor};margin-top:-2px">${escHtml(fgLabel)}</div>
    </div>`;
    }
    return `
    <div class="mkt-card">
      <div class="mkt-label">${escHtml(m.label)}</div>
      <div class="mkt-value" style="color:${valColor}">${escHtml(m.value)}</div>
      ${m.chg !== null ? `<div class="mkt-chg" style="color:${pctColorLight(m.chg)}">${fmtPct(m.chg)}</div>` : ""}
      ${m.sub ? `<div class="mkt-chg" style="color:${valColor};opacity:0.8">${escHtml(m.sub)}</div>` : ""}
    </div>`;
  }).join("");

  const forexHtml = usdHoldingsUsd > 0 ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9">
      <span style="display:inline-flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:7px 14px;font-size:0.8rem">
        <span style="color:#94a3b8;font-size:0.68rem;letter-spacing:0.06em;text-transform:uppercase">為替感応度</span>
        <span style="color:#1e293b;font-weight:600">USD/JPY ±1円 → ±${fmt(forexImpactWan, 1)}万円</span>
        <span style="color:#94a3b8;font-size:0.72rem">（USD建て: ${fmt(usdHoldingsUsd, 0)} USD）</span>
      </span>
    </div>` : "";

  // ── 銘柄テーブル（構成比降順） ──
  const sorted = [...market.portfolio].sort((a, b) => b.weight - a.weight);
  const tableRows = sorted.map((e) => {
    const priceStr = e.is_jpy
      ? `${fmt(e.current_price, 0)}円`
      : `${fmt(e.current_price, 2)}USD`;
    const gainPctStr = fmtPct(e.gain_pct);
    const gainBar = Math.min(Math.abs(e.gain_pct), 20) * 5;
    const gainBarColor = e.gain_pct >= 0 ? "#008b8b" : "#dc2626";
    return `
    <tr>
      <td><strong style="color:#1e293b;font-size:0.95rem;font-weight:600">${escHtml(e.ticker)}</strong></td>
      <td style="color:#475569">${escHtml(priceStr)}</td>
      <td style="color:${pctColorLight(e.change_pct)};font-weight:500">${fmtPct(e.change_pct)}</td>
      <td style="color:${pctColorLight(e.gain_jpy)};font-weight:500">${e.gain_jpy >= 0 ? "+" : ""}${fmt(e.gain_jpy / 10000, 1)}万</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:${pctColorLight(e.gain_pct)};font-weight:600;min-width:60px">${gainPctStr}</span>
          <div style="height:5px;width:${gainBar}px;background:${gainBarColor};border-radius:3px;opacity:0.7"></div>
        </div>
      </td>
      <td style="color:#64748b">${fmt(e.weight, 1)}%</td>
    </tr>`;
  }).join("");

  // パフォーマンス比較グラフ + 読み方ガイド
  let chartCompare = "";
  if (charts.compare && charts.compareStats) {
    const cs = charts.compareStats;
    const diff = cs.portPct - cs.sp500Pct;
    const isWinning = diff >= 0;
    const verdict = isWinning
      ? `<span style="color:#008b8b;font-weight:700">▲ ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}% アウトパフォーム</span>`
      : `<span style="color:#dc2626;font-weight:700">▼ ${diff.toFixed(2)}% アンダーパフォーム</span>`;
    const startLabel = cs.startDate.slice(5).replace("-", "/");

    chartCompare = `<div class="chart-block">
      <div class="chart-label">ポートフォリオ vs S&amp;P 500（${startLabel}〜 累積リターン%）</div>

      <!-- 読み方ガイド -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:12px;font-size:0.82rem">
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px">
          <div style="text-align:center">
            <div style="color:#94a3b8;font-size:0.65rem;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px">ポートフォリオ（${startLabel}〜）</div>
            <div style="font-size:1.2rem;font-weight:700;color:${cs.portPct >= 0 ? "#008b8b" : "#dc2626"}">${cs.portPct >= 0 ? "+" : ""}${cs.portPct.toFixed(2)}%</div>
          </div>
          <div style="text-align:center;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
            <div style="color:#94a3b8;font-size:0.65rem;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px">S&amp;P 500（同期間）</div>
            <div style="font-size:1.2rem;font-weight:700;color:${cs.sp500Pct >= 0 ? "#64748b" : "#dc2626"}">${cs.sp500Pct >= 0 ? "+" : ""}${cs.sp500Pct.toFixed(2)}%</div>
          </div>
          <div style="text-align:center">
            <div style="color:#94a3b8;font-size:0.65rem;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px">差（${cs.days}日間）</div>
            <div style="font-size:1.1rem;font-weight:700">${verdict}</div>
          </div>
        </div>
        <div style="border-top:1px solid #e2e8f0;padding-top:8px;color:#94a3b8;font-size:0.72rem;line-height:1.6">
          <strong style="color:#64748b">グラフの見方：</strong>
          青緑の線（ポートフォリオ）が灰色点線（S&amp;P500）より<strong style="color:#64748b">上にあれば指数に勝っている</strong>、下にあれば負けている。
          赤シェードはポートフォリオの期間最高値からの下落幅（ドローダウン）。
          ※ 日次リターン（価格変動ベース）の複利累積。入金・ポジション変更は直接影響しない。
        </div>
      </div>

      <img src="${charts.compare}" alt="vs S&P500" class="chart-img">
    </div>`;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockNote — ${dateStr}</title>
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
  /* ── テーブルスクロール ── */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

  /* ── ヒーローヘッダー（ダーク） ── */
  .header {
    padding: 24px 28px 22px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    border-radius: 16px;
    margin-bottom: 20px;
  }
  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 18px;
  }
  .header-brand {
    font-size: 1.1rem;
    font-weight: 400;
    color: #ffffff;
    letter-spacing: 0.06em;
  }
  .header-date { font-size: 0.72rem; color: #475569; }
  .hero-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
  }
  .hero-item { padding: 0 24px; border-left: 1px solid #334155; }
  .hero-item:first-child { padding-left: 0; border-left: none; }
  .hero-label {
    font-size: 0.63rem;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 5px;
  }
  .hero-value {
    font-size: 1.65rem;
    font-weight: 700;
    color: #f8fafc;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }
  .hero-sub {
    font-size: 0.82rem;
    font-weight: 500;
    margin-top: 3px;
  }
  @media (max-width: 600px) {
    .container { padding: 12px; }
    .header { padding: 16px; border-radius: 12px; margin-bottom: 14px; }
    .header-top { margin-bottom: 12px; }
    .hero-grid { grid-template-columns: 1fr 1fr; gap: 12px; }
    .hero-item { padding: 0; border-left: none; }
    .hero-item:nth-child(1) { grid-column: 1 / -1; }
    .hero-value { font-size: 1.3rem; }
    .section { padding: 14px; border-radius: 10px; margin-bottom: 12px; }
    /* AI レポート内テーブルをスクロール可能に */
    .report table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; }
  }

  /* ── セクション ── */
  .section {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 22px;
    margin-bottom: 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .section-title {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #008b8b;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .section-title::after {
    content: "";
    flex: 1;
    height: 1px;
    background: #e2e8f0;
  }

  /* ── マーケット指標グリッド ── */
  .mkt-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  @media (max-width: 700px) { .mkt-grid { grid-template-columns: repeat(2, 1fr); } }
  .mkt-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 10px;
    padding: 14px 12px;
  }
  .mkt-label { font-size: 0.62rem; color: #94a3b8; letter-spacing: 0.04em; margin-bottom: 4px; text-transform: uppercase; }
  .mkt-value { font-size: 1.25rem; font-weight: 700; margin: 2px 0; color: #1e293b; letter-spacing: -0.01em; }
  .mkt-chg { font-size: 0.82rem; font-weight: 500; margin-top: 2px; }

  /* ── グラフ ── */
  .chart-block { margin-top: 18px; }
  .chart-block:first-child { margin-top: 0; }
  .chart-label {
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 8px;
  }
  .chart-img { width: 100%; border-radius: 10px; display: block; border: 1px solid #f1f5f9; }

  /* ── テーブル ── */
  table { width: 100%; border-collapse: collapse; font-size: 0.84rem; }
  th {
    text-align: left;
    color: #94a3b8;
    font-weight: 600;
    font-size: 0.62rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 8px 10px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
  }
  td { padding: 11px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; color: #475569; }
  tbody tr:hover td { background: #f8fafc; }
  tbody tr:last-child td { border-bottom: none; }

  /* ── AIレポートエリア ── */
  .report { line-height: 1.85; }

  /* レポート最初のh2 = ドキュメントタイトル行（日付・タイトル） */
  .report h2:first-child {
    margin-top: 0;
    margin-bottom: 20px;
    padding: 0 0 14px 0;
    border-left: none;
    border-radius: 0;
    background: none;
    border-bottom: 1px solid #e2e8f0;
    font-size: 1.0rem;
    font-weight: 400;
    color: #64748b;
    letter-spacing: 0.01em;
  }

  .report h2 {
    font-size: 1.05rem;
    color: #1e293b;
    margin: 26px 0 11px;
    padding: 9px 16px;
    background: #f8fafc;
    border-left: 3px solid #008b8b;
    border-radius: 0 8px 8px 0;
    font-weight: 600;
  }
  .report h3 { font-size: 0.96rem; color: #008b8b; margin: 18px 0 7px; font-weight: 600; }
  .report h4 { font-size: 0.87rem; color: #64748b; margin: 13px 0 5px; font-weight: 500; }
  .report p { margin-bottom: 11px; color: #475569; }
  .report ul, .report ol { padding-left: 22px; margin-bottom: 11px; color: #475569; }
  .report li { margin-bottom: 4px; }
  .report table {
    margin: 12px 0;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    font-size: 0.82rem;
  }
  .report table th { background: #f8fafc; text-transform: none; letter-spacing: 0; font-size: 0.8rem; font-weight: 600; color: #64748b; }
  .report table td { color: #475569; border-bottom: 1px solid #f1f5f9; }
  .report tbody tr:nth-child(even) td { background: #fafafa; }
  .report blockquote {
    border-left: 3px solid #008b8b;
    padding: 10px 16px;
    background: #f8fafc;
    border-radius: 0 8px 8px 0;
    margin: 14px 0;
    color: #64748b;
    font-style: italic;
  }
  .report strong { color: #1e293b; font-weight: 600; }
  .report code {
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: 'SF Mono', 'Consolas', monospace;
    font-size: 0.83em;
    color: #008b8b;
  }
  .report pre {
    background: #f8fafc;
    padding: 14px;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 12px;
    border: 1px solid #e2e8f0;
  }
  .report hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }

  /* 投資仮説バッジ */
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
      <span class="header-brand">StockNote</span>
      <span class="header-date">${escHtml(dateStr)} JST</span>
    </div>
    <div class="hero-grid">
      <div class="hero-item">
        <div class="hero-label">評価額</div>
        <div class="hero-value" style="color:#f8fafc">${escHtml(fmt(market.total_jpy + (market.cash_jpy ?? 0) / 10000, 0))}万円</div>
        ${(market.cash_jpy ?? 0) > 0 ? `<div class="hero-sub" style="color:#64748b">うち株式 ${escHtml(fmt(market.total_jpy, 0))}万円</div>` : ""}
      </div>
      <div class="hero-item">
        <div class="hero-label">本日損益</div>
        <div class="hero-value" style="color:${pctColor(market.daily_pct)}">${market.daily_gain_jpy >= 0 ? "+" : ""}${escHtml(fmt(market.daily_gain_jpy, 1))}万円</div>
        <div class="hero-sub" style="color:${pctColor(market.daily_pct)}">${escHtml(fmtPct(market.daily_pct))}</div>
      </div>
      <div class="hero-item">
        <div class="hero-label">通算損益</div>
        <div class="hero-value" style="color:${pctColor(market.total_pct)}">${market.total_gain_jpy >= 0 ? "+" : ""}${escHtml(fmt(market.total_gain_jpy, 1))}万円</div>
        <div class="hero-sub" style="color:${pctColor(market.total_pct)}">${escHtml(fmtPct(market.total_pct))}</div>
      </div>
    </div>
  </div>

  <!-- マーケット指標 -->
  <div class="section">
    <div class="section-title">Market Overview</div>
    <div class="mkt-grid">${marketHtml}</div>
    ${forexHtml}
  </div>

  <!-- グラフ -->
  <div class="section">
    <div class="section-title">Charts</div>
    <div class="chart-block">
      <div class="chart-label">ポートフォリオ構成比</div>
      <img src="${charts.alloc}" alt="構成比" class="chart-img">
    </div>
    <div class="chart-block">
      <div class="chart-label">銘柄別 含み損益%</div>
      <img src="${charts.bar}" alt="銘柄別含損益" class="chart-img">
    </div>
    ${charts.sector ? `<div class="chart-block">
      <div class="chart-label">セクター別配分</div>
      <img src="${charts.sector}" alt="セクター別配分" class="chart-img">
    </div>` : ""}
    ${chartCompare}
  </div>

  <!-- 銘柄テーブル -->
  <div class="section">
    <div class="section-title">保有銘柄</div>
    <div class="table-wrap">
      <table style="min-width:480px">
        <thead>
          <tr>
            <th>銘柄</th>
            <th>現在値</th>
            <th>前日比</th>
            <th>含損益</th>
            <th>損益%</th>
            <th>構成比</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  </div>

  <!-- AI分析レポート -->
  <div class="section">
    <div class="section-title">AI Analysis — claude-sonnet-4-6</div>
    <div class="report">${reportHtml}</div>
  </div>

</div>
</body>
</html>`;
}
