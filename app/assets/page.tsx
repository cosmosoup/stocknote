"use client";

import { useState, useEffect } from "react";
import type { AssetSnapshot } from "@/types";

const QUICKCHART = "https://quickchart.io/chart";
const COLORS = {
  stocks:     "#008b8b",
  trust:      "#3b82f6",
  btc:        "#f59e0b",
  cash:       "#10b981",
  free_cash:  "#94a3b8",
};
const COLOR_LABELS: Record<string, string> = {
  stocks: "株式", trust: "投資信託", btc: "BTC", cash: "キャッシュ", free_cash: "フリーキャッシュ",
};

function toWan(yen: number) {
  return (yen / 10000).toFixed(0);
}
function fmt(n: number, d = 1) {
  return (n / 10000).toFixed(d);
}

function buildDonutUrl(latest: AssetSnapshot): string {
  const entries = [
    { label: "株式",           value: latest.stocks_jpy,    color: COLORS.stocks },
    { label: "投資信託",       value: latest.trust_jpy,     color: COLORS.trust },
    { label: "BTC",            value: latest.btc_jpy,       color: COLORS.btc },
    { label: "キャッシュ",     value: latest.cash_jpy,      color: COLORS.cash },
    { label: "フリーキャッシュ", value: latest.free_cash_jpy, color: COLORS.free_cash },
  ].filter(e => e.value > 0);
  if (entries.length === 0) return "";
  const total = entries.reduce((s, e) => s + e.value, 0);
  const config = {
    type: "doughnut",
    data: {
      labels: entries.map(e => `${e.label} ${((e.value/total)*100).toFixed(1)}%`),
      datasets: [{
        data: entries.map(e => parseFloat(((e.value/total)*100).toFixed(1))),
        backgroundColor: entries.map(e => e.color),
        borderWidth: 3,
        borderColor: "#ffffff",
        hoverOffset: 6,
      }],
    },
    options: {
      cutout: "62%",
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#334155", font: { size: 12 }, padding: 14, boxWidth: 12, boxHeight: 12 },
        },
      },
    },
  };
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(config))}&backgroundColor=%23ffffff&width=540&height=240&v=3`;
}

function buildTrendUrl(history: AssetSnapshot[]): string {
  if (history.length < 2) return "";
  const labels = history.map(h => h.date.slice(5).replace("-", "/"));
  const makeData = (key: keyof AssetSnapshot) =>
    history.map(h => parseFloat((+(h[key] as number) / 10000).toFixed(1)));
  const config = {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "株式",           data: makeData("stocks_jpy"),    backgroundColor: COLORS.stocks,    stack: "a" },
        { label: "投資信託",       data: makeData("trust_jpy"),     backgroundColor: COLORS.trust,     stack: "a" },
        { label: "BTC",            data: makeData("btc_jpy"),       backgroundColor: COLORS.btc,       stack: "a" },
        { label: "キャッシュ",     data: makeData("cash_jpy"),      backgroundColor: COLORS.cash,      stack: "a" },
        { label: "フリーキャッシュ", data: makeData("free_cash_jpy"), backgroundColor: COLORS.free_cash, stack: "a" },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { color: "#64748b", font: { size: 10 }, boxWidth: 10, padding: 12 } },
      },
      scales: {
        x: { stacked: true, ticks: { color: "#94a3b8", font: { size: 9 }, maxTicksLimit: 15 }, grid: { display: false } },
        y: { stacked: true, ticks: { color: "#94a3b8", font: { size: 10 } }, grid: { color: "#e2e8f0" } },
      },
    },
  };
  return `${QUICKCHART}?c=${encodeURIComponent(JSON.stringify(config))}&backgroundColor=%23ffffff&width=900&height=260&v=3`;
}

export default function AssetsPage() {
  const [history, setHistory]     = useState<AssetSnapshot[]>([]);
  const [btcPrice, setBtcPrice]   = useState<number>(0);
  const [loading, setLoading]     = useState(true);
  const [visible, setVisible]     = useState(false);

  useEffect(() => {
    fetch("/api/assets").then(r => r.json())
      .then((d: { history: AssetSnapshot[]; btc_price_jpy: number }) => {
        setHistory(d.history ?? []);
        setBtcPrice(d.btc_price_jpy ?? 0);
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        setTimeout(() => setVisible(true), 50);
      });
  }, []);

  const latest = history[history.length - 1];
  const prev   = history[history.length - 2];
  const totalDiff = latest && prev ? latest.total_jpy - prev.total_jpy : 0;

  const breakdown = latest ? [
    { key: "stocks",     label: "株式",           value: latest.stocks_jpy,    color: COLORS.stocks },
    { key: "trust",      label: "投資信託",       value: latest.trust_jpy,     color: COLORS.trust },
    { key: "btc",        label: "BTC",            value: latest.btc_jpy,       color: COLORS.btc },
    { key: "cash",       label: "キャッシュ",     value: latest.cash_jpy,      color: COLORS.cash },
    { key: "free_cash",  label: "フリーキャッシュ", value: latest.free_cash_jpy, color: COLORS.free_cash },
  ].filter(e => e.value > 0) : [];

  return (
    <>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .fade-up { animation: fadeUp 0.5s ease both; }
        .fade-in { animation: fadeIn 0.4s ease both; }
        .card-hover { transition: box-shadow 0.2s ease, transform 0.2s ease; }
        .card-hover:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.10); transform: translateY(-2px); }
        .row-hover { transition: background 0.15s ease; }
        .row-hover:hover { background: #f8fafc; }
      `}</style>

      <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #f1f5f9 0%, #e8eef5 100%)" }}>

        {/* Nav */}
        <nav style={{ background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px", height: 52, display: "flex", alignItems: "center", gap: 20 }}>
            <a href="/" style={{ color: "#64748b", fontSize: "0.82rem", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
              ← 最新レポート
            </a>
            <span style={{ color: "#1e293b", fontWeight: 600, fontSize: "0.88rem" }}>📊 総資産</span>
            <div style={{ flex: 1 }} />
            <a href="/portfolio" style={{ color: "#64748b", fontSize: "0.78rem", textDecoration: "none" }}>資産管理</a>
          </div>
        </nav>

        <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 20px" }}>

          {loading ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: "#94a3b8", fontSize: "0.9rem" }}>
              読み込み中…
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ color: "#64748b", fontSize: "0.95rem", marginBottom: 8 }}>まだデータがありません</div>
              <div style={{ color: "#94a3b8", fontSize: "0.82rem" }}>
                <a href="/portfolio" style={{ color: "#008b8b" }}>資産管理</a>でその他資産を入力後、レポートを生成してください
              </div>
            </div>
          ) : (
            <div className={visible ? "fade-in" : ""} style={{ opacity: visible ? 1 : 0 }}>

              {/* ── ダークヒーロー: 総資産サマリー ── */}
              {latest && (
                <div
                  className="fade-up"
                  style={{
                    background: "linear-gradient(135deg, #0f172a 0%, #1a2744 50%, #1e293b 100%)",
                    borderRadius: 20,
                    padding: "28px 32px",
                    marginBottom: 20,
                    boxShadow: "0 20px 60px rgba(15,23,42,0.25)",
                    animationDelay: "0ms",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 8 }}>
                    <div>
                      <div style={{ color: "#94a3b8", fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
                        Total Assets — {latest.date}
                      </div>
                      <div style={{ color: "#f8fafc", fontSize: "2.6rem", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                        {toWan(latest.total_jpy)}<span style={{ fontSize: "1.1rem", fontWeight: 400, marginLeft: 4, color: "#94a3b8" }}>万円</span>
                      </div>
                      {totalDiff !== 0 && (
                        <div style={{ marginTop: 8, color: totalDiff >= 0 ? "#34d399" : "#f87171", fontSize: "0.9rem", fontWeight: 500 }}>
                          {totalDiff >= 0 ? "▲" : "▼"} {Math.abs(totalDiff / 10000).toFixed(1)}万円（前回比）
                        </div>
                      )}
                    </div>
                    {btcPrice > 0 && (
                      <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px 14px", textAlign: "right" }}>
                        <div style={{ color: "#64748b", fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>BTC/JPY</div>
                        <div style={{ color: "#f59e0b", fontWeight: 600, fontSize: "0.92rem", marginTop: 2 }}>
                          {btcPrice.toLocaleString()}円
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 内訳グリッド */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                    {breakdown.map(({ key, label, value, color }) => (
                      <div key={key} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          <span style={{ color: "#94a3b8", fontSize: "0.65rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</span>
                        </div>
                        <div style={{ color: "#f8fafc", fontWeight: 700, fontSize: "1.1rem" }}>{fmt(value)}万</div>
                        <div style={{ color: "#64748b", fontSize: "0.7rem", marginTop: 2 }}>
                          {((value / latest.total_jpy) * 100).toFixed(1)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 構成比（ドーナツ）+ 推移 2カラム or 縦積み ── */}
              {latest && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }} className="fade-up" data-delay="100">
                  {/* 構成比 ドーナツ */}
                  <div className="card-hover" style={{ background: "#fff", borderRadius: 16, padding: "20px 20px 16px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                    <div style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#008b8b", marginBottom: 14 }}>
                      Asset Allocation
                    </div>
                    {buildDonutUrl(latest) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={buildDonutUrl(latest)} alt="構成比" style={{ width: "100%", borderRadius: 8, display: "block" }} loading="lazy" />
                    ) : (
                      <div style={{ color: "#94a3b8", fontSize: "0.82rem", textAlign: "center", padding: "20px 0" }}>データなし</div>
                    )}
                  </div>

                  {/* 推移 積み上げ棒 */}
                  {history.length >= 2 && (
                    <div className="card-hover" style={{ background: "#fff", borderRadius: 16, padding: "20px 20px 16px", border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
                      <div style={{ fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#008b8b", marginBottom: 14 }}>
                        総資産推移（万円）
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={buildTrendUrl(history)} alt="総資産推移" style={{ width: "100%", borderRadius: 8, display: "block" }} loading="lazy" />
                    </div>
                  )}
                </div>
              )}

              {/* ── 履歴テーブル ── */}
              {history.length > 0 && (
                <div className="card-hover fade-up" style={{ background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", overflow: "hidden" }}>
                  <div style={{ padding: "18px 20px 0", fontSize: "0.62rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#008b8b", marginBottom: 12 }}>
                    履歴
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", minWidth: 560 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {["日付", "総資産", "株式", "投資信託", "BTC", "キャッシュ", "フリーキャッシュ"].map(h => (
                            <th key={h} style={{ textAlign: "left", color: "#94a3b8", fontWeight: 600, fontSize: "0.62rem", letterSpacing: "0.08em", textTransform: "uppercase", padding: "10px 14px", background: "#f8fafc" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...history].reverse().map((snap, i) => (
                          <tr key={snap.date} className="row-hover" style={{ borderBottom: "1px solid #f8fafc", background: i === 0 ? "#fafffe" : undefined }}>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontFamily: "monospace", fontSize: "0.8rem" }}>{snap.date}</td>
                            <td style={{ padding: "10px 14px", color: "#1e293b", fontWeight: 700, fontFamily: "monospace" }}>{toWan(snap.total_jpy)}万</td>
                            <td style={{ padding: "10px 14px", color: COLORS.stocks, fontFamily: "monospace", fontSize: "0.78rem" }}>{toWan(snap.stocks_jpy)}万</td>
                            <td style={{ padding: "10px 14px", color: COLORS.trust, fontFamily: "monospace", fontSize: "0.78rem" }}>{toWan(snap.trust_jpy)}万</td>
                            <td style={{ padding: "10px 14px", color: COLORS.btc, fontFamily: "monospace", fontSize: "0.78rem" }}>{toWan(snap.btc_jpy)}万</td>
                            <td style={{ padding: "10px 14px", color: COLORS.cash, fontFamily: "monospace", fontSize: "0.78rem" }}>{toWan(snap.cash_jpy)}万</td>
                            <td style={{ padding: "10px 14px", color: COLORS.free_cash, fontFamily: "monospace", fontSize: "0.78rem" }}>{toWan(snap.free_cash_jpy)}万</td>
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
    </>
  );
}
