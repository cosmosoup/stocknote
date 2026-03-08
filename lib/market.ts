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
  portfolio: PortfolioItem[]
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
    oil: "CL%3DF",      // CL=F
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
    };
  });

  // 合計評価額で構成比を計算
  const total_value_jpy = evaluated.reduce(
    (sum, e) => sum + e.current_price_jpy * e.shares,
    0
  );
  evaluated.forEach((e) => {
    e.weight =
      total_value_jpy > 0
        ? ((e.current_price_jpy * e.shares) / total_value_jpy) * 100
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
    fear_greed,
    portfolio: evaluated,
    total_jpy,
    total_cost_jpy,
    daily_gain_jpy,
    daily_pct,
    total_gain_jpy,
    total_pct,
    generated_at: new Date().toISOString(),
  };
}
