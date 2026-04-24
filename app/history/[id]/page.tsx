"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

interface ReportData {
  id: number;
  created_at: string;
  daily_pct: number;
  total_pct: number;
  total_jpy: number;
  report_html: string;
}

function ReportIframe({ html }: { html: string }) {
  const [height, setHeight] = useState(1200);
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-same-origin allow-scripts"
      style={{ width: "100%", height, border: "none", display: "block" }}
      onLoad={(e) => {
        const body = e.currentTarget.contentDocument?.body;
        if (body) setHeight(body.scrollHeight + 40);
      }}
      title="Historical Report"
    />
  );
}

export default function HistoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await fetch(`/api/history/${id}`);
        if (!res.ok) { setError("レポートが見つかりませんでした"); return; }
        const json = await res.json() as ReportData;
        setData(json);
      } catch {
        setError("読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };
    void fetchReport();
  }, [id]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const dateStr = data
    ? new Date(data.created_at).toLocaleDateString("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric", month: "long", day: "numeric", weekday: "short",
      })
    : null;

  function pctColor(n: number) {
    if (n > 0) return "text-[#008b8b]";
    if (n < 0) return "text-red-600";
    return "text-slate-400";
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── ナビ ── */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          {/* 左: 戻るリンク + 日付 */}
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/history"
              className="text-slate-500 hover:text-slate-800 text-sm transition-colors shrink-0"
            >
              ‹ レポート一覧
            </a>
            {dateStr && (
              <>
                <span className="text-slate-300 shrink-0">|</span>
                <span className="text-slate-700 text-sm font-medium truncate">{dateStr}</span>
              </>
            )}
          </div>

          {/* 右: 本日比 + ログアウト */}
          <div className="flex items-center gap-4 shrink-0 ml-4">
            {data && (
              <span className={`text-sm font-mono font-semibold tabular-nums ${pctColor(data.daily_pct)}`}>
                {data.daily_pct >= 0 ? "+" : ""}{data.daily_pct.toFixed(2)}%
              </span>
            )}
            <button
              onClick={() => void handleLogout()}
              className="text-slate-400 hover:text-slate-600 text-xs transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </nav>

      {/* ── コンテンツ ── */}
      {loading && (
        <div className="flex items-center justify-center min-h-96 text-slate-400 text-sm">
          読み込み中...
        </div>
      )}

      {error && (
        <div className="max-w-3xl mx-auto px-4 pt-16 text-center">
          <p className="text-slate-500 text-sm">{error}</p>
          <a href="/history" className="mt-4 inline-block text-[#008b8b] text-sm hover:underline">
            ← 履歴一覧に戻る
          </a>
        </div>
      )}

      {data && !loading && <ReportIframe html={data.report_html} />}
    </div>
  );
}
