import type { MarketData, HistoryPoint, TrendStats, PortfolioEval } from "@/types";

/**
 * AIレポートに渡す「俯瞰・構造」の材料を機械的に算出する。
 * 日次の値動きではなく、中期トレンド・保有の偏り・セクターの資金の流れ・実績の相対成績を渡し、
 * アクション優先度を構造面から判断できるようにするためのもの。
 */

const pct = (v: number | null | undefined, d = 1): string =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

const trendLine = (t: TrendStats): string =>
  `1週 ${pct(t.ret_1w)} / 1か月 ${pct(t.ret_1m)} / 3か月 ${pct(t.ret_3m)} / 6か月 ${pct(t.ret_6m)} / 1年 ${pct(t.ret_1y)}` +
  ` | 50日線比 ${pct(t.vs_ma50)} / 200日線比 ${pct(t.vs_ma200)} | 1年高値比 ${pct(t.dd_from_high)}`;

// 広範なETF・コモディティ（単一銘柄集中リスクの判定対象から除外）
const isBroadFund = (e: PortfolioEval): boolean =>
  /ETF$/.test(e.sector ?? "") || e.sector === "コモディティ";

const LABELS: Record<string, string> = {
  sp500: "S&P500", nasdaq: "NASDAQ", vix: "VIX(水準)", tnx: "米10年金利(水準)",
  usdjpy: "USD/JPY", gold: "Gold", oil: "WTI原油",
};

/** 市場全体の中期トレンドと、そこから機械的に読み取れる局面判定 */
function marketStructure(market: MarketData): string {
  const t = market.trends;
  if (!t || Object.keys(t).length === 0) return "";
  const lines = Object.keys(LABELS)
    .filter((k) => t[k])
    .map((k) => `- ${LABELS[k]}: ${trendLine(t[k])}`);

  const facts: string[] = [];
  const sp = t.sp500;
  if (sp?.vs_ma200 != null) {
    facts.push(`S&P500は200日線の${sp.vs_ma200 >= 0 ? "上" : "下"}（${pct(sp.vs_ma200)}）、1年高値から${pct(sp.dd_from_high)}`);
  }
  if (t.nasdaq?.ret_3m != null && sp?.ret_3m != null) {
    const rel = t.nasdaq.ret_3m - sp.ret_3m;
    facts.push(`直近3か月のNASDAQ対S&P500は${rel >= 0 ? "+" : ""}${rel.toFixed(1)}pt（${rel >= 0 ? "成長株優位" : "成長株劣位"}）`);
  }
  if (t.vix) {
    facts.push(`VIX ${market.vix.toFixed(1)}（1年高値比${pct(t.vix.dd_from_high)}、3か月前比${pct(t.vix.ret_3m)}）`);
  }
  if (t.usdjpy?.ret_3m != null) {
    facts.push(`USD/JPYは3か月で${pct(t.usdjpy.ret_3m)}（${t.usdjpy.ret_3m >= 0 ? "円安方向" : "円高方向"}）、200日線比${pct(t.usdjpy.vs_ma200)}`);
  }
  return `\n## 市場の構造（中期トレンド・日足終値ベース）\n${lines.join("\n")}\n\n### 機械判定の事実\n${facts.map((f) => `- ${f}`).join("\n")}`;
}

/** 米国11セクターの中期ローテーション（3か月騰落の強い順） */
function sectorRotation(market: MarketData): string {
  const sectors = (market.sector_heatmap ?? []).filter((s) => s.trend);
  if (sectors.length === 0) return "";
  const spRet3m = market.trends?.sp500?.ret_3m ?? null;
  const spRet1m = market.trends?.sp500?.ret_1m ?? null;
  const sorted = [...sectors].sort((a, b) => (b.trend!.ret_3m ?? -999) - (a.trend!.ret_3m ?? -999));
  const lines = sorted.map((s) => {
    const t = s.trend!;
    const rel3 = t.ret_3m != null && spRet3m != null ? ` (対S&P ${pct(t.ret_3m - spRet3m)})` : "";
    const rel1 = t.ret_1m != null && spRet1m != null ? ` (対S&P ${pct(t.ret_1m - spRet1m)})` : "";
    return `- ${s.sector}(${s.ticker}): 1か月 ${pct(t.ret_1m)}${rel1} / 3か月 ${pct(t.ret_3m)}${rel3} / 200日線比 ${pct(t.vs_ma200)} ／参考:前日比 ${pct(s.change_pct)}`;
  });
  return `\n## セクター・ローテーション（米国11セクターETF・3か月騰落の強い順）\n${lines.join("\n")}`;
}

/** 保有ポートフォリオの構造（偏り・通貨・セクター・トレンド状態） */
function portfolioStructure(market: MarketData): string {
  const p = market.portfolio;
  if (p.length === 0) return "";
  const byWeight = [...p].sort((a, b) => b.weight - a.weight);
  const cashW = Math.max(0, 100 - p.reduce((s, e) => s + e.weight, 0));

  const top = (n: number) => byWeight.slice(0, n).reduce((s, e) => s + e.weight, 0);
  const usdW = p.filter((e) => !e.is_jpy).reduce((s, e) => s + e.weight, 0);
  const jpyW = p.filter((e) => e.is_jpy).reduce((s, e) => s + e.weight, 0);
  const usdHoldingsUsd = p.filter((e) => !e.is_jpy).reduce((s, e) => s + e.current_price * e.shares, 0);
  const fxPerYen = usdHoldingsUsd / 10000;

  const sectorMap = new Map<string, number>();
  for (const e of p) sectorMap.set(e.sector ?? "その他", (sectorMap.get(e.sector ?? "その他") ?? 0) + e.weight);
  const sectorLine = [...sectorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, w]) => `${s} ${w.toFixed(1)}%`)
    .join(" / ");

  const singles = p.filter((e) => !isBroadFund(e));
  const singlesW = singles.reduce((s, e) => s + e.weight, 0);

  // 保有構成の中期リターン概算（現保有を期間初から持っていた場合・現地通貨ベース・為替除く）
  const withTrend = p.filter((e) => e.trend);
  const wSum = withTrend.reduce((s, e) => s + e.weight, 0);
  const wAvg = (pick: (t: TrendStats) => number | null): number | null => {
    const rows = withTrend.filter((e) => pick(e.trend!) != null);
    const w = rows.reduce((s, e) => s + e.weight, 0);
    return w > 0 ? rows.reduce((s, e) => s + pick(e.trend!)! * e.weight, 0) / w : null;
  };
  const spT = market.trends?.sp500;
  const perfLine = withTrend.length > 0
    ? [
        ["1か月", wAvg((t) => t.ret_1m), spT?.ret_1m],
        ["3か月", wAvg((t) => t.ret_3m), spT?.ret_3m],
        ["6か月", wAvg((t) => t.ret_6m), spT?.ret_6m],
      ]
        .map(([label, mine, sp]) => `${label}: 保有構成 ${pct(mine as number | null)} 対 S&P500 ${pct(sp as number | null | undefined)}`)
        .join(" / ")
    : "";

  const holdingLines = byWeight.map((e) => {
    const t = e.trend ? trendLine(e.trend) : "中期データなし";
    const note = e.trend?.split_adjusted ? "（株式分割を検知し価格補正済み）" : "";
    return `- ${e.ticker}（構成比${e.weight.toFixed(1)}%・${e.sector ?? "その他"}）: ${t}${note} | 含損益 ${pct(e.gain_pct)}`;
  });

  // 構造上の注目点（機械抽出）
  const flags: string[] = [];
  for (const e of singles) {
    if (e.weight >= 8) flags.push(`${e.ticker}が個別株で構成比${e.weight.toFixed(1)}%と大きい（単一銘柄集中）`);
  }
  if (singlesW >= 25) flags.push(`個別株の合計が構成比${singlesW.toFixed(1)}%`);
  const topSector = [...sectorMap.entries()].filter(([s]) => !/ETF$/.test(s) && s !== "コモディティ").sort((a, b) => b[1] - a[1])[0];
  if (topSector && topSector[1] >= 15) flags.push(`個別株で最大のセクターは${topSector[0]}（構成比${topSector[1].toFixed(1)}%）`);
  if (cashW >= 5) flags.push(`現金比率 ${cashW.toFixed(1)}%（待機資金あり）`);
  for (const e of p) {
    const t = e.trend;
    if (!t) continue;
    if (t.vs_ma200 != null && t.vs_ma200 < -2) flags.push(`${e.ticker}は200日線を下回っている（${pct(t.vs_ma200)}）`);
    if (t.dd_from_high != null && t.dd_from_high <= -15) flags.push(`${e.ticker}は1年高値から${pct(t.dd_from_high)}下落`);
    if (t.ret_3m != null && spT?.ret_3m != null && t.ret_3m - spT.ret_3m <= -10) {
      flags.push(`${e.ticker}は3か月でS&P500を${(spT.ret_3m - t.ret_3m).toFixed(1)}pt下回る`);
    }
    if (t.vs_ma50 != null && t.vs_ma50 >= 15) flags.push(`${e.ticker}は50日線から${pct(t.vs_ma50)}乖離（短期過熱）`);
  }

  return `
## ポートフォリオの構造
- 構成: 株式等 ${(100 - cashW).toFixed(1)}% / 現金 ${cashW.toFixed(1)}%（総資産比）
- 集中度: 上位1銘柄 ${top(1).toFixed(1)}% / 上位3銘柄 ${top(3).toFixed(1)}% / 上位5銘柄 ${top(5).toFixed(1)}%
- 通貨: USD建て ${usdW.toFixed(1)}% / JPY建て ${jpyW.toFixed(1)}%（USD/JPY ±1円 → 評価額 ±${fxPerYen.toFixed(1)}万円）
- セクター・種別: ${sectorLine}
- 個別株（ETF除く）合計: ${singlesW.toFixed(1)}%
${perfLine ? `- 現在の保有構成を期間初から保有していた場合の概算（現地通貨・為替除く）: ${perfLine}\n` : ""}
### 銘柄別の中期トレンド
${holdingLines.join("\n")}

### 構造上の注目点（機械抽出）
${flags.length ? flags.map((f) => `- ${f}`).join("\n") : "- 特記事項なし"}`;
}

/** 記録（report_log）ベースの実績: 保有ポートフォリオ vs S&P500 の期間別成績とドローダウン */
function recordedPerformance(history: HistoryPoint[]): string {
  // 週末はYahooが前営業日と同じデータを返し二重計上になるため除外（チャートと同じ扱い）
  const days = history
    .filter((h) => {
      const d = new Date(h.date + "T12:00:00Z").getUTCDay();
      return d !== 0 && d !== 6;
    })
    .map((h) => ({ p: h.daily_pct ?? 0, s: h.sp500_chg ?? 0 }));
  if (days.length < 5) return "";

  const cum = (arr: typeof days, key: "p" | "s") =>
    (arr.reduce((m, d) => m * (1 + d[key] / 100), 1) - 1) * 100;
  const windows: [string, number][] = [["直近1週間", 5], ["直近1か月", 21], ["直近3か月", 63], [`記録開始来(${days.length}営業日)`, days.length]];
  const lines = windows
    .filter(([, n], i, a) => n <= days.length && (i === a.length - 1 || n < days.length))
    .map(([label, n]) => {
      const slice = days.slice(-n);
      const mine = cum(slice, "p");
      const sp = cum(slice, "s");
      return `- ${label}: ポートフォリオ ${pct(mine)} / S&P500 ${pct(sp)} / 差 ${pct(mine - sp)}`;
    });

  let mul = 1, peak = 1, maxDd = 0;
  for (const d of days) {
    mul *= 1 + d.p / 100;
    if (mul > peak) peak = mul;
    maxDd = Math.min(maxDd, (mul / peak - 1) * 100);
  }
  const curDd = (mul / peak - 1) * 100;
  return `\n## 記録ベースの実績（保有銘柄の日次騰落を複利連結。入出金・銘柄入替の影響を除いた値動きの成績）\n${lines.join("\n")}\n- 記録上のピークからの現在の下落率: ${pct(curDd)} / 期間内の最大下落率: ${pct(maxDd)}`;
}

/** AIに渡す構造分析の材料一式 */
export function buildStructureContext(market: MarketData, history: HistoryPoint[]): string {
  return [marketStructure(market), sectorRotation(market), portfolioStructure(market), recordedPerformance(history)]
    .filter(Boolean)
    .join("\n");
}
