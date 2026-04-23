"use client";

import { useState, useEffect } from "react";
import type { AssetSnapshot } from "@/types";

const QUICKCHART = "https://quickchart.io/chart";
const COLORS = {
  stocks: "#008b8b",
  trust: "#3b82f6",
  btc: "#f59e0b",
  cash: "#10b981",
  free_cash: "#94a3b8",
};

function toWan(yen: number) {
  return (yen / 10000).toFixed(0);
}

function buildTrendUrl(history: AssetSnapshot[]): string {
  const labels = history.map((h) => h.date.slice(5).replace("-", "/"));
  const makeData = (key: keyof AssetSnapshot) =>
    history.map((h) => parseFloat(((h[key] as number) / 10000).toFixed(1)));

  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "株式", data: makeData("stocks_jpy"), backgroundColor: COLORS.stocks, stack: "a" },
        { label: "投資信託", data: makeData("trust_jpy"), backgroundColor: COLORS.trust, stack: "a" },
        { label: "BTC", data: makeData("btc_jpy"), backgroundColor: COLORS.btc, stack: "a" },
        { label: "ポートキャッシュ", data: makeData("cash_jpy"), backgroundColor: COLORS.cash, stack: "a" },
        { label: "フリーキャッシュ", data: makeData("free_cash_jpy"), backgroundColor: COLORS.free_cash, stack: "a" },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#64748b", font: { size: 10 }, boxWidth: 12 } },
      },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 9 }, maxTicksLimit: 15 }, grid: { display: false } },
        y: {
          stacked: true,
          ticks: { color: "#94a3b8", font: { size: 10 }, callback: "function(v){return v+'万'}" },
          grid: { color: "#e2e8f0" },
        },
      },
    },
  };
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(config))}&backgroundColor=%23ffffff&width=900&height=280&v=3`;
}

function buildBreakdownUrl(latest: AssetSnapshot): string {
  const entries = [
    { label: "株式", value: latest.stocks_jpy, color: COLORS.stocks },
    { label: "投資信託", value: latest.trust_jpy, color: COLORS.trust },
    { label: "BTC", value: latest.btc_jpy, color: COLORS.btc },
    { label: "キャッシュ", value: latest.cash_jpy, color: COLORS.cash },
    { label: "フリーキャッシュ", value: latest.free_cash_jpy, color: COLORS.free_cash },
  ].filter((e) => e.value > 0);

  const total = entries.reduce((s, e) => s + e.value, 0);
  const config = {
    type: "bar",
    data: {
      labels: entries.map((e) => e.label),
      datasets: [{
        data: entries.map((e) => parseFloat(((e.value / total) * 100).toFixed(1))),
        backgroundColor: entries.map((e) => e.color),
        borderWidth: 0,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#e2e8f0" }, max: 100 },
        y: { ticks: { color: "#334155", font: { size: 11 } }, grid: { display: false } },
      },
    },
  };
  const h = Math.max(180, entries.length * 36 + 50);
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(config))}&backgroundColor=%23ffffff&width=600&height=${h}&v=3`;
}

export default function AssetsPage() {
  const [history, setHistory] = useState<AssetSnapshot[]>([]);
  const [btcPrice, setBtcPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/assets").then((r) => r.json())
      .then((d: { history: AssetSnapshot[]; btc_price_jpy: number }) => {
        setHistory(d.history ?? []);
        setBtcPrice(d.btc_price_jpy ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const latest = history[history.length - 1];

  return (
    <div className="min-h-screen bg-slate-100">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <a href="/" className="text-slate-500 hover:text-slate-900 text-sm">← 最新レポート</a>
          <span className="text-slate-900 font-semibold">📊 総資産</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-slate-400 text-sm">
            読み込み中...
          </div>
        ) : history.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <p className="text-slate-500 text-sm">まだデータがありません。</p>
            <p className="text-slate-400 text-xs mt-2">
              <a href="/portfolio" className="text-[#008b8b] underline">銘柄管理ページ</a>
              でその他資産を入力し、レポートを生成してください。
            </p>
          </div>
        ) : (
          <>
            {/* 現在の総資産サマリー */}
            {latest && (
              <div className="bg-white rounded-xl p-5 border border-[#b2e0e0] shadow-sm">
                <h2 className="text-[#008b8b] font-semibold text-sm uppercase tracking-wider mb-4">
                  💰 現在の総資産（{latest.date}時点）
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "総資産", value: latest.total_jpy, bold: true },
                    { label: "株式", value: latest.stocks_jpy },
                    { label: "投資信託", value: latest.trust_jpy },
                    { label: "BTC", value: latest.btc_jpy },
                    { label: "ポートキャッシュ", value: latest.cash_jpy },
                    { label: "フリーキャッシュ", value: latest.free_cash_jpy },
                  ].map(({ label, value, bold }) => (
                    <div key={label} className={`rounded-lg p-3 ${bold ? "bg-[#e6f5f5] border border-[#b2e0e0]" : "bg-slate-50"}`}>
                      <div className="text-slate-400 text-xs mb-1">{label}</div>
                      <div className={`font-mono ${bold ? "text-[#008b8b] text-lg font-bold" : "text-slate-700 text-sm"}`}>
                        {toWan(value)}万円
                      </div>
                      {bold && latest.total_jpy > 0 && (
                        <div className="text-slate-400 text-xs mt-0.5">100%</div>
                      )}
                      {!bold && latest.total_jpy > 0 && (
                        <div className="text-slate-400 text-xs mt-0.5">
                          {((value / latest.total_jpy) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {btcPrice > 0 && (
                  <p className="text-slate-400 text-xs">
                    BTC/JPY: {btcPrice.toLocaleString()}円（CoinGecko）
                  </p>
                )}
              </div>
            )}

            {/* 構成比 */}
            {latest && (
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <h2 className="text-slate-600 font-semibold text-sm uppercase tracking-wider mb-3">
                  構成比
                </h2>
                <img
                  src={buildBreakdownUrl(latest)}
                  alt="資産構成比"
                  className="w-full rounded"
                  loading="lazy"
                />
              </div>
            )}

            {/* 推移グラフ */}
            {history.length >= 2 && (
              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <h2 className="text-slate-600 font-semibold text-sm uppercase tracking-wider mb-3">
                  総資産推移（万円）
                </h2>
                <img
                  src={buildTrendUrl(history)}
                  alt="総資産推移"
                  className="w-full rounded"
                  loading="lazy"
                />
              </div>
            )}

            {/* 履歴テーブル */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["日付", "総資産", "株式", "投資信託", "BTC", "キャッシュ", "フリーキャッシュ"].map((h) => (
                      <th key={h} className="text-left text-slate-400 font-medium px-4 py-3 text-xs whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((snap) => (
                    <tr key={snap.date} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-slate-500 text-xs font-mono">{snap.date}</td>
                      <td className="px-4 py-2.5 text-slate-900 font-semibold font-mono">{toWan(snap.total_jpy)}万</td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{toWan(snap.stocks_jpy)}万</td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{toWan(snap.trust_jpy)}万</td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{toWan(snap.btc_jpy)}万</td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{toWan(snap.cash_jpy)}万</td>
                      <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">{toWan(snap.free_cash_jpy)}万</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
