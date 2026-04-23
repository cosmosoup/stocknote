// ポートフォリオ保有銘柄
export interface PortfolioItem {
  id?: number;
  ticker: string;       // 'VT', '6758', 'GC=F' etc.
  shares: number;       // 保有口数
  cost_price: number;   // 取得単価（現地通貨）
  cost_rate: number | null; // 取得時USD/JPYレート（US株のみ、日本株はnull）
  hypothesis?: string;  // 投資仮説（任意）
}

// 銘柄ごとの評価データ（計算済み）
export interface PortfolioEval extends PortfolioItem {
  current_price: number;     // 現在値（現地通貨）
  change_pct: number;        // 前日比%
  current_price_jpy: number; // 現在値（円換算）
  cost_jpy: number;          // 取得コスト（円換算）
  gain_jpy: number;          // 含損益（円）
  gain_pct: number;          // 含損益%（通算）
  weight: number;            // ポートフォリオ構成比%
  is_jpy: boolean;           // 日本株フラグ
  sector?: string;           // セクター（日本語）
}

// 市場データ
export interface MarketData {
  usdjpy: number;           // USD/JPY
  sp500: number;            // S&P500
  sp500_chg: number;        // S&P500前日比%
  nasdaq: number;           // NASDAQ
  nasdaq_chg: number;       // NASDAQ前日比%
  vix: number;              // VIX
  tnx: number;              // 米10年金利%
  gold: number;             // Gold価格（USD/oz）
  gold_chg: number;         // Gold前日比%
  oil: number;              // WTI原油（USD/barrel）
  oil_chg: number;          // WTI前日比%
  brent: number;            // Brent原油（USD/barrel）
  brent_chg: number;        // Brent前日比%
  dxy: number;              // ドル指数（DXY）
  fear_greed: number;       // Fear & Greed Index
  portfolio: PortfolioEval[];
  cash_jpy: number;         // キャッシュ残高（円）
  total_jpy: number;        // 株式評価額（万円、キャッシュ除く）
  total_cost_jpy: number;   // 合計取得コスト（万円）
  daily_gain_jpy: number;   // 本日損益（万円）
  daily_pct: number;        // 本日損益%
  total_gain_jpy: number;   // 通算含損益（万円）
  total_pct: number;        // 通算損益%
  generated_at: string;     // 生成日時（ISO文字列）
}

// ニュース記事
export interface NewsItem {
  title: string;
  summary: string;
  source: string;
  pubDate?: string;
}

// チャートURL群
export interface Charts {
  alloc: string;    // 構成比横棒
  bar: string;      // 銘柄別損益横棒
  compare: string;  // ポートフォリオ vs S&P500 + ドローダウン
  sector: string;   // セクター別配分
}

// 過去ログ（Report_Log相当）
export interface ReportLog {
  id: number;
  created_at: string;
  daily_pct: number;
  total_pct: number;
  total_jpy: number;
  market_data: MarketData | null;
  report_html: string | null;
}

// 歴史データ（グラフ用）
export interface HistoryPoint {
  date: string;
  total_pct: number;
  total_jpy: number;
  daily_pct: number;    // 日次損益%
  sp500_chg: number;    // S&P500日次%（market_dataから取得）
}

// その他資産設定（手動入力）
export interface OtherAssets {
  trust_jpy: number;     // 投資信託評価額（円）
  btc_amount: number;    // BTC保有量
  free_cash_jpy: number; // フリーキャッシュ（円）
}

// 総資産スナップショット（日次記録）
export interface AssetSnapshot {
  date: string;
  stocks_jpy: number;    // 株式評価額（円）
  trust_jpy: number;     // 投資信託（円）
  btc_jpy: number;       // BTC評価額（円）
  cash_jpy: number;      // ポートフォリオキャッシュ（円）
  free_cash_jpy: number; // フリーキャッシュ（円）
  total_jpy: number;     // 合計（円）
}
