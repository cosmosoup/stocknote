"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface MonthlyItem {
  id: number;
  created_at: string;
  month: string;
  total_pct: number;
  total_jpy: number;
  monthly_pct: number;
}

function pctColor(n: number) {
  if (n > 0) return "text-[#008b8b]";
  if (n < 0) return "text-red-600";
  return "text-slate-400";
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function monthLabel(month: string) {
  // "2026-02" → "2026年2月"
  try {
    return new Date(month + "-01").toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      timeZone: "Asia/Tokyo",
    });
  } catch {
    return month;
  }
}

export default function MonthlyPage() {
  const [list, setList] = useState<MonthlyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/monthly/list")
      .then((r) => r.json())
      .then((data) => {
        setList(data as MonthlyItem[]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/monthly", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string; month?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      // 再取得
      const r2 = await fetch("/api/monthly/list");
      const newList = await r2.json() as MonthlyItem[];
      setList(newList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  };

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
            <span className="text-slate-800 font-semibold text-sm">月次レポート</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="px-3 py-1.5 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs rounded-lg font-medium transition-colors"
            >
              {generating ? "生成中…" : "今月を生成"}
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

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            ❌ {error}
          </div>
        )}

        {/* 生成中 */}
        {generating && (
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm text-center text-slate-500 text-sm animate-pulse">
            🤖 Claude AIが月次レポートを分析中（30〜60秒程度かかります）...
          </div>
        )}

        {loading ? (
          <div className="text-slate-400 text-center py-20 text-sm">読み込み中...</div>
        ) : list.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <p className="text-slate-500 text-sm">月次レポートがありません。</p>
            <p className="text-slate-400 text-xs">「今月を生成」ボタンで最初の月次レポートを作成できます。</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-1">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">
                月次レポート一覧
              </span>
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-slate-400 text-xs">{list.length}件</span>
            </div>

            <div className="bg-white rounded-xl overflow-hidden border border-slate-200 shadow-sm divide-y divide-slate-100">
              {list.map((item) => (
                <a
                  key={item.id}
                  href={`/monthly/${item.id}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
                >
                  {/* 左: 月ラベル */}
                  <div className="min-w-0">
                    <div className="text-slate-800 font-semibold text-sm">
                      📅 {monthLabel(item.month)}
                    </div>
                    <div className="text-slate-400 text-xs mt-0.5">
                      生成: {new Date(item.created_at).toLocaleDateString("ja-JP", {
                        timeZone: "Asia/Tokyo", month: "numeric", day: "numeric",
                      })}
                    </div>
                  </div>

                  {/* 右: 数値 + シェブロン */}
                  <div className="flex items-center gap-5 shrink-0 ml-4">
                    <div className="text-right">
                      <div className="text-slate-400 text-xs mb-0.5">月次騰落</div>
                      <div className={`font-mono font-semibold text-sm tabular-nums ${pctColor(item.monthly_pct)}`}>
                        {fmtPct(item.monthly_pct)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-xs mb-0.5">評価額（月末）</div>
                      <div className="font-mono text-slate-700 font-semibold text-sm tabular-nums">
                        {item.total_jpy.toFixed(0)}万円
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-400 text-xs mb-0.5">通算</div>
                      <div className={`font-mono font-semibold text-sm tabular-nums ${pctColor(item.total_pct)}`}>
                        {fmtPct(item.total_pct)}
                      </div>
                    </div>
                    <span className="text-slate-300 text-xl leading-none group-hover:text-[#008b8b] transition-colors">
                      ›
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
