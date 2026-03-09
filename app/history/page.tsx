"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface HistoryItem {
  id: number;
  created_at: string;
  daily_pct: number;
  total_pct: number;
  total_jpy: number;
}

interface MonthlyItem {
  id: number;
  month: string; // "2026-02"
}

function buildTrendChartUrl(history: HistoryItem[]): string {
  const sorted = [...history].reverse().slice(-60);
  const labels = sorted.map((h) =>
    new Date(h.created_at).toLocaleDateString("ja-JP", {
      month: "2-digit", day: "2-digit", timeZone: "Asia/Tokyo",
    })
  );
  const values = sorted.map((h) => Math.round(h.total_jpy));
  const config = {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: "#008b8b",
        backgroundColor: "rgba(0,139,139,0.06)",
        fill: true, tension: 0.35, pointRadius: 2,
        pointBackgroundColor: "#008b8b", borderWidth: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#e2e8f0" } },
        y: { ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#e2e8f0" } },
      },
    },
  };
  return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(config))}&w=900&h=160&bkg=%23ffffff&v=3`;
}

function pctColor(n: number) {
  if (n > 0) return "text-[#008b8b]";
  if (n < 0) return "text-red-600";
  return "text-slate-400";
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

// 月ごとにグループ化 — monthKey (YYYY-MM) も一緒に返す
function groupByMonth(items: HistoryItem[]): {
  label: string;
  monthKey: string;
  items: HistoryItem[];
}[] {
  const map = new Map<string, { label: string; monthKey: string; items: HistoryItem[] }>();
  for (const item of items) {
    const d = new Date(item.created_at);
    const monthKey = d.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }).slice(0, 7); // "YYYY-MM"
    const label = d.toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "long",
    });
    if (!map.has(monthKey)) map.set(monthKey, { label, monthKey, items: [] });
    map.get(monthKey)!.items.push(item);
  }
  return Array.from(map.values());
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [monthlyMap, setMonthlyMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    Promise.all([
      fetch("/api/history").then((r) => r.json()),
      fetch("/api/monthly/list").then((r) => r.json()),
    ]).then(([hist, monthly]) => {
      setHistory(hist as HistoryItem[]);
      // month → id のマップを作成
      const map = new Map<string, number>();
      for (const m of (monthly as MonthlyItem[])) {
        map.set(m.month, m.id);
      }
      setMonthlyMap(map);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const trendUrl = history.length >= 2 ? buildTrendChartUrl(history) : null;
  const groups = groupByMonth(history);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── ナビ ── */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-slate-500 hover:text-slate-900 text-sm transition-colors">
              ‹ 最新レポート
            </a>
            <span className="text-slate-300">|</span>
            <span className="text-slate-800 font-semibold text-sm">日次履歴</span>
            <span className="text-slate-300">|</span>
            <a href="/monthly" className="text-slate-500 hover:text-slate-900 text-sm transition-colors">
              月次サマリー
            </a>
          </div>
          <button
            onClick={() => void handleLogout()}
            className="text-slate-400 hover:text-slate-600 text-xs transition-colors"
          >
            ログアウト
          </button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {loading ? (
          <div className="text-slate-400 text-center py-20 text-sm">読み込み中...</div>
        ) : history.length === 0 ? (
          <div className="text-slate-400 text-center py-20 text-sm">
            履歴がありません。トップページでレポートを生成してください。
          </div>
        ) : (
          <>
            {/* 評価額トレンドチャート */}
            {trendUrl && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-slate-400 text-xs uppercase tracking-wider font-medium mb-3">
                  評価額推移（万円）
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={trendUrl} alt="評価額推移" className="w-full rounded-lg" />
              </div>
            )}

            {/* 月別グループリスト */}
            {groups.map((group) => {
              const monthlyId = monthlyMap.get(group.monthKey);
              return (
                <div key={group.monthKey}>
                  {/* 月ラベル + 月次サマリーリンク */}
                  <div className="flex items-center gap-3 mb-2 px-1">
                    <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-slate-400 text-xs">{group.items.length}件</span>
                    {monthlyId ? (
                      <a
                        href={`/monthly/${monthlyId}`}
                        className="flex items-center gap-1 text-[0.7rem] font-medium text-[#008b8b] hover:text-[#006d6d] bg-[#e6f7f7] hover:bg-[#cceeee] px-2.5 py-0.5 rounded-full transition-colors"
                      >
                        📅 月次サマリー ›
                      </a>
                    ) : (
                      <span className="text-[0.7rem] text-slate-300 px-2">月次未生成</span>
                    )}
                  </div>

                  {/* エントリーカード */}
                  <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm divide-y divide-slate-100">
                    {group.items.map((item) => {
                      const d = new Date(item.created_at);
                      const dateStr = d.toLocaleDateString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        month: "long", day: "numeric", weekday: "short",
                      });
                      const timeStr = d.toLocaleTimeString("ja-JP", {
                        timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit",
                      });
                      return (
                        <a
                          key={item.id}
                          href={`/history/${item.id}`}
                          className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
                        >
                          {/* 左: 日付 */}
                          <div className="min-w-0">
                            <div className="text-slate-800 font-medium text-sm">{dateStr}</div>
                            <div className="text-slate-400 text-xs mt-0.5">{timeStr} JST</div>
                          </div>

                          {/* 右: 数値 + シェブロン */}
                          <div className="flex items-center gap-5 shrink-0 ml-4">
                            <div className="text-right">
                              <div className="text-slate-400 text-xs mb-0.5">本日比</div>
                              <div className={`font-mono font-semibold text-sm tabular-nums ${pctColor(item.daily_pct)}`}>
                                {fmtPct(item.daily_pct)}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-slate-400 text-xs mb-0.5">評価額</div>
                              <div className="font-mono text-slate-700 font-semibold text-sm tabular-nums">
                                {item.total_jpy.toFixed(0)}万円
                              </div>
                            </div>
                            <span className="text-slate-300 text-xl leading-none group-hover:text-[#008b8b] transition-colors">
                              ›
                            </span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
