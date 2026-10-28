import Parser from "rss-parser";
import type { MarketData } from "@/types";
import { fetchYahooQuote } from "./market";

/**
 * マクロ環境・先行きの変数を外部の公開データから取得し、AIに渡すテキストに整形する。
 * 取得元（すべて無料・認証不要）:
 *   FRED（米国の金利・物価・雇用・景気・信用）/ CNN Fear&Greed（センチメント内訳）/
 *   経済指標カレンダー（今後の予定・予想）/ Nasdaq（IPO・決算予定）/ FRB（金融政策の公式発表）
 * 各取得は独立しており、一部が失敗しても残りで継続する（クラウド環境でアクセス制限を受ける場合に備える）。
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
const NASDAQ_HEADERS = {
  Origin: "https://www.nasdaq.com",
  Referer: "https://www.nasdaq.com/",
  Accept: "application/json",
};

async function getText(url: string, headers: Record<string, string> = {}): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, ...headers },
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  const text = await getText(url, headers);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

const jst = (d: Date): string =>
  d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

// ───────────────────────── FRED（金利・物価・雇用・景気・信用） ─────────────────────────

interface Obs { date: string; value: number }

async function fred(id: string, days: number): Promise<Obs[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const text = await getText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}&cosd=${since}`);
  if (!text) return [];
  return text
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => {
      const [date, v] = l.split(",");
      return { date, value: parseFloat(v) };
    })
    .filter((o) => !isNaN(o.value));
}

const lastOf = (o: Obs[]): Obs | undefined => o[o.length - 1];

/** 最新観測日の days 日前以前で最も近い観測値 */
function ago(o: Obs[], days: number): Obs | undefined {
  const l = lastOf(o);
  if (!l) return undefined;
  const target = new Date(l.date).getTime() - days * 86400000;
  let best: Obs | undefined;
  for (const x of o) {
    if (new Date(x.date).getTime() <= target) best = x;
    else break;
  }
  return best;
}

const sgn = (v: number, d = 2): string => `${v >= 0 ? "+" : ""}${v.toFixed(d)}`;
const bpDiff = (a?: Obs, b?: Obs): string =>
  a && b ? `${sgn((a.value - b.value) * 100, 0)}bp` : "—";
const monthLabel = (o?: Obs): string => (o ? o.date.slice(0, 7) : "—");

async function fredSection(): Promise<string> {
  const [dff, dgs2, dgs10, t10y2y, t10y3m, t10yie, t5yifr, cpi, core, pce, unrate, payems, icsa, hy, nfci, gdpnow, umcsent, walcl] =
    await Promise.all([
      fred("DFF", 400), fred("DGS2", 400), fred("DGS10", 400), fred("T10Y2Y", 400), fred("T10Y3M", 400),
      fred("T10YIE", 400), fred("T5YIFR", 400),
      fred("CPIAUCSL", 800), fred("CPILFESL", 800), fred("PCEPILFE", 800),
      fred("UNRATE", 500), fred("PAYEMS", 500), fred("ICSA", 120),
      fred("BAMLH0A0HYM2", 400), fred("NFCI", 400), fred("GDPNOW", 600), fred("UMCSENT", 500), fred("WALCL", 200),
    ]);

  const lines: string[] = [];

  // 金融政策・金利
  const policy = lastOf(dff);
  const y2 = lastOf(dgs2);
  const y10 = lastOf(dgs10);
  if (policy || y2 || y10) {
    lines.push("### 金融政策・金利（米国）");
    if (policy) {
      lines.push(`- 政策金利（実効FF金利）: ${policy.value.toFixed(2)}%（3か月前 ${ago(dff, 90)?.value.toFixed(2) ?? "—"}% / 6か月前 ${ago(dff, 180)?.value.toFixed(2) ?? "—"}% / 1年前 ${ago(dff, 365)?.value.toFixed(2) ?? "—"}%）`);
    }
    if (y2) lines.push(`- 米2年債利回り: ${y2.value.toFixed(2)}%（1か月 ${bpDiff(y2, ago(dgs2, 30))} / 3か月 ${bpDiff(y2, ago(dgs2, 90))}）`);
    if (y10) lines.push(`- 米10年債利回り: ${y10.value.toFixed(2)}%（1か月 ${bpDiff(y10, ago(dgs10, 30))} / 3か月 ${bpDiff(y10, ago(dgs10, 90))} / 1年 ${bpDiff(y10, ago(dgs10, 365))}）`);
    const c2 = lastOf(t10y2y);
    const c3 = lastOf(t10y3m);
    if (c2) lines.push(`- イールドカーブ: 10年-2年 ${sgn(c2.value * 100, 0)}bp（3か月前 ${ago(t10y2y, 90) ? sgn(ago(t10y2y, 90)!.value * 100, 0) + "bp" : "—"}）${c3 ? ` / 10年-3か月 ${sgn(c3.value * 100, 0)}bp` : ""}`);
    if (policy && y2) {
      const gap = (y2.value - policy.value) * 100;
      lines.push(`- 2年債利回り−政策金利 = ${sgn(gap, 0)}bp（負なら市場は利下げを織り込み、正なら利上げ/据え置き長期化を織り込む）`);
    }
  }

  // インフレ
  const yoy = (o: Obs[]): number | null => {
    const l = lastOf(o);
    const p = ago(o, 365);
    return l && p ? (l.value / p.value - 1) * 100 : null;
  };
  const yoyPrev = (o: Obs[]): number | null => {
    const l = lastOf(o);
    if (!l) return null;
    const prevList = o.slice(0, -1);
    const p = lastOf(prevList);
    const pp = p ? ago(prevList, 365) : undefined;
    return p && pp ? (p.value / pp.value - 1) * 100 : null;
  };
  const ann3m = (o: Obs[]): number | null => {
    const l = lastOf(o);
    const p = ago(o, 85);
    return l && p ? (Math.pow(l.value / p.value, 4) - 1) * 100 : null;
  };
  const infl: string[] = [];
  const cpiYoy = yoy(cpi);
  if (cpiYoy != null) infl.push(`- 消費者物価(CPI)総合: 前年比 ${cpiYoy.toFixed(2)}%（前月 ${yoyPrev(cpi)?.toFixed(2) ?? "—"}% / 直近3か月年率 ${ann3m(cpi)?.toFixed(2) ?? "—"}%）[${monthLabel(lastOf(cpi))}分]`);
  const coreYoy = yoy(core);
  if (coreYoy != null) infl.push(`- コアCPI: 前年比 ${coreYoy.toFixed(2)}%（前月 ${yoyPrev(core)?.toFixed(2) ?? "—"}% / 直近3か月年率 ${ann3m(core)?.toFixed(2) ?? "—"}%）[${monthLabel(lastOf(core))}分]`);
  const pceYoy = yoy(pce);
  if (pceYoy != null) infl.push(`- コアPCE（FRBの重視指標）: 前年比 ${pceYoy.toFixed(2)}%（前月 ${yoyPrev(pce)?.toFixed(2) ?? "—"}% / 直近3か月年率 ${ann3m(pce)?.toFixed(2) ?? "—"}%）[${monthLabel(lastOf(pce))}分]`);
  const be = lastOf(t10yie);
  if (be) infl.push(`- 市場の期待インフレ: 10年ブレークイーブン ${be.value.toFixed(2)}%（3か月前 ${ago(t10yie, 90)?.value.toFixed(2) ?? "—"}%）${lastOf(t5yifr) ? ` / 5年先5年(長期期待) ${lastOf(t5yifr)!.value.toFixed(2)}%` : ""}`);
  if (infl.length) lines.push("### インフレ", ...infl);

  // 雇用・景気
  const eco: string[] = [];
  const ur = lastOf(unrate);
  if (ur) eco.push(`- 失業率: ${ur.value.toFixed(1)}%（6か月前 ${ago(unrate, 180)?.value.toFixed(1) ?? "—"}% / 1年前 ${ago(unrate, 365)?.value.toFixed(1) ?? "—"}%）[${monthLabel(ur)}分]`);
  if (payems.length >= 4) {
    const n = payems.length;
    const avg3 = (payems[n - 1].value - payems[n - 4].value) / 3;
    eco.push(`- 非農業部門雇用者数: 直近3か月平均 ${sgn(avg3, 0)}千人/月 [${monthLabel(lastOf(payems))}分]`);
  }
  if (icsa.length >= 4) {
    const w = icsa.slice(-4);
    const avg = w.reduce((s, o) => s + o.value, 0) / w.length;
    eco.push(`- 新規失業保険申請: 4週平均 ${(avg / 1000).toFixed(0)}千件（最新 ${(lastOf(icsa)!.value / 1000).toFixed(0)}千件）`);
  }
  const gn = lastOf(gdpnow);
  if (gn) eco.push(`- 米GDP見通し（アトランタ連銀GDPNow・今四半期の推計）: 年率 ${gn.value.toFixed(1)}%（前四半期推計 ${gdpnow.length >= 2 ? gdpnow[gdpnow.length - 2].value.toFixed(1) + "%" : "—"}）`);
  const um = lastOf(umcsent);
  if (um) eco.push(`- ミシガン大消費者信頼感: ${um.value.toFixed(1)}（3か月前 ${ago(umcsent, 90)?.value.toFixed(1) ?? "—"} / 1年前 ${ago(umcsent, 365)?.value.toFixed(1) ?? "—"}）[${monthLabel(um)}分]`);
  if (eco.length) lines.push("### 雇用・景気", ...eco);

  // 流動性・信用
  const liq: string[] = [];
  const hyL = lastOf(hy);
  if (hyL) {
    const year = hy.slice(-250).map((o) => o.value);
    const pctile = (year.filter((v) => v <= hyL.value).length / year.length) * 100;
    liq.push(`- ハイイールド債スプレッド: ${hyL.value.toFixed(2)}%（3か月前 ${ago(hy, 90)?.value.toFixed(2) ?? "—"}% / 直近1年の${pctile.toFixed(0)}パーセンタイル。高いほど信用不安）`);
  }
  const nf = lastOf(nfci);
  if (nf) liq.push(`- シカゴ連銀 金融環境指数(NFCI): ${nf.value.toFixed(2)}（負=平均より緩和的、正=引き締め的。3か月前 ${ago(nfci, 90)?.value.toFixed(2) ?? "—"}）`);
  const wl = lastOf(walcl);
  const wl0 = ago(walcl, 90);
  if (wl && wl0) liq.push(`- FRB総資産: ${(wl.value / 1e6).toFixed(2)}兆ドル（3か月で${sgn((wl.value - wl0.value) / 1000, 0)}億ドル。減少=量的引き締め、増加=資金供給）`);
  if (liq.length) lines.push("### 流動性・信用", ...liq);

  if (lines.length === 0) throw new Error("FRED取得なし");
  return lines.join("\n");
}

// ───────────────────────── センチメント・需給 ─────────────────────────

interface CnnComponent { rating?: string; data?: { y: number }[] }

async function sentimentSection(market: MarketData): Promise<string> {
  const fg = await getJson<{
    fear_and_greed?: { score: number; rating: string; previous_close: number; previous_1_week: number; previous_1_month: number; previous_1_year: number };
    [k: string]: unknown;
  }>("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", { Referer: "https://edition.cnn.com/markets/fear-and-greed" });
  const lines: string[] = [];
  const f = fg?.fear_and_greed;
  if (f) {
    lines.push(`- CNN Fear&Greed: ${Math.round(f.score)}（${f.rating}）。前日 ${Math.round(f.previous_close)} / 1週間前 ${Math.round(f.previous_1_week)} / 1か月前 ${Math.round(f.previous_1_month)} / 1年前 ${Math.round(f.previous_1_year)}`);
    const comps: [string, string][] = [
      ["market_momentum_sp500", "S&P500モメンタム"], ["stock_price_strength", "新高値/新安値"], ["stock_price_breadth", "騰落の広がり"],
      ["put_call_options", "プット/コール比率"], ["market_volatility_vix", "VIX"], ["junk_bond_demand", "ジャンク債需要"], ["safe_haven_demand", "安全資産需要"],
    ];
    const parts = comps
      .map(([k, label]) => {
        const c = fg?.[k] as CnnComponent | undefined;
        return c?.rating ? `${label}:${c.rating}` : null;
      })
      .filter(Boolean);
    if (parts.length) lines.push(`- 構成要素の判定: ${parts.join(" / ")}`);
  }
  const v3 = await fetchYahooQuote("^VIX3M");
  if (v3 && market.vix > 0) {
    const ratio = market.vix / v3.price;
    lines.push(`- VIX期間構造: VIX ${market.vix.toFixed(1)} / VIX3M ${v3.price.toFixed(1)} → 比 ${ratio.toFixed(2)}（1超=短期の不安が先行するバックワーデーション。通常は1未満）`);
  }
  if (lines.length === 0) throw new Error("センチメント取得なし");
  return ["### センチメント・ポジショニング", ...lines].join("\n");
}

// ───────────────────────── 経済指標カレンダー・FRB ─────────────────────────

interface CalEvent { title: string; country: string; date: string; impact: string; forecast?: string; previous?: string }

async function calendarSection(): Promise<string> {
  const [thisWeek, nextWeek] = await Promise.all([
    getJson<CalEvent[]>("https://nfs.faireconomy.media/ff_calendar_thisweek.json"),
    getJson<CalEvent[]>("https://nfs.faireconomy.media/ff_calendar_nextweek.json"),
  ]);
  const all = [...(thisWeek ?? []), ...(nextWeek ?? [])];
  if (all.length === 0) throw new Error("経済指標カレンダー取得なし");
  const now = Date.now();
  const rows = all
    .filter((e) => ["USD", "JPY"].includes(e.country) && ["High", "Medium"].includes(e.impact))
    .map((e) => ({ ...e, t: new Date(e.date).getTime() }))
    .filter((e) => e.t >= now - 30 * 3600000 && e.t <= now + 10 * 86400000)
    .sort((a, b) => a.t - b.t);
  if (rows.length === 0) throw new Error("該当イベントなし");
  const lines = rows.map((e) => {
    const star = e.impact === "High" ? "★★★" : "★★";
    const state = e.t < now ? "［発表済み・結果は未取得］" : "";
    return `- ${jst(new Date(e.t))} ${star} ${e.country} ${e.title}${state}｜予想 ${e.forecast || "—"} / 前回 ${e.previous || "—"}`;
  });
  return ["### 今後約10日の重要イベント（日本時間・★★★=重要度高）", ...lines].join("\n");
}

async function fedSection(): Promise<string> {
  const parser = new Parser({ timeout: 10000, headers: { "User-Agent": UA } });
  const feeds: [string, string, number][] = [
    ["https://www.federalreserve.gov/feeds/press_monetary.xml", "金融政策の公式発表", 4],
    ["https://www.federalreserve.gov/feeds/speeches.xml", "FRB高官の講演", 4],
  ];
  const lines: string[] = [];
  for (const [url, label, n] of feeds) {
    try {
      const feed = await parser.parseURL(url);
      const items = feed.items.slice(0, n).map((i) => {
        const d = i.isoDate ? new Date(i.isoDate) : i.pubDate ? new Date(i.pubDate) : null;
        const desc = (i.contentSnippet ?? "").replace(/\s+/g, " ").slice(0, 220);
        return `- ${d ? jst(d).replace(/\d+:\d+$/, "").trim() : ""} ${i.title ?? ""}${desc && desc !== i.title ? `｜${desc}` : ""}`;
      });
      if (items.length) lines.push(`#### ${label}`, ...items);

      // 直近4日以内のFOMC声明は本文を取得（RSSには見出ししかなく、利下げ/据え置きや今後の方針が読めないため）
      const stmt = feed.items.find((i) => {
        const t = i.isoDate ? new Date(i.isoDate).getTime() : 0;
        return /FOMC statement/i.test(i.title ?? "") && Date.now() - t < 4 * 86400000 && i.link;
      });
      if (stmt?.link) {
        const html = await getText(stmt.link);
        if (html) {
          const body = html
            .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;|&#160;/g, " ")
            .replace(/\s+/g, " ");
          const start = body.search(/(Recent indicators|Available indicators|Information received|Economic activity)/i);
          if (start >= 0) lines.push(`#### 直近のFOMC声明（本文抜粋）`, `- ${body.slice(start, start + 1600)}`);
        }
      }
    } catch {
      /* 片方失敗しても続行 */
    }
  }
  if (lines.length === 0) throw new Error("FRB RSS取得なし");
  return ["### FRB（米連邦準備制度）の最新の動き", ...lines].join("\n");
}

// ───────────────────────── IPO・決算 ─────────────────────────

const money = (s?: string): number => parseFloat((s ?? "0").replace(/[$,]/g, "")) || 0;
// 1億ドル=1e8。小さい額は百万ドル単位
const fmtUsd = (v: number): string => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}億ドル` : `${(v / 1e6).toFixed(0)}百万ドル`);

interface IpoRow { companyName?: string; proposedTickerSymbol?: string; proposedSharePrice?: string; pricedDate?: string; expectedPriceDate?: string; dollarValueOfSharesOffered?: string }
interface IpoResp { data?: { priced?: { rows?: IpoRow[] }; upcoming?: { upcomingTable?: { rows?: IpoRow[] } } } }

async function ipoSection(): Promise<string> {
  const now = new Date();
  const ym = (d: Date) => d.toISOString().slice(0, 7);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const [cur, pre] = await Promise.all([
    getJson<IpoResp>(`https://api.nasdaq.com/api/ipo/calendar?date=${ym(now)}`, NASDAQ_HEADERS),
    getJson<IpoResp>(`https://api.nasdaq.com/api/ipo/calendar?date=${ym(prev)}`, NASDAQ_HEADERS),
  ]);
  if (!cur && !pre) throw new Error("IPO取得なし");
  const isSpac = (r: IpoRow) => /acquisition|merger corp|spac/i.test(r.companyName ?? "") && (r.proposedSharePrice ?? "") === "10.00";
  const priced = [...(pre?.data?.priced?.rows ?? []), ...(cur?.data?.priced?.rows ?? [])]
    .filter((r) => r.pricedDate && now.getTime() - new Date(r.pricedDate).getTime() <= 30 * 86400000);
  const operating = priced.filter((r) => !isSpac(r));
  const spacs = priced.length - operating.length;
  const proceeds = operating.reduce((s, r) => s + money(r.dollarValueOfSharesOffered), 0);
  const top = [...operating].sort((a, b) => money(b.dollarValueOfSharesOffered) - money(a.dollarValueOfSharesOffered)).slice(0, 4);
  const upcoming = (cur?.data?.upcoming?.upcomingTable?.rows ?? [])
    .filter((r) => !isSpac(r))
    .filter((r) => money(r.dollarValueOfSharesOffered) > 0 && r.proposedSharePrice && r.proposedSharePrice !== "null") // 条件未確定の不完全な行を除外
    .filter((r) => r.expectedPriceDate && new Date(r.expectedPriceDate).getTime() >= now.getTime() - 86400000 && new Date(r.expectedPriceDate).getTime() <= now.getTime() + 14 * 86400000);
  const lines = [
    `- 過去30日の米国IPO: 事業会社 ${operating.length}件・調達額合計 ${fmtUsd(proceeds)}（SPAC ${spacs}件を除く）`,
  ];
  if (top.length) lines.push(`- 大型案件: ${top.map((r) => `${r.companyName}(${r.proposedTickerSymbol}) ${fmtUsd(money(r.dollarValueOfSharesOffered))} ${r.pricedDate}`).join(" / ")}`);
  if (upcoming.length) lines.push(`- 今後2週間の予定: ${upcoming.map((r) => `${r.companyName}(${r.proposedTickerSymbol}) ${r.expectedPriceDate} 仮条件$${r.proposedSharePrice} ${fmtUsd(money(r.dollarValueOfSharesOffered))}`).join(" / ")}`);
  else lines.push("- 今後2週間の予定: 目立った事業会社IPOなし（取得できた範囲）");
  return ["### IPO市場（新規上場の供給と熱量）", ...lines].join("\n");
}

interface EarnRow { symbol: string; name?: string; marketCap?: string; time?: string; epsForecast?: string }

async function earningsSection(holdings: string[]): Promise<string> {
  const dates: string[] = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date(Date.now() + i * 86400000);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  const results = await Promise.all(
    dates.map(async (date) => {
      const j = await getJson<{ data?: { rows?: EarnRow[] } }>(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, NASDAQ_HEADERS);
      return { date, rows: j?.data?.rows ?? null };
    })
  );
  if (results.every((r) => r.rows === null)) throw new Error("決算予定取得なし");
  const hold = new Set(holdings.map((h) => h.toUpperCase().replace("-", "")));
  const timeLabel = (t?: string) => (t === "time-pre-market" ? "寄り前" : t === "time-after-hours" ? "引け後" : "時間未定");
  const lines: string[] = [];
  for (const { date, rows } of results) {
    if (!rows) continue;
    const big = rows
      .filter((r) => money(r.marketCap) >= 1.5e11 || hold.has(r.symbol.toUpperCase().replace("-", "")))
      .sort((a, b) => money(b.marketCap) - money(a.marketCap))
      .slice(0, 8);
    if (big.length) {
      lines.push(`- ${date.slice(5)}（米国日付）: ${big.map((r) => `${r.symbol}(${timeLabel(r.time)}${r.epsForecast ? `・EPS予想${r.epsForecast}` : ""})${hold.has(r.symbol.toUpperCase().replace("-", "")) ? "★保有" : ""}`).join(" / ")}`);
    }
  }
  if (lines.length === 0) lines.push("- 時価総額1,500億ドル超の企業の決算予定なし（取得できた範囲）");
  return ["### 今後約1週間の主な決算（時価総額1,500億ドル超・保有銘柄）", ...lines].join("\n");
}

// ───────────────────────── 統合 ─────────────────────────

export interface MacroContext {
  text: string;
  ok: string[];
  failed: string[];
}

/** マクロ環境の外部データを一括取得してAI用テキストに整形する */
export async function fetchMacroContext(market: MarketData, holdingTickers: string[]): Promise<MacroContext> {
  const jobs: [string, () => Promise<string>][] = [
    ["金利・物価・雇用・景気・信用(FRED)", fredSection],
    ["センチメント・VIX期間構造", () => sentimentSection(market)],
    ["経済指標カレンダー", calendarSection],
    ["FRBの動き", fedSection],
    ["IPO市場", ipoSection],
    ["決算予定", () => earningsSection(holdingTickers)],
  ];
  const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
  const ok: string[] = [];
  const failed: string[] = [];
  const blocks: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      ok.push(jobs[i][0]);
      blocks.push(r.value);
    } else {
      failed.push(jobs[i][0]);
    }
  });
  const header =
    "## マクロ環境・先行きの変数（外部データ。ここにない事実は記憶で補わず「データなし」と扱うこと）" +
    (failed.length ? `\n※取得できなかった項目: ${failed.join("、")}` : "");
  return { text: blocks.length ? `\n${header}\n${blocks.join("\n\n")}` : "", ok, failed };
}
