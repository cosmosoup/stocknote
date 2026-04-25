"use client";

import { useState, useEffect, useRef } from "react";
import type { AssetSnapshot, PortfolioEval } from "@/types";
import MobileNav from "@/app/_components/MobileNav";

const QUICKCHART = "https://quickchart.io/chart";

// ⑤ 用語変更: キャッシュ→現金、フリーキャッシュ→投資待機資金
const BREAKDOWN = [
  { key: "stocks_jpy",    label: "株式",           color: "#008b8b" },
  { key: "trust_jpy",     label: "投資信託",       color: "#3b82f6" },
  { key: "btc_jpy",       label: "BTC",            color: "#f59e0b" },
  { key: "cash_jpy",      label: "投資資金",         color: "#f97316" },
  { key: "free_cash_jpy", label: "現金",            color: "#a78bfa" },
] as const;

type Period = "1m" | "3m" | "6m" | "1y" | "ytd" | "all";
const PERIODS: { key: Period; label: string }[] = [
  { key: "1m",  label: "1ヶ月" },
  { key: "3m",  label: "3ヶ月" },
  { key: "6m",  label: "6ヶ月" },
  { key: "1y",  label: "1年" },
  { key: "ytd", label: "今年" },
  { key: "all", label: "全期間" },
];

function toWan(yen: number, d = 0) { return (yen / 10000).toFixed(d); }

function filterByPeriod(history: AssetSnapshot[], period: Period): AssetSnapshot[] {
  if (period === "all") return history;
  const now = new Date();
  let from: Date;
  if (period === "ytd") {
    from = new Date(now.getFullYear(), 0, 1);
  } else {
    const days = { "1m": 30, "3m": 90, "6m": 180, "1y": 365 }[period as "1m" | "3m" | "6m" | "1y"];
    from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
  const fromStr = from.toISOString().slice(0, 10);
  return history.filter(h => h.date >= fromStr);
}

/* ── カウントアップ基本フック ── */
function useCountUpRaw(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return val;
}

/* ② 内訳グリッドの個別数値用（hook はループで呼べないため個別コンポーネントに） */
function WanCount({ jpy, d = 1 }: { jpy: number; d?: number }) {
  const val = useCountUpRaw(jpy);
  return <>{(val / 10000).toFixed(d)}</>;
}

/* ① 資産配分ドーナツ ── datalabelsを無効化して視認性向上、凡例は下 */
function buildDonutUrl(snap: AssetSnapshot, mobile = false): string {
  const entries = BREAKDOWN
    .map(b => ({ label: b.label, value: +(snap[b.key as keyof AssetSnapshot] as number), color: b.color }))
    .filter(e => e.value > 0);
  if (!entries.length) return "";
  const total = entries.reduce((s, e) => s + e.value, 0);
  const cfg = {
    type: "doughnut",
    data: {
      labels: entries.map(e => `${e.label} ${((e.value / total) * 100).toFixed(1)}%`),
      datasets: [{
        data: entries.map(e => +((e.value / total) * 100).toFixed(1)),
        backgroundColor: entries.map(e => e.color),
        borderWidth: 2,
        borderColor: "#ffffff",
        hoverOffset: 3,
      }],
    },
    options: {
      cutout: "58%",
      plugins: {
        datalabels: { display: false },
        legend: {
          position: "bottom",
          labels: { color: "#0f172a", font: { size: 12 }, padding: 10, boxWidth: 11, boxHeight: 11 },
        },
      },
    },
  };
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(cfg))}&backgroundColor=%23ffffff&width=${mobile ? 360 : 380}&height=${mobile ? 290 : 320}&v=3`;
}

/* ⑥ 積み上げ面グラフ（折れ線stacked）— soloKey指定時はそのデータのみ表示 */
function buildStackedUrl(filtered: AssetSnapshot[], mobile = false, soloKey: string | null = null): string {
  if (filtered.length < 2) return "";
  // データが多い場合はサンプリング（URL長対策）
  let data = filtered;
  if (data.length > 60) {
    const step = Math.ceil(data.length / 60);
    data = data.filter((_, i) => i === 0 || i === filtered.length - 1 || i % step === 0);
  }
  const labels = data.map(h => h.date.slice(5).replace("-", "/"));

  // soloKey が指定されている場合はそのキーのみ、なければ全て
  const activeBreakdown = soloKey ? BREAKDOWN.filter(b => b.key === soloKey) : BREAKDOWN;

  const datasets = activeBreakdown.map(b => ({
    label: b.label,
    data: data.map(h => +((+(h[b.key as keyof AssetSnapshot] as number)) / 10000).toFixed(1)),
    backgroundColor: b.color + "cc",
    borderColor: b.color,
    borderWidth: 1.5,
    fill: true,
    tension: 0.3,
    pointRadius: data.length > 45 ? 0 : 3,
  }));
  const cfg = {
    type: "line",
    data: { labels, datasets },
    options: {
      scales: {
        x: { stacked: true, ticks: { color: "#64748b", font: { size: mobile ? 11 : 12 }, maxTicksLimit: mobile ? 6 : 10 }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { color: "#94a3b8", font: { size: mobile ? 11 : 12 } }, grid: { color: "#f1f5f9" } },
      },
      plugins: {
        legend: { display: false },  // カスタム凡例を使用するため非表示
        datalabels: { display: false },
      },
    },
  };
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(cfg))}&backgroundColor=%23ffffff&width=${mobile ? 400 : 700}&height=${mobile ? 260 : 290}&v=3`;
}

/* ── セクターツリーマップ ── */
function gainBg(pct: number): string {
  if (pct >= 30) return "#064e3b";
  if (pct >= 20) return "#065f46";
  if (pct >= 10) return "#047857";
  if (pct >= 5)  return "#059669";
  if (pct >= 2)  return "#10b981";
  if (pct >= 0)  return "#34d399";
  if (pct >= -2) return "#f87171";
  if (pct >= -5) return "#ef4444";
  if (pct >= -10) return "#dc2626";
  if (pct >= -20) return "#b91c1c";
  return "#7f1d1d";
}

function SectorTreemap({ holdings }: { holdings: PortfolioEval[] }) {
  const sectorMap = new Map<string, PortfolioEval[]>();
  for (const h of holdings) {
    const s = h.sector ?? "その他";
    if (!sectorMap.has(s)) sectorMap.set(s, []);
    sectorMap.get(s)!.push(h);
  }
  const sectors = Array.from(sectorMap.entries())
    .map(([sector, items]) => ({
      sector,
      items: [...items].sort((a, b) => b.weight - a.weight),
      sw: items.reduce((s, h) => s + h.weight, 0),
    }))
    .sort((a, b) => b.sw - a.sw);

  return (
    <div className="chart-anim">
      <div style={{ display: "flex", gap: 3, height: 280, overflow: "hidden" }}>
        {sectors.map(({ sector, items, sw }) => (
          <div key={sector} style={{ flex: sw, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
            <div style={{ fontSize: "0.58rem", fontWeight: 700, color: "#64748b", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 2px 2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {sector}
            </div>
            {items.map(h => (
              <div
                key={h.ticker}
                title={`${h.ticker}  構成比 ${h.weight.toFixed(1)}%  損益 ${h.gain_pct >= 0 ? "+" : ""}${h.gain_pct.toFixed(1)}%`}
                style={{ flex: h.weight, background: gainBg(h.gain_pct), borderRadius: 4, padding: "3px 5px", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 22, cursor: "default" }}
              >
                <div style={{ fontWeight: 700, fontSize: "0.72rem", color: "#fff", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {h.ticker}
                </div>
                {h.weight >= 2.5 && (
                  <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.82)", lineHeight: 1.2 }}>
                    {h.weight.toFixed(1)}%
                  </div>
                )}
                {h.weight >= 5 && (
                  <div style={{ fontSize: "0.6rem", color: "rgba(255,255,255,0.92)", fontWeight: 600, lineHeight: 1.2 }}>
                    {h.gain_pct >= 0 ? "+" : ""}{h.gain_pct.toFixed(1)}%
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {/* カラースケール凡例 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>含損益：</span>
        {[
          { label: "+20%〜", bg: "#065f46" }, { label: "+10%〜", bg: "#059669" },
          { label: "+2%〜", bg: "#10b981" },  { label: "0〜+2%", bg: "#34d399" },
          { label: "0〜-2%", bg: "#f87171" }, { label: "-10%〜", bg: "#dc2626" },
          { label: "-20%〜", bg: "#7f1d1d" },
        ].map(({ label, bg }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: bg }} />
            <span style={{ fontSize: "0.6rem", color: "#64748b" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── メインコンポーネント ── */
export default function AssetsPage() {
  const [history, setHistory] = useState<AssetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const [period, setPeriod] = useState<Period>("all");
  const [isMobile, setIsMobile] = useState(false);
  const [soloKey, setSoloKey] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<PortfolioEval[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  useEffect(() => {
    fetch("/api/assets")
      .then(r => r.json())
      .then((d: { history: AssetSnapshot[]; btc_price_jpy: number }) => {
        setHistory(d.history ?? []);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        requestAnimationFrame(() => setEntered(true));
      });
  }, []);

  useEffect(() => {
    fetch("/api/holdings")
      .then(r => r.json())
      .then((d: { holdings: PortfolioEval[] }) => setHoldings(d.holdings ?? []))
      .catch(() => {});
  }, []);

  const latest  = history[history.length - 1];
  const prev    = history[history.length - 2];
  const diffJpy = latest && prev ? latest.total_jpy - prev.total_jpy : 0;

  // ② 合計カウントアップ
  const totalRaw = useCountUpRaw(latest ? latest.total_jpy : 0);
  const totalWan = Math.round(totalRaw / 10000);

  const breakdown = latest
    ? BREAKDOWN.map(b => ({ ...b, value: +(latest[b.key as keyof AssetSnapshot] as number) })).filter(e => e.value > 0)
    : [];

  const filteredHistory = filterByPeriod(history, period);
  const donutUrl  = latest ? buildDonutUrl(latest, isMobile) : "";
  const stackedUrl = buildStackedUrl(filteredHistory, isMobile, soloKey);

  return (
    <>
      <style>{`
        .chart-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
        @media (min-width: 640px) { .chart-grid { grid-template-columns: 3fr 2fr; } }
      `}</style>

      <div className="min-h-screen bg-slate-100 pb-32 sm:pb-0">

        {/* Nav */}
        <div className="hidden sm:block sticky top-0 z-10">
        <nav className="bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="StockNote" className="h-10 w-auto"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
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
        </div>

        <div className="max-w-5xl mx-auto px-4 py-6">

          {loading && <div className="text-slate-400 text-center py-24 text-sm sn-pulse">読み込み中…</div>}

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

              {/* ── ① Hero ── */}
              {latest && (
                <div style={{
                  background: "linear-gradient(135deg, #0f172a 0%, #1a2744 50%, #1e293b 100%)",
                  borderRadius: 10,
                  padding: "24px 28px",
                  boxShadow: "0 12px 40px rgba(15,23,42,0.2)",
                }}>
                  <div className="mb-5">
                    {/* ③ グレー文字を #94a3b8 に変更 */}
                    <div className="sn-label mb-2" style={{ color: "#94a3b8" }}>
                      Total Assets — {latest.date}
                    </div>
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

                  {/* ② 内訳グリッド - 各数値もカウントアップ */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                    {breakdown.map(({ key, label, value, color }) => (
                      <div key={key} style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.07)",
                        borderRadius: 6,
                        padding: "10px 12px",
                      }}>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          {/* ③ ラベルも #94a3b8 */}
                          <span style={{ color: "#94a3b8", fontSize: "0.72rem" }}>{label}</span>
                        </div>
                        <div className="num font-bold" style={{ color: "#f1f5f9", fontSize: "1.05rem" }}>
                          <WanCount jpy={value} />万
                        </div>
                        <div className="num mt-0.5" style={{ color: "#64748b", fontSize: "0.72rem" }}>
                          {((value / latest.total_jpy) * 100).toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ⑦ 2カラム: 推移(左60%) + 資産配分(右40%) */}
              {latest && (stackedUrl || donutUrl) && (
                <div className="chart-grid">
                  {/* 左: ⑥ 積み上げグラフ + 期間フィルター + カスタム凡例 */}
                  {stackedUrl && (
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                      {/* タイトル + 期間ボタン */}
                      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                        <div className="sn-label">総資産推移</div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {PERIODS.map(p => (
                            <button
                              key={p.key}
                              onClick={() => setPeriod(p.key)}
                              className="text-xs rounded font-medium transition-colors"
                              style={{
                                padding: "3px 9px",
                                background: period === p.key ? "#008b8b" : "#f1f5f9",
                                color:      period === p.key ? "#ffffff"  : "#64748b",
                                border: "none",
                                cursor: "pointer",
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ③ カスタム凡例（タップで絞り込み / 再タップで全表示） */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {BREAKDOWN.map(b => {
                          const isActive = soloKey === null || soloKey === b.key;
                          return (
                            <button
                              key={b.key}
                              onClick={() => setSoloKey(soloKey === b.key ? null : b.key)}
                              className="flex items-center gap-1.5 text-xs font-medium rounded-full transition-all"
                              style={{
                                padding: "3px 10px",
                                background: isActive ? b.color + "1a" : "#f1f5f9",
                                border: `1.5px solid ${isActive ? b.color : "#e2e8f0"}`,
                                color: isActive ? b.color : "#94a3b8",
                                cursor: "pointer",
                                opacity: isActive ? 1 : 0.55,
                              }}
                            >
                              <span style={{
                                width: 8, height: 8, borderRadius: 2,
                                background: isActive ? b.color : "#cbd5e1",
                                display: "inline-block", flexShrink: 0,
                              }} />
                              {b.label}
                            </button>
                          );
                        })}
                        {soloKey !== null && (
                          <button
                            onClick={() => setSoloKey(null)}
                            style={{ background: "none", border: "none", cursor: "pointer" }}
                            className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-1"
                          >
                            全て表示
                          </button>
                        )}
                      </div>

                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={stackedUrl} alt="総資産推移" className="w-full rounded block chart-anim" loading="lazy" />
                    </div>
                  )}
                  {/* 右: ① 資産配分ドーナツ */}
                  {donutUrl && (
                    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                      <div className="sn-label mb-3">資産配分</div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={donutUrl} alt="資産配分" className="w-full rounded block chart-anim" loading="lazy" />
                    </div>
                  )}
                </div>
              )}

              {/* セクター別ポートフォリオ ツリーマップ */}
              {holdings.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="sn-label">セクター別ポートフォリオ</div>
                    <div style={{ fontSize: "0.65rem", color: "#94a3b8" }}>色：含損益（コストベース）</div>
                  </div>
                  <SectorTreemap holdings={holdings} />
                </div>
              )}

              {/* 履歴テーブル */}
              {history.length > 0 && (
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 pt-4 pb-2">
                    <div className="sn-label">履歴</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 580 }}>
                      <thead>
                        <tr style={{ borderTop: "1px solid #f1f5f9", background: "#f8fafc" }}>
                          {["日付", "総資産", ...BREAKDOWN.map(b => b.label)].map(h => (
                            <th key={h} className="sn-label text-left px-4 py-2.5 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...history].reverse().map((snap, i) => (
                          <tr
                            key={snap.date}
                            className="transition-colors"
                            style={{ borderTop: "1px solid #f1f5f9", background: i === 0 ? "rgba(0,139,139,0.03)" : undefined }}
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
        <MobileNav active="/assets" />
      </div>
    </>
  );
}
