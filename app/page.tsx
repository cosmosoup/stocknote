"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

interface ReportSummary {
  id: number;
  created_at: string;
  daily_pct: number;
  total_pct: number;
  total_jpy: number;
}

const GEN_STEPS = [
  { icon: "📡", label: "市場データを取得中..." },
  { icon: "📰", label: "ニュース・為替を取得中..." },
  { icon: "🤖", label: "Claude AIがポートフォリオを分析中..." },
  { icon: "📄", label: "レポートを組み立て中..." },
];
const STEP_TIMINGS = [0, 6000, 14000, 72000];

export default function HomePage() {
  const [reportHtml, setReportHtml] = useState<string | null>(null);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const fetchLatestReport = useCallback(async () => {
    try {
      const res = await fetch("/api/latest");
      if (!res.ok) return;
      const data = await res.json() as { report_html: string; summary: ReportSummary };
      setReportHtml(data.report_html);
      setSummary(data.summary);
    } catch { /* 初回は空でOK */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchLatestReport(); }, [fetchLatestReport]);

  useEffect(() => {
    if (generating) {
      setStep(0);
      setProgress(0);
      timersRef.current = STEP_TIMINGS.slice(1).map((t, i) =>
        setTimeout(() => setStep(i + 1), t)
      );
      intervalRef.current = setInterval(() => {
        setProgress((p) => Math.min(p + 1.05, 95));
      }, 1000);
    } else {
      timersRef.current.forEach(clearTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progress > 0) {
        setProgress(100);
        setTimeout(() => { setProgress(0); setStep(0); }, 600);
      }
    }
    return () => {
      timersRef.current.forEach(clearTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/report", { method: "POST" });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed");
      await fetchLatestReport();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ナビゲーション */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="StockNote"
              className="h-11 w-auto"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            <a href="/history" className="text-slate-500 hover:text-slate-900 text-xs sm:text-sm transition-colors">
              <span className="sm:hidden">一覧</span>
              <span className="hidden sm:inline">レポート一覧</span>
            </a>
            <a href="/portfolio" className="text-slate-500 hover:text-slate-900 text-xs sm:text-sm transition-colors">
              <span className="sm:hidden">銘柄</span>
              <span className="hidden sm:inline">銘柄管理</span>
            </a>
            <button
              onClick={() => void handleGenerate()}
              disabled={generating}
              className="px-2.5 py-1.5 sm:px-4 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs sm:text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              {generating ? "生成中…" : (
                <>
                  <span className="sm:hidden">生成</span>
                  <span className="hidden sm:inline">今すぐ生成</span>
                </>
              )}
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

      {/* エラー */}
      {error && (
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            ❌ {error}
          </div>
        </div>
      )}

      {/* 生成中UI */}
      {generating && (
        <div className="max-w-5xl mx-auto px-4 pt-5">
          <div className="bg-white border border-slate-200 rounded-xl px-6 py-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-700 text-sm font-medium">レポートを生成中</span>
              <span className="text-slate-400 text-xs">{Math.round(progress)}%</span>
            </div>
            <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-[#008b8b] rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="space-y-2">
              {GEN_STEPS.map((s, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${
                    i < step ? "text-slate-400" : i === step ? "text-slate-800" : "text-slate-300"
                  }`}
                >
                  <span className={`text-base ${i === step ? "animate-pulse" : ""}`}>
                    {i < step ? "✓" : s.icon}
                  </span>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ローディング */}
      {loading && (
        <div className="flex items-center justify-center min-h-96 text-slate-400">
          読み込み中...
        </div>
      )}

      {/* レポートなし */}
      {!loading && !reportHtml && !generating && (
        <div className="flex flex-col items-center justify-center min-h-96 gap-4">
          <p className="text-slate-500 text-lg">まだレポートがありません</p>
          <button
            onClick={() => void handleGenerate()}
            className="px-6 py-2 bg-[#008b8b] hover:bg-[#006d6d] text-white rounded-lg font-medium transition-colors"
          >
            最初のレポートを生成する
          </button>
        </div>
      )}

      {/* レポート表示 */}
      {reportHtml && !loading && (
        <div className="w-full">
          {summary && (
            <div className="max-w-5xl mx-auto px-4 pt-3 pb-1 text-xs text-slate-400">
              最終生成:{" "}
              {new Date(summary.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
            </div>
          )}
          <ReportIframe html={reportHtml} />
        </div>
      )}
    </div>
  );
}

function ReportIframe({ html }: { html: string }) {
  const [height, setHeight] = useState(800);
  return (
    <iframe
      srcDoc={html}
      sandbox="allow-same-origin"
      style={{ width: "100%", height, border: "none" }}
      onLoad={(e) => {
        const body = e.currentTarget.contentDocument?.body;
        if (body) setHeight(body.scrollHeight + 20);
      }}
      title="StockNote Report"
    />
  );
}
