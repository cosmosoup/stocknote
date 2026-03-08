"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("パスワードが正しくありません");
        setPassword("");
      }
    } catch {
      setError("エラーが発生しました。再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* ロゴカード（ダーク） */}
        <div className="bg-slate-900 rounded-2xl px-8 py-10 mb-4 text-center shadow-lg">
          <h1 className="text-white font-bold text-3xl tracking-tight">StockNote</h1>
          <p className="text-slate-500 text-xs tracking-widest uppercase mt-3">
            Smart. Track. Grow.
          </p>
        </div>

        {/* ログインフォーム */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          {error && (
            <div className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2 border border-red-200 text-center mb-4">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label className="text-slate-500 text-xs font-medium block mb-1.5 tracking-wide">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
              onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(e); }}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-[#008b8b] focus:ring-1 focus:ring-[#008b8b] transition-colors"
              placeholder="••••••••"
            />
          </div>
          <button
            type="button"
            onClick={(e) => void handleSubmit(e as unknown as React.FormEvent)}
            disabled={loading || !password}
            className="w-full py-2.5 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? "確認中…" : "ログイン"}
          </button>
        </div>
      </div>
    </div>
  );
}
