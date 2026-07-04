"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import MobileNav from "@/app/_components/MobileNav";
import type { MarketData, NewsItem, PortfolioEval } from "@/types";

function pctColor(n: number) {
  if (n > 0) return "text-[#008b8b]";
  if (n < 0) return "text-red-600";
  return "text-slate-400";
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmt(n: number, d = 2) {
  return n.toLocaleString("ja-JP", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fearGreedLabel(score: number) {
  if (score >= 75) return "Extreme Greed";
  if (score >= 55) return "Greed";
  if (score >= 45) return "Neutral";
  if (score >= 25) return "Fear";
  return "Extreme Fear";
}

function fearGreedColor(score: number) {
  if (score >= 75) return "text-red-600";
  if (score >= 55) return "text-amber-600";
  if (score >= 45) return "text-slate-500";
  if (score >= 25) return "text-blue-600";
  return "text-purple-600";
}

// セクターヒートマップの色分け（日次%移動用。通算損益より小さいレンジで色分け）
function heatBg(pct: number): string {
  if (pct >= 2) return "bg-[#065f46] text-white";
  if (pct >= 1) return "bg-[#059669] text-white";
  if (pct >= 0.3) return "bg-[#34d399] text-emerald-950";
  if (pct >= -0.3) return "bg-slate-200 text-slate-600";
  if (pct >= -1) return "bg-[#f87171] text-red-950";
  if (pct >= -2) return "bg-[#dc2626] text-white";
  return "bg-[#7f1d1d] text-white";
}

function timeAgo(pubDate?: string): string {
  if (!pubDate) return "";
  const diffMs = Date.now() - new Date(pubDate).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

// 52週レンジ内での現在位置（0=安値, 100=高値）
function week52Position(e: PortfolioEval): number | null {
  if (!e.week52_high || !e.week52_low || e.week52_high <= e.week52_low) return null;
  const pos = ((e.current_price - e.week52_low) / (e.week52_high - e.week52_low)) * 100;
  return Math.min(100, Math.max(0, pos));
}

function Week52Bar({ e }: { e: PortfolioEval }) {
  const pos = week52Position(e);
  if (pos === null) return <span className="text-slate-300 text-xs">—</span>;
  const nearHigh = pos >= 92;
  const nearLow = pos <= 8;
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="relative flex-1 h-1.5 bg-slate-100 rounded-full">
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${
            nearHigh ? "bg-red-500" : nearLow ? "bg-blue-500" : "bg-slate-500"
          }`}
          style={{ left: `${pos}%` }}
        />
      </div>
      <span className={`text-[0.65rem] w-8 text-right ${nearHigh ? "text-red-600 font-medium" : nearLow ? "text-blue-600 font-medium" : "text-slate-400"}`}>
        {Math.round(pos)}%
      </span>
    </div>
  );
}

export default function MarketPage() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const router = useRouter();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/market");
      const data = await res.json() as { market?: MarketData; news?: NewsItem[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "取得に失敗しました");
      setMarket(data.market ?? null);
      setNews(data.news ?? []);
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const sortedPortfolio = market
    ? [...market.portfolio].sort((a, b) => b.weight - a.weight)
    : [];

  // 今日の注目銘柄: 前日比±2%超、または52週レンジの上下8%以内
  const notableMovers = sortedPortfolio.filter((e) => {
    if (Math.abs(e.change_pct) >= 2) return true;
    const pos = week52Position(e);
    return pos !== null && (pos >= 92 || pos <= 8);
  });

  const fgReversalZone = market
    ? market.fear_greed <= 25
      ? "歴史的な買い場圏（逆張り検討）"
      : market.fear_greed >= 75
      ? "過熱圏（利確・様子見を検討）"
      : null
    : null;

  return (
    <div className="min-h-screen bg-slate-100 pb-32 sm:pb-0">
      {/* ── ナビ ── */}
      <div className="hidden sm:block sticky top-0 z-10">
        <nav className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-4">
              <a href="/" className="text-slate-500 hover:text-slate-900 text-xs sm:text-sm transition-colors">
                ‹ 最新レポート
              </a>
              <span className="text-slate-300">|</span>
              <span className="text-slate-900 text-sm font-medium">マーケット速報</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void load(true)}
                disabled={refreshing}
                className="px-3 py-1.5 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs sm:text-sm rounded-lg font-medium transition-colors"
              >
                {refreshing ? "更新中…" : "更新"}
              </button>
              <button
                onClick={() => void handleLogout()}
                className="text-slate-400 hover:text-slate-600 text-xs transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </nav>
      </div>

      {/* ── モバイル用ヘッダー ── */}
      <div className="sm:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <span className="text-slate-900 text-sm font-medium">マーケット速報</span>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="px-3 py-1.5 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs rounded-lg font-medium transition-colors"
        >
          {refreshing ? "更新中…" : "更新"}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center min-h-96 text-slate-400">
            読み込み中...
          </div>
        )}

        {!loading && market && (
          <>
            {updatedAt && (
              <p className="text-slate-400 text-xs mb-3">
                最終更新: {updatedAt.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}
                （AIレポートは含まれません。市場データとニュースのみのリアルタイム表示です）
              </p>
            )}

            {/* ── 市場パルス: 指数・VIX・Fear&Greed ── */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
              <h2 className="text-slate-900 text-sm font-semibold mb-3">市場パルス</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">S&amp;P 500</div>
                  <div className="text-slate-900 font-semibold">{fmt(market.sp500, 0)}</div>
                  <div className={`text-xs font-medium ${pctColor(market.sp500_chg)}`}>{fmtPct(market.sp500_chg)}</div>
                  {market.sp500_data_date && (
                    <div className="text-slate-400 text-[0.6rem] mt-0.5">{market.sp500_data_date}（米国時間）</div>
                  )}
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">NASDAQ</div>
                  <div className="text-slate-900 font-semibold">{fmt(market.nasdaq, 0)}</div>
                  <div className={`text-xs font-medium ${pctColor(market.nasdaq_chg)}`}>{fmtPct(market.nasdaq_chg)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">USD/JPY</div>
                  <div className="text-slate-900 font-semibold">{fmt(market.usdjpy, 2)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">VIX</div>
                  <div className={`font-semibold ${market.vix > 25 ? "text-red-600" : "text-slate-900"}`}>{fmt(market.vix, 2)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">米10年金利</div>
                  <div className="text-slate-900 font-semibold">{fmt(market.tnx, 3)}%</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">Gold (USD/oz)</div>
                  <div className="text-slate-900 font-semibold">{fmt(market.gold, 0)}</div>
                  <div className={`text-xs font-medium ${pctColor(market.gold_chg)}`}>{fmtPct(market.gold_chg)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">WTI原油</div>
                  <div className="text-slate-900 font-semibold">{fmt(market.oil, 2)}</div>
                  <div className={`text-xs font-medium ${pctColor(market.oil_chg)}`}>{fmtPct(market.oil_chg)}</div>
                </div>
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-slate-400 text-[0.65rem] uppercase tracking-wide mb-1">Fear &amp; Greed</div>
                  <div className={`font-semibold ${fearGreedColor(market.fear_greed)}`}>{market.fear_greed}</div>
                  <div className={`text-xs font-medium ${fearGreedColor(market.fear_greed)}`}>{fearGreedLabel(market.fear_greed)}</div>
                </div>
              </div>
              {fgReversalZone && (
                <div className="mt-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-800">
                  Fear &amp; Greed {market.fear_greed} — {fgReversalZone}
                </div>
              )}
            </div>

            {/* ── セクターヒートマップ ── */}
            {market.sector_heatmap && market.sector_heatmap.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
                <h2 className="text-slate-900 text-sm font-semibold mb-3">セクターヒートマップ（米国11セクター・前日比）</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {[...market.sector_heatmap]
                    .sort((a, b) => b.change_pct - a.change_pct)
                    .map((s) => (
                      <div key={s.ticker} className={`rounded-lg p-2.5 text-center ${heatBg(s.change_pct)}`}>
                        <div className="text-[0.6rem] opacity-80">{s.sector}</div>
                        <div className="text-xs font-semibold">{s.ticker}</div>
                        <div className="text-sm font-bold">{fmtPct(s.change_pct)}</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── 今日の注目銘柄 ── */}
            {notableMovers.length > 0 && (
              <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
                <h2 className="text-slate-900 text-sm font-semibold mb-1">今日の注目銘柄</h2>
                <p className="text-slate-400 text-xs mb-3">前日比±2%超、または52週レンジの上下8%圏内の保有銘柄</p>
                <div className="space-y-2">
                  {notableMovers.map((e) => {
                    const pos = week52Position(e);
                    return (
                      <div key={e.ticker} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 text-sm">{e.ticker}</span>
                          {pos !== null && pos >= 92 && (
                            <span className="text-[0.6rem] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">52週高値圏</span>
                          )}
                          {pos !== null && pos <= 8 && (
                            <span className="text-[0.6rem] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">52週安値圏</span>
                          )}
                        </div>
                        <span className={`text-sm font-semibold ${pctColor(e.change_pct)}`}>{fmtPct(e.change_pct)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── 保有銘柄一覧（52週レンジ付き） ── */}
            <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
              <h2 className="text-slate-900 text-sm font-semibold mb-3">保有銘柄一覧</h2>
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 text-xs">
                      <th className="text-left font-medium pb-2">銘柄</th>
                      <th className="text-right font-medium pb-2">現在値</th>
                      <th className="text-right font-medium pb-2">前日比</th>
                      <th className="text-right font-medium pb-2">含損益</th>
                      <th className="text-left font-medium pb-2 pl-3">52週レンジ</th>
                      <th className="text-right font-medium pb-2">構成比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPortfolio.map((e) => (
                      <tr key={e.ticker} className="border-t border-slate-100">
                        <td className="py-2 font-semibold text-slate-900">
                          {e.ticker}
                          {e.price_stale && (
                            <span title="価格取得に失敗したため取得単価で代用表示中。含損益%は無視してください" className="ml-1 text-red-600 cursor-help">⚠</span>
                          )}
                          {!e.price_stale && e.split_suspected && (
                            <span title="含損益%が異常値です。株式分割・併合等でコストデータがずれている可能性があります。資産管理画面で保有口数・取得単価をご確認ください" className="ml-1 text-amber-600 cursor-help">⚠</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-slate-600">
                          {e.is_jpy ? `${fmt(e.current_price, 0)}円` : `${fmt(e.current_price, 2)}USD`}
                        </td>
                        <td className={`py-2 text-right font-medium ${pctColor(e.change_pct)}`}>{fmtPct(e.change_pct)}</td>
                        <td className={`py-2 text-right font-medium ${pctColor(e.gain_pct)}`}>{fmtPct(e.gain_pct)}</td>
                        <td className="py-2 pl-3"><Week52Bar e={e} /></td>
                        <td className="py-2 text-right text-slate-400">{fmt(e.weight, 1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sortedPortfolio.some((e) => e.price_stale || e.split_suspected) && (
                <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
                  ⚠ 警告マーク付き銘柄の含損益%は現在信頼できません。価格取得失敗、または株式分割・併合等でコストデータがずれている可能性があります。
                  <a href="/portfolio" className="underline font-medium ml-1">資産管理画面で確認する</a>
                </div>
              )}
            </div>

            {/* ── 最新ニュース（日本語訳） ── */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
              <h2 className="text-slate-900 text-sm font-semibold mb-3">最新ニュース</h2>
              <div className="space-y-3">
                {news.map((n, i) => (
                  <a
                    key={i}
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block ${i > 0 ? "pt-3 border-t border-slate-100" : ""} ${n.link ? "hover:bg-slate-50 -mx-1 px-1 rounded" : "pointer-events-none"}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[0.65rem] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">{n.source}</span>
                      {n.pubDate && <span className="text-[0.65rem] text-slate-300">{timeAgo(n.pubDate)}</span>}
                    </div>
                    <p className="text-slate-900 text-sm font-medium leading-snug">{n.title_ja ?? n.title}</p>
                    {(n.summary_ja ?? n.summary) && (
                      <p className="text-slate-500 text-xs mt-0.5 leading-relaxed line-clamp-2">{n.summary_ja ?? n.summary}</p>
                    )}
                  </a>
                ))}
                {news.length === 0 && (
                  <p className="text-slate-400 text-sm">ニュースを取得できませんでした</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <MobileNav active="/market" />
    </div>
  );
}
