import type { PortfolioItem, PortfolioEval, MarketData } from "@/types";

// Yahoo Finance v8 API レスポンス型
interface YahooMeta {
  regularMarketPrice: number;
  chartPreviousClose: number;
  currency?: string;
}
interface YahooResponse {
  chart: {
    result: Array<{ meta: YahooMeta }> | null;
    error: object | null;
  };
}

// Yahoo Finance v7 quote API（セクター取得用）
interface YahooV7Quote {
  symbol: string;
  quoteType?: string;
  sector?: string;
  shortName?: string;
  longName?: string;
}
interface YahooV7Response {
  quoteResponse?: { result?: YahooV7Quote[] };
}

/** Yahoo Finance v8 APIで1銘柄の価格・前日比を取得 */
async function fetchYahooQuote(
  symbol: string
): Promise<{ price: number; change_pct: number } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as YahooResponse;
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const { regularMarketPrice: price, chartPreviousClose: prev } = result.meta;
    const change_pct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { price, change_pct };
  } catch {
    return null;
  }
}

/** USD/JPYをExchangeRate APIで取得（フォールバックはYahoo Finance） */
async function fetchUsdJpy(): Promise<number> {
  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD", {
      next: { revalidate: 0 },
    });
    if (res.ok) {
      const json = (await res.json()) as { rates: Record<string, number> };
      const jpy = json.rates?.JPY;
      if (jpy && jpy > 50) return jpy;
    }
  } catch {
    // fallthrough to Yahoo Finance
  }
  // フォールバック: Yahoo Finance
  const q = await fetchYahooQuote("JPY=X");
  return q?.price ?? 150;
}

/** CNN Fear & Greed Index取得 */
async function fetchFearGreed(): Promise<number> {
  try {
    const res = await fetch(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
      {
        headers: {
          Referer: "https://edition.cnn.com/markets/fear-and-greed",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return 50;
    const json = (await res.json()) as {
      fear_and_greed?: { score?: number };
    };
    return Math.round(json.fear_and_greed?.score ?? 50);
  } catch {
    return 50;
  }
}

// 静的セクターマップ（ETF + 主要個別株）— APIより優先
const ETF_SECTOR_MAP: Record<string, string> = {
  // ── ETF: 全世界 ──
  VT: "全世界ETF", ACWI: "全世界ETF", VTWAX: "全世界ETF",
  // ── ETF: 米国 ──
  VTI: "米国ETF", VOO: "米国ETF", SPY: "米国ETF", IVV: "米国ETF",
  QQQ: "米国ETF", QQMG: "米国ETF", DIA: "米国ETF", ITOT: "米国ETF",
  SCHB: "米国ETF", VUG: "米国ETF", VTV: "米国ETF", MGK: "米国ETF",
  // ── ETF: 先進国（米国除く） ──
  VEA: "先進国ETF", EFA: "先進国ETF", IEFA: "先進国ETF",
  VEU: "先進国ETF", VXUS: "先進国ETF", SCHF: "先進国ETF",
  // ── ETF: 新興国 ──
  VWO: "新興国ETF", EEM: "新興国ETF", IEMG: "新興国ETF",
  SCHE: "新興国ETF", DEM: "新興国ETF",
  // ── ETF: 債券 ──
  BND: "債券ETF", AGG: "債券ETF", TLT: "債券ETF", IEF: "債券ETF",
  SHY: "債券ETF", LQD: "債券ETF", HYG: "債券ETF", BNDX: "債券ETF",
  VGIT: "債券ETF", VGLT: "債券ETF",
  // ── ETF: コモディティ ──
  GLD: "コモディティ", IAU: "コモディティ", SLV: "コモディティ",
  USO: "コモディティ", DJP: "コモディティ",

  // ── 個別株: テクノロジー ──
  AAPL: "テクノロジー", MSFT: "テクノロジー", NVDA: "テクノロジー",
  AVGO: "テクノロジー", ORCL: "テクノロジー", CSCO: "テクノロジー",
  INTC: "テクノロジー", AMD: "テクノロジー", QCOM: "テクノロジー",
  AMAT: "テクノロジー", MU: "テクノロジー", LRCX: "テクノロジー",
  CRM: "テクノロジー", NOW: "テクノロジー", SNOW: "テクノロジー",
  PLTR: "テクノロジー", PANW: "テクノロジー", CRWD: "テクノロジー",
  ADBE: "テクノロジー", ACN: "テクノロジー", IBM: "テクノロジー",
  TXN: "テクノロジー", KLAC: "テクノロジー", ADI: "テクノロジー",
  MRVL: "テクノロジー", FTNT: "テクノロジー", CDNS: "テクノロジー",
  SNPS: "テクノロジー", MCHP: "テクノロジー", STX: "テクノロジー",
  WDC: "テクノロジー", HPQ: "テクノロジー", DELL: "テクノロジー",
  ANET: "テクノロジー", GLW: "テクノロジー", APH: "テクノロジー",
  // ── 個別株: 通信 ──
  GOOGL: "通信", GOOG: "通信", META: "通信", NFLX: "通信",
  DIS: "通信", TMUS: "通信", T: "通信", VZ: "通信",
  CMCSA: "通信", CHTR: "通信", FOXA: "通信", WBD: "通信",
  NWSA: "通信", PARA: "通信", IPG: "通信", OMC: "通信",
  ADVE: "通信",
  // ── 個別株: 一般消費財 ──
  AMZN: "一般消費財", TSLA: "一般消費財", HD: "一般消費財",
  MCD: "一般消費財", SBUX: "一般消費財", NKE: "一般消費財",
  TJX: "一般消費財", BKNG: "一般消費財", LOW: "一般消費財",
  GM: "一般消費財", F: "一般消費財", EBAY: "一般消費財",
  APTV: "一般消費財", ROST: "一般消費財", DHI: "一般消費財",
  LEN: "一般消費財", PHM: "一般消費財", EXPE: "一般消費財",
  MAR: "一般消費財", HLT: "一般消費財", CCL: "一般消費財",
  RCL: "一般消費財", NCLH: "一般消費財", APPN: "一般消費財",
  // ── 個別株: 生活必需品 ──
  WMT: "生活必需品", COST: "生活必需品", PG: "生活必需品",
  KO: "生活必需品", PEP: "生活必需品", PM: "生活必需品",
  MO: "生活必需品", MDLZ: "生活必需品", CL: "生活必需品",
  KR: "生活必需品", SYY: "生活必需品", EL: "生活必需品",
  KMB: "生活必需品", CHD: "生活必需品", CAG: "生活必需品",
  CPB: "生活必需品", HRL: "生活必需品", TSN: "生活必需品",
  // ── 個別株: ヘルスケア ──
  LLY: "ヘルスケア", UNH: "ヘルスケア", JNJ: "ヘルスケア",
  ABBV: "ヘルスケア", MRK: "ヘルスケア", ABT: "ヘルスケア",
  TMO: "ヘルスケア", DHR: "ヘルスケア", ISRG: "ヘルスケア",
  CVS: "ヘルスケア", BMY: "ヘルスケア", AMGN: "ヘルスケア",
  GILD: "ヘルスケア", REGN: "ヘルスケア", VRTX: "ヘルスケア",
  ZTS: "ヘルスケア", BIIB: "ヘルスケア", MRNA: "ヘルスケア",
  HCA: "ヘルスケア", CI: "ヘルスケア", ELV: "ヘルスケア",
  CNC: "ヘルスケア", SYK: "ヘルスケア", BSX: "ヘルスケア",
  MDT: "ヘルスケア", BDX: "ヘルスケア", IQV: "ヘルスケア",
  MCK: "ヘルスケア", CAH: "ヘルスケア", PFE: "ヘルスケア",
  DIAGN: "ヘルスケア", A: "ヘルスケア", MTD: "ヘルスケア",
  IDXX: "ヘルスケア", HOLX: "ヘルスケア", GEHC: "ヘルスケア",
  // ── 個別株: 金融 ──
  JPM: "金融", BAC: "金融", WFC: "金融", GS: "金融",
  MS: "金融", AXP: "金融", BLK: "金融", SCHW: "金融",
  C: "金融", MA: "金融", V: "金融", COF: "金融",
  "BRK-B": "金融", BX: "金融", KKR: "金融", APO: "金融",
  SPGI: "金融", MCO: "金融", ICE: "金融", CME: "金融",
  AON: "金融", MMC: "金融", CB: "金融", PGR: "金融",
  AFL: "金融", MET: "金融", PRU: "金融", TROW: "金融",
  // ── 個別株: 資本財 ──
  CAT: "資本財", DE: "資本財", BA: "資本財", GE: "資本財",
  UNP: "資本財", RTX: "資本財", HON: "資本財", LMT: "資本財",
  NOC: "資本財", ETN: "資本財", ITW: "資本財", CMI: "資本財",
  EMR: "資本財", PH: "資本財", GD: "資本財", TT: "資本財",
  PCAR: "資本財", ROK: "資本財", AME: "資本財", CSX: "資本財",
  NSC: "資本財", UPS: "資本財", FDX: "資本財", WM: "資本財",
  RSG: "資本財", CSGP: "資本財", IR: "資本財", FTV: "資本財",
  GEV: "資本財", BWA: "資本財", LII: "資本財", CONGL: "資本財",
  VRT: "資本財", HON: "資本財", WM: "資本財",
  // ── 個別株: エネルギー ──
  XOM: "エネルギー", CVX: "エネルギー", COP: "エネルギー",
  EOG: "エネルギー", SLB: "エネルギー", MPC: "エネルギー",
  PSX: "エネルギー", VLO: "エネルギー", OXY: "エネルギー",
  HAL: "エネルギー", DVN: "エネルギー", BKR: "エネルギー",
  // ── 個別株: 素材 ──
  LIN: "素材", APD: "素材", SHW: "素材", ECL: "素材",
  NEM: "素材", FCX: "素材", NUE: "素材", VMC: "素材",
  MLM: "素材", ALB: "素材", PPG: "素材", RPM: "素材",
  CRH: "素材", SPECIA: "素材",
  // ── 個別株: 不動産 ──
  PLD: "不動産", AMT: "不動産", EQIX: "不動産", CCI: "不動産",
  SPG: "不動産", O: "不動産", DLR: "不動産", PSA: "不動産",
  AVB: "不動産", EQR: "不動産", WY: "不動産", REIT: "不動産",
  // ── 個別株: 公共事業 ──
  NEE: "公共事業", DUK: "公共事業", SO: "公共事業", D: "公共事業",
  AEP: "公共事業", EXC: "公共事業", SRE: "公共事業", XEL: "公共事業",
  // ── 個別株: ヘルスケア機器/サービス ──
  DXCM: "ヘルスケア", PODD: "ヘルスケア", ALGN: "ヘルスケア",
  INCY: "ヘルスケア", EXAS: "ヘルスケア", TECH: "ヘルスケア",
};

/** ETFをファンド名から分類（静的テーブルにない場合のフォールバック） */
function classifyEtf(ticker: string, shortName?: string, longName?: string): string {
  // 静的テーブル優先
  const upper = ticker.toUpperCase().replace(".T", "");
  if (ETF_SECTOR_MAP[upper]) return ETF_SECTOR_MAP[upper];
  // shortName でキーワード分類
  const name = (shortName ?? longName ?? "").toLowerCase();
  if (!name) return "米国ETF";
  if (/bond|fixed.income|treasury|aggregate|duration|credit/.test(name)) return "債券ETF";
  if (/emerging|developing/.test(name)) return "新興国ETF";
  if (/total world|all.world|acwi|global/.test(name)) return "全世界ETF";
  if (/developed.market|eafe|international|europe|pacific|asia/.test(name)) return "先進国ETF";
  if (/commodity|gold|silver|oil|energy/.test(name)) return "コモディティ";
  return "米国ETF";
}

/** セクター名を日本語に正規化 */
function normalizeSector(
  ticker: string,
  sector?: string,
  quoteType?: string,
  isJpy = false,
  shortName?: string,
  longName?: string
): string {
  // 静的テーブルを最優先（API失敗時も確実に動く）
  const upper = ticker.toUpperCase().replace(".T", "");
  if (ETF_SECTOR_MAP[upper]) return ETF_SECTOR_MAP[upper];
  // quoteType が返ってきた場合は shortName でさらに分類
  if (quoteType === "ETF" || quoteType === "MUTUALFUND") return classifyEtf(ticker, shortName, longName);
  if (!sector) return isJpy ? "日本株" : "その他";
  const map: Record<string, string> = {
    "Technology": "テクノロジー",
    "Energy": "エネルギー",
    "Consumer Cyclical": "一般消費財",
    "Consumer Defensive": "生活必需品",
    "Healthcare": "ヘルスケア",
    "Financial Services": "金融",
    "Industrials": "資本財",
    "Basic Materials": "素材",
    "Real Estate": "不動産",
    "Utilities": "公共事業",
    "Communication Services": "通信",
  };
  return map[sector] ?? sector;
}

/** Yahoo Finance v7 APIでセクター情報を一括取得 */
async function fetchYahooSectors(symbols: string[]): Promise<Map<string, { sector?: string; quoteType?: string; shortName?: string; longName?: string }>> {
  const result = new Map<string, { sector?: string; quoteType?: string; shortName?: string; longName?: string }>();
  if (symbols.length === 0) return result;
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return result;
    const json = (await res.json()) as YahooV7Response;
    for (const q of json.quoteResponse?.result ?? []) {
      result.set(q.symbol, { sector: q.sector, quoteType: q.quoteType, shortName: q.shortName, longName: q.longName });
    }
  } catch { /* フォールバック: セクターなしのまま */ }
  return result;
}

/** BTC/JPY を CoinGecko APIで取得（フォールバックはYahoo Finance） */
export async function fetchBtcJpy(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=jpy",
      { next: { revalidate: 0 } }
    );
    if (res.ok) {
      const json = (await res.json()) as { bitcoin?: { jpy?: number } };
      const price = json.bitcoin?.jpy;
      if (price && price > 0) return price;
    }
  } catch { /* fallthrough */ }
  // フォールバック: Yahoo Finance (BTC-JPY)
  const q = await fetchYahooQuote("BTC-JPY");
  return q?.price ?? 0;
}

/** ティッカーをYahoo Financeシンボルに変換 */
function toYahooSymbol(ticker: string): string {
  // 日本株（4桁数字）
  if (/^\d{4}$/.test(ticker)) return `${ticker}.T`;
  return ticker;
}

/** ポートフォリオ銘柄かどうか判定 */
function isJpyTicker(ticker: string): boolean {
  return /^\d{4}$/.test(ticker);
}

/** 全市場データを取得・計算して MarketData を返す */
export async function fetchMarketData(
  portfolio: PortfolioItem[],
  cashJpy = 0
): Promise<MarketData> {
  // --- USD/JPY と Fear&Greed は並行取得 ---
  const [usdjpy, fear_greed] = await Promise.all([
    fetchUsdJpy(),
    fetchFearGreed(),
  ]);

  // --- 指数・商品シンボル ---
  const indexSymbols: Record<string, string> = {
    sp500: "%5EGSPC",   // ^GSPC
    nasdaq: "%5EIXIC",  // ^IXIC
    vix: "%5EVIX",      // ^VIX
    tnx: "%5ETNX",      // ^TNX (米10年金利)
    gold: "GC%3DF",     // GC=F
    oil: "CL%3DF",      // CL=F (WTI原油)
    brent: "BZ%3DF",    // BZ=F (Brent原油)
    dxy: "DX%3DF",      // DX=F (ドル指数)
  };

  // 指数と全ポートフォリオ銘柄を並行取得
  const portfolioSymbols = portfolio.map((p) => toYahooSymbol(p.ticker));
  const allSymbols = [
    ...Object.values(indexSymbols),
    ...portfolioSymbols,
  ];

  const results = await Promise.all(
    allSymbols.map((s) => fetchYahooQuote(decodeURIComponent(s)))
  );

  // 指数結果を取り出す
  const idxKeys = Object.keys(indexSymbols);
  const idxResults = results.slice(0, idxKeys.length);
  const portfolioResults = results.slice(idxKeys.length);

  const getIdx = (key: string) => {
    const i = idxKeys.indexOf(key);
    return idxResults[i];
  };

  const sp500 = getIdx("sp500")?.price ?? 0;
  const sp500_chg = getIdx("sp500")?.change_pct ?? 0;
  const nasdaq = getIdx("nasdaq")?.price ?? 0;
  const nasdaq_chg = getIdx("nasdaq")?.change_pct ?? 0;
  const vix = getIdx("vix")?.price ?? 0;
  const tnx = getIdx("tnx")?.price ?? 0;
  const gold = getIdx("gold")?.price ?? 0;
  const gold_chg = getIdx("gold")?.change_pct ?? 0;
  const oil = getIdx("oil")?.price ?? 0;
  const oil_chg = getIdx("oil")?.change_pct ?? 0;
  const brent = getIdx("brent")?.price ?? 0;
  const brent_chg = getIdx("brent")?.change_pct ?? 0;
  const dxy = getIdx("dxy")?.price ?? 0;

  // --- セクター情報を並行取得 ---
  const portfolioYahooSymbols = portfolio.map((p) => toYahooSymbol(p.ticker));
  const sectorMap = await fetchYahooSectors(portfolioYahooSymbols);

  // --- ポートフォリオ評価計算 ---
  const evaluated: PortfolioEval[] = portfolio.map((item, i) => {
    const quote = portfolioResults[i];
    const is_jpy = isJpyTicker(item.ticker);
    const current_price = quote?.price ?? item.cost_price;
    const change_pct = quote?.change_pct ?? 0;

    // 円換算
    const rate = is_jpy ? 1 : usdjpy;
    const current_price_jpy = current_price * rate;
    const cost_jpy = is_jpy
      ? item.cost_price * item.shares
      : item.cost_price * item.shares * (item.cost_rate ?? usdjpy);

    const current_value_jpy = current_price_jpy * item.shares;
    const gain_jpy = current_value_jpy - cost_jpy;
    const gain_pct = cost_jpy > 0 ? (gain_jpy / cost_jpy) * 100 : 0;

    const yahooSym = portfolioYahooSymbols[i];
    const sectorInfo = sectorMap.get(yahooSym);
    const sector = normalizeSector(item.ticker, sectorInfo?.sector, sectorInfo?.quoteType, is_jpy, sectorInfo?.shortName, sectorInfo?.longName);

    return {
      ...item,
      current_price,
      change_pct,
      current_price_jpy,
      cost_jpy,
      gain_jpy,
      gain_pct,
      weight: 0, // 後で計算
      is_jpy,
      sector,
    };
  });

  // 合計評価額で構成比を計算（キャッシュを含む）
  const total_value_jpy = evaluated.reduce(
    (sum, e) => sum + e.current_price_jpy * e.shares,
    0
  );
  const grand_total_jpy = total_value_jpy + cashJpy;
  evaluated.forEach((e) => {
    e.weight =
      grand_total_jpy > 0
        ? ((e.current_price_jpy * e.shares) / grand_total_jpy) * 100
        : 0;
  });

  const total_jpy = total_value_jpy / 10000; // 万円
  const total_cost_jpy =
    evaluated.reduce((sum, e) => sum + e.cost_jpy, 0) / 10000;
  const total_gain_jpy = total_jpy - total_cost_jpy;
  const total_pct =
    total_cost_jpy > 0 ? (total_gain_jpy / total_cost_jpy) * 100 : 0;

  // 本日損益：各銘柄の前日比を構成比で加重平均
  const daily_gain_jpy =
    evaluated.reduce(
      (sum, e) => sum + (e.current_price_jpy * e.shares * e.change_pct) / 100,
      0
    ) / 10000;
  const daily_pct =
    (total_jpy - daily_gain_jpy) > 0
      ? (daily_gain_jpy / (total_jpy - daily_gain_jpy)) * 100
      : 0;

  return {
    usdjpy,
    sp500,
    sp500_chg,
    nasdaq,
    nasdaq_chg,
    vix,
    tnx,
    gold,
    gold_chg,
    oil,
    oil_chg,
    brent,
    brent_chg,
    dxy,
    fear_greed,
    portfolio: evaluated,
    cash_jpy: cashJpy,
    total_jpy,
    total_cost_jpy,
    daily_gain_jpy,
    daily_pct,
    total_gain_jpy,
    total_pct,
    generated_at: new Date().toISOString(),
  };
}
