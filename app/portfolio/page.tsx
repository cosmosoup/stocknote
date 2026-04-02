"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { PortfolioItem } from "@/types";

const EMPTY_FORM: Partial<PortfolioItem> = {
  ticker: "", shares: 0, cost_price: 0, cost_rate: null, hypothesis: "",
};

export default function PortfolioPage() {
  const router = useRouter();

  const [macroStrategy, setMacroStrategy] = useState("");
  const [macroSaving, setMacroSaving] = useState(false);
  const [macroSaved, setMacroSaved] = useState(false);

  const [cashJpy, setCashJpy] = useState<number>(0);
  const [cashSaving, setCashSaving] = useState(false);
  const [cashSaved, setCashSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json())
      .then((d: { macro_strategy?: string; cash_jpy?: number }) => {
        setMacroStrategy(d.macro_strategy ?? "");
        setCashJpy(d.cash_jpy ?? 0);
      })
      .catch(() => {});
  }, []);

  const handleMacroSave = async () => {
    setMacroSaving(true);
    setMacroSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macro_strategy: macroStrategy }),
      });
      setMacroSaved(true);
      setTimeout(() => setMacroSaved(false), 2000);
    } finally { setMacroSaving(false); }
  };

  const handleCashSave = async () => {
    setCashSaving(true);
    setCashSaved(false);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cash_jpy: cashJpy }),
      });
      setCashSaved(true);
      setTimeout(() => setCashSaved(false), 2000);
    } finally { setCashSaving(false); }
  };

  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<PortfolioItem>>(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    const res = await fetch("/api/portfolio");
    setItems(await res.json() as PortfolioItem[]);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchPortfolio(); }, [fetchPortfolio]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const method = editId ? "PUT" : "POST";
      const body = editId ? { ...form, id: editId } : form;
      const res = await fetch("/api/portfolio", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error");
      setForm(EMPTY_FORM);
      setEditId(null);
      await fetchPortfolio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally { setSaving(false); }
  };

  const handleEdit = (item: PortfolioItem) => {
    setEditId(item.id ?? null);
    setForm({ ticker: item.ticker, shares: item.shares, cost_price: item.cost_price, cost_rate: item.cost_rate, hypothesis: item.hypothesis ?? "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: number) => {
    if (!confirm(`ID:${id} を削除しますか？`)) return;
    await fetch(`/api/portfolio?id=${id}`, { method: "DELETE" });
    await fetchPortfolio();
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const isJp = (ticker: string) => /^\d{4}$/.test(ticker);

  return (
    <div className="min-h-screen bg-slate-100">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/" className="text-slate-500 hover:text-slate-900 text-sm">← 最新レポート</a>
            <span className="text-slate-900 font-semibold">📋 銘柄管理</span>
          </div>
          <button onClick={() => void handleLogout()} className="text-slate-400 hover:text-slate-600 text-xs transition-colors">
            ログアウト
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* マクロ投資戦略 */}
        <div className="bg-white rounded-xl p-5 border border-[#b2e0e0] shadow-sm">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-[#008b8b] font-semibold text-sm uppercase tracking-wider">
                🌍 マクロ投資戦略
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                AIレポート全体の分析軸。局面変化に合わせて随時更新してください。
              </p>
            </div>
            <button
              onClick={() => void handleMacroSave()}
              disabled={macroSaving}
              className="px-4 py-1.5 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              {macroSaving ? "保存中…" : macroSaved ? "✓ 保存済" : "保存"}
            </button>
          </div>
          <textarea
            value={macroStrategy}
            onChange={(e) => setMacroStrategy(e.target.value)}
            rows={6}
            placeholder={`例：\n【投資スタンス】\n1. Global Macro: 米国株(S&P500)は割高アンダーウェイト。割安な新興国（インド・南米）をオーバーウェイト。\n2. 日本株: 円キャリートレード巻き戻しリスクを警戒。ポジション最小限。`}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-slate-800 text-sm focus:outline-none focus:border-[#008b8b] resize-y placeholder:text-slate-400 leading-relaxed"
          />
        </div>

        {/* キャッシュ残高 */}
        <div className="bg-white rounded-xl p-5 border border-[#b2e0e0] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-[#008b8b] font-semibold text-sm uppercase tracking-wider">
                💴 キャッシュ残高
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                円建てキャッシュ残高。構成比チャートとAI分析に反映されます。
              </p>
            </div>
            <button
              onClick={() => void handleCashSave()}
              disabled={cashSaving}
              className="px-4 py-1.5 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 text-white text-sm rounded-lg font-medium transition-colors whitespace-nowrap"
            >
              {cashSaving ? "保存中…" : cashSaved ? "✓ 保存済" : "保存"}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={cashJpy}
              onChange={(e) => setCashJpy(Math.max(0, parseInt(e.target.value) || 0))}
              step="10000"
              min="0"
              placeholder="0"
              className="w-52 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-slate-800 text-sm focus:outline-none focus:border-[#008b8b] font-mono"
            />
            <span className="text-slate-500 text-sm">円</span>
            {cashJpy > 0 && (
              <span className="text-slate-400 text-xs">
                ({(cashJpy / 10000).toFixed(1)}万円)
              </span>
            )}
          </div>
        </div>

        {/* 銘柄追加/編集 */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
          <h2 className="text-slate-600 font-semibold mb-4 text-sm uppercase tracking-wider">
            {editId ? `銘柄を編集 (ID: ${editId})` : "銘柄を追加"}
          </h2>
          {error && (
            <div className="mb-3 text-red-600 text-sm bg-red-50 rounded px-3 py-2 border border-red-200">{error}</div>
          )}
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "ティッカー *", type: "text", key: "ticker", placeholder: "VT / 6758" },
              ].map(() => (
                <div key="ticker">
                  <label className="text-slate-400 text-xs block mb-1">ティッカー *</label>
                  <input
                    type="text"
                    value={form.ticker ?? ""}
                    onChange={(e) => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
                    placeholder="VT / 6758"
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-[#008b8b]"
                  />
                </div>
              ))}
              <div>
                <label className="text-slate-400 text-xs block mb-1">口数/株数 *</label>
                <input
                  type="number"
                  value={form.shares ?? ""}
                  onChange={(e) => setForm({ ...form, shares: parseFloat(e.target.value) })}
                  step="any" required
                  className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-[#008b8b]"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">
                  取得単価 ({form.ticker && isJp(form.ticker) ? "JPY" : "USD"}) *
                </label>
                <input
                  type="number"
                  value={form.cost_price ?? ""}
                  onChange={(e) => setForm({ ...form, cost_price: parseFloat(e.target.value) })}
                  step="any" required
                  className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-[#008b8b]"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">取得時レート (US株のみ)</label>
                <input
                  type="number"
                  value={form.cost_rate ?? ""}
                  onChange={(e) => setForm({ ...form, cost_rate: e.target.value ? parseFloat(e.target.value) : null })}
                  step="any" placeholder="150.00"
                  disabled={!!(form.ticker && isJp(form.ticker))}
                  className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-[#008b8b] disabled:opacity-40"
                />
              </div>
            </div>
            <div>
              <label className="text-slate-400 text-xs block mb-1">
                銘柄別メモ
                <span className="ml-2 text-slate-300">（この銘柄に期待している理由など）</span>
              </label>
              <textarea
                value={form.hypothesis ?? ""}
                onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
                placeholder="例: グローバル分散コアETF、AI半導体の構造的成長..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded px-3 py-2 text-slate-800 text-sm focus:outline-none focus:border-[#008b8b] resize-none placeholder:text-slate-400"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={saving}
                className="px-4 py-2 bg-[#008b8b] hover:bg-[#006d6d] disabled:bg-slate-200 text-white text-sm rounded-lg font-medium transition-colors">
                {saving ? "保存中…" : editId ? "更新" : "追加"}
              </button>
              {editId && (
                <button type="button" onClick={() => { setEditId(null); setForm(EMPTY_FORM); }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm rounded-lg transition-colors">
                  キャンセル
                </button>
              )}
            </div>
          </form>
        </div>

        {/* 銘柄テーブル / カード */}
        {loading ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-center py-8 text-sm">読み込み中...</div>
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="text-slate-400 text-center py-8 text-sm">銘柄が登録されていません。</div>
          </div>
        ) : (
          <>
            {/* PC: テーブル */}
            <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-x-auto shadow-sm">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["ID", "ティッカー", "口数", "取得単価", "取得レート", "銘柄別メモ", ""].map((h) => (
                      <th key={h} className="text-left text-slate-400 font-medium px-4 py-3 text-xs uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs">{item.id}</td>
                      <td className="px-4 py-3 text-slate-900 font-semibold">{item.ticker}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono">{item.shares}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono whitespace-nowrap">
                        {item.cost_price}{isJp(item.ticker) ? " JPY" : " USD"}
                      </td>
                      <td className="px-4 py-3 text-slate-400 font-mono whitespace-nowrap">
                        {item.cost_rate ? `${item.cost_rate} JPY/USD` : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-[200px]">
                        {item.hypothesis ? (
                          <span className="text-xs" title={item.hypothesis}>
                            {item.hypothesis.length > 40 ? item.hypothesis.slice(0, 40) + "…" : item.hypothesis}
                          </span>
                        ) : <span className="text-slate-300 text-xs italic">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-3 justify-end">
                          <button onClick={() => handleEdit(item)} className="text-[#008b8b] hover:text-[#005a5a] text-xs transition-colors">編集</button>
                          <button onClick={() => void handleDelete(item.id!)} className="text-red-500 hover:text-red-700 text-xs transition-colors">削除</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* モバイル: カード */}
            <div className="sm:hidden space-y-2">
              {items.map((item) => (
                <div key={item.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-slate-900 font-bold text-base">{item.ticker}</span>
                    <div className="flex gap-4">
                      <button onClick={() => handleEdit(item)} className="text-[#008b8b] hover:text-[#005a5a] text-sm font-medium transition-colors">編集</button>
                      <button onClick={() => void handleDelete(item.id!)} className="text-red-500 hover:text-red-700 text-sm font-medium transition-colors">削除</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <div className="text-slate-400 text-xs mb-0.5">口数</div>
                      <div className="text-slate-700 font-mono text-sm">{item.shares}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs mb-0.5">取得単価</div>
                      <div className="text-slate-700 font-mono text-sm">{item.cost_price}{isJp(item.ticker) ? " JPY" : " USD"}</div>
                    </div>
                    {item.cost_rate !== null && (
                      <div>
                        <div className="text-slate-400 text-xs mb-0.5">取得レート</div>
                        <div className="text-slate-500 font-mono text-sm">{item.cost_rate} JPY/USD</div>
                      </div>
                    )}
                  </div>
                  {item.hypothesis && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="text-slate-400 text-xs mb-0.5">メモ</div>
                      <div className="text-slate-500 text-xs leading-relaxed">{item.hypothesis}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
