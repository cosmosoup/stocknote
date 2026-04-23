"use client";

import { useState, useEffect, useRef } from "react";
import type { AssetSnapshot } from "@/types";

const QUICKCHART = "https://quickchart.io/chart";

const BREAKDOWN = [
  { key: "stocks_jpy",    label: "株式",             color: "#008b8b" },
  { key: "trust_jpy",     label: "投資信託",         color: "#3b82f6" },
  { key: "btc_jpy",       label: "BTC",              color: "#f59e0b" },
  { key: "cash_jpy",      label: "キャッシュ",       color: "#10b981" },
  { key: "free_cash_jpy", label: "フリーキャッシュ", color: "#94a3b8" },
] as const;

function toWan(yen: number, d = 0) { return (yen / 10000).toFixed(d); }

/* ── 合計数値カウントアップ（ページ読み込み時に動く演出）
   意味: 「実際のデータが読み込まれた」ことを直感的に示す
   動作: 0 → 実際の値へ 0.8秒でイーズアウト                 ── */
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (target <= 0) { setVal(0); return; }
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      setVal(Math.round(target * ease));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return val;
}

/* ── ドーナツ（構成比） ── */
function buildDonutUrl(snap: AssetSnapshot): string {
  const entries = BREAKDOWN
    .map(b => ({ label: b.label, value: +(snap[b.key as keyof AssetSnapshot] as number), color: b.color }))
    .filter(e => e.value > 0);
  if (!entries.length) return "";
  const total = entries.reduce((s, e) => s + e.value, 0);
  const cfg = {
    type: "doughnut",
    data: {
      labels: entries.map(e => `${e.label}  ${((e.value / total) * 100).toFixed(1)}%`),
      datasets: [{
        data: entries.map(e => +((e.value / total) * 100).toFixed(1)),
        backgroundColor: entries.map(e => e.color),
        borderWidth: 3,
        borderColor: "#ffffff",
        hoverOffset: 4,
      }],
    },
    options: {
      cutout: "64%",
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#334155", font: { size: 14 }, padding: 18, boxWidth: 13, boxHeight: 13 },
        },
      },
    },
  };
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(cfg))}&backgroundColor=%23ffffff&width=640&height=280&v=3`;
}

/* ── 総資産推移（折れ線グラフ） ── */
function buildTrendUrl(history: AssetSnapshot[]): string {
  if (history.length < 2) return "";
  const labels = history.map(h => h.date.slice(5).replace("-", "/"));
  const data   = history.map(h => +((h.total_jpy) / 10000).toFixed(1));
  const cfg = {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "総資産（万円）",
        data,
        borderColor: "#008b8b",
        backgroundColor: "rgba(0,139,139,0.07)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: "#008b8b",
        pointBorderColor: "#ffffff",
        pointBorderWidth: 2,
        borderWidth: 2.5,
      }],
    },
    options: {
      plugins: {
        legend: {
          labels: { color: "#64748b", font: { size: 13 }, boxWidth: 14, padding: 16 },
        },
      },
      scales: {
        x: {
          ticks: { color: "#64748b", font: { size: 12 }, maxTicksLimit: 12 },
          grid: { display: false },
        },
        y: {
          ticks: { color: "#94a3b8", font: { size: 12 } },
          grid: { color: "#f1f5f9" },
        },
      },
    },
  };
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(cfg))}&backgroundColor=%23ffffff&width=1100&height=320&v=3`;
}

/* ── メインコンポーネント ── */
export default function AssetsPage() {
  const [history, setHistory] = useState<AssetSnapshot[]>([]);
  const [btcPrice, setBtcPrice] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [entered, setEntered]   = useState(false);

  useEffect(() => {
    fetch("/api/assets")
      .then(r => r.json())
      .then((d: { history: AssetSnapshot[]; btc_price_jpy: number }) => {
        setHistory(d.history ?? []);
        setBtcPrice(d.btc_price_jpy ?? 0);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        requestAnimationFrame(() => setEntered(true));
      });
  }, []);

  const latest  = history[history.length - 1];
  const prev    = history[history.length - 2];
  const diffJpy = latest && prev ? latest.total_jpy - prev.total_jpy : 0;

  // カウントアップ対象: 総資産（万円）
  const totalWan = useCountUp(latest ? Math.round(latest.total_jpy / 10000) : 0);

  const breakdown = latest
    ? BREAKDOWN
        .map(b => ({ ...b, value: +(latest[b.key as keyof AssetSnapshot] as number) }))
        .filter(e => e.value > 0)
    : [];

  return (
    <div className="min-h-screen bg-slate-100">

      {/* ── Nav ── */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png" alt="StockNote" className="h-10 w-auto"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </a>
            <span className="hidden sm:inline text-slate-300 select-none">|</span>
            <span className="hidden sm:inline text-slate-700 font-semibold text-sm">総資産</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/"          className="text-slate-500 hover:text-slate-900 transition-colors text-xs sm:text-sm">最新レポート</a>
            <a href="/history"   className="hidden sm:inline text-slate-500 hover:text-slate-900 transition-colors text-sm">レポート一覧</a>
            <a href="/portfolio" className="text-slate-500 hover:text-slate-900 transition-colors text-xs sm:text-sm">資産管理</a>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-6">

        {loading && (
          <div className="text-slate-400 text-center py-24 text-sm sn-pulse">読み込み中…</div>
        )}

        {!loading && history.length === 0 && (
          <div className="text-center py-24">
            <p className="text-slate-500 text-base">まだデータがありません</p>
            <p className="text-slate-400 text-sm mt-2">
              <a href="/portfolio" className="text-[#008b8b] hover:underline">資産管理</a>でその他資産を入力後、レポートを生成してください
            </p>
          </div>
        )}

        {!loading && history.length > 0 && (
          <div className={`space-y-4 ${entered ? "page-enter" : "opacity-0"}`}>

            {/* ── Hero ── */}
            {latest && (
              <div style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1a2744 50%, #1e293b 100%)",
                borderRadius: 14,
                padding: "26px 28px",
                boxShadow: "0 12px 40px rgba(15,23,42,0.2)",
              }}>
                {/* 合計 + BTC価格 */}
                <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
                  <div>
                    <div className="sn-label mb-2" style={{ color: "#475569" }}>
                      Total Assets — {latest.date}
                    </div>
                    {/* カウントアップ: データロード時に 0→実値へ変化。合計が最重要指標であることを示す */}
                    <div className="num" style={{ color: "#f8fafc", fontSize: "2.6rem", fontWeight: 700, lineHeight: 1 }}>
                      {totalWan.toLocaleString()}
                      <span style={{ fontSize: "1rem", fontWeight: 400, marginLeft: 6, color: "#94a3b8" }}>万円</span>
                    </div>
                    {diffJpy !== 0 && (
                      <div className="num mt-2 text-sm font-medium" style={{ color: diffJpy >= 0 ? "#34d399" : "#f87171" }}>
                        {diffJpy >= 0 ? "▲" : "▼"} {toWan(Math.abs(diffJpy), 1)}万円（前回比）
                      </div>
                    )}
                  </div>
                  {btcPrice > 0 && (
                    <div style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.09)",
                      borderRadius: 8,
                      padding: "10px 16px",
                      textAlign: "right",
                    }}>
                      <div className="sn-label" style={{ color: "#475569" }}>BTC / JPY</div>
                      <div className="num mt-1.5 font-semibold" style={{ fontSize: "0.9rem", color: "#f59e0b" }}>
                        {btcPrice.toLocaleString("ja-JP")}円
                      </div>
                    </div>
                  )}
                </div>

                {/* 内訳グリッド */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8 }}>
                  {breakdown.map(({ key, label, value, color }) => (
                    <div key={key} style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 8,
                      padding: "11px 13px",
                    }}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ color: "#64748b", fontSize: "0.72rem" }}>{label}</span>
                      </div>
                      <div className="num font-bold" style={{ color: "#f1f5f9", fontSize: "1.05rem" }}>
                        {toWan(value, 1)}万
                      </div>
                      <div className="num mt-0.5" style={{ color: "#475569", fontSize: "0.72rem" }}>
                        {((value / latest.total_jpy) * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── 構成比ドーナツ ── */}
            {latest && buildDonutUrl(latest) && (
              <div className="sn-card p-5">
                <div className="sn-label mb-3">Asset Allocation</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildDonutUrl(latest)}
                  alt="資産構成比"
                  className="w-full rounded block"
                  loading="lazy"
                />
              </div>
            )}

            {/* ── 総資産推移（折れ線グラフ） ── */}
            {history.length >= 2 && (
              <div className="sn-card p-5">
                <div className="sn-label mb-3">総資産推移</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={buildTrendUrl(history)}
                  alt="総資産推移"
                  className="w-full rounded block"
                  loading="lazy"
                />
              </div>
            )}

            {/* ── 履歴テーブル ── */}
            {history.length > 0 && (
              <div className="sn-card overflow-hidden">
                <div className="px-5 pt-4 pb-2">
                  <div className="sn-label">履歴</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 560 }}>
                    <thead>
                      <tr style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                        {["日付", "総資産", "株式", "投資信託", "BTC", "キャッシュ", "フリーキャッシュ"].map(h => (
                          <th key={h} className="sn-label text-left px-4 py-2.5 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...history].reverse().map((snap, i) => (
                        <tr
                          key={snap.date}
                          className="transition-colors"
                          style={{
                            borderTop: "1px solid #f1f5f9",
                            background: i === 0 ? "rgba(0,139,139,0.03)" : undefined,
                          }}
                          onMouseEnter={e => { if (i !== 0) (e.currentTarget as HTMLElement).style.background = "#f8fafc"; }}
                          onMouseLeave={e => { if (i !== 0) (e.currentTarget as HTMLElement).style.background = ""; }}
                        >
                          <td className="px-4 py-3 num text-slate-400" style={{ fontSize: "0.8rem" }}>{snap.date}</td>
                          <td className="px-4 py-3 num font-bold text-slate-900 text-sm">{toWan(snap.total_jpy)}万</td>
                          {BREAKDOWN.map(b => (
                            <td key={b.key} className="px-4 py-3 num" style={{ color: b.color, fontSize: "0.82rem" }}>
                              {toWan(+(snap[b.key as keyof AssetSnapshot] as number))}万
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
