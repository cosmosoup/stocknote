"use client";

import { useState, useEffect, useRef } from "react";
import type { PortfolioEval } from "@/types";

function gainBg(pct: number): string {
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

type TipState = {
  ticker: string; sector: string; weight: number; gain: number; x: number; y: number;
} | null;

export function SectorTreemap({ holdings }: { holdings: PortfolioEval[] }) {
  const [tip, setTip] = useState<TipState>(null);
  const tappedRef = useRef<string | null>(null);

  useEffect(() => {
    function close() { tappedRef.current = null; setTip(null); }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

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
      sw: items.reduce((acc, h) => acc + h.weight, 0),
    }))
    .sort((a, b) => b.sw - a.sw);

  const winW = typeof window !== "undefined" ? window.innerWidth : 800;

  return (
    <div>
      {/* ツールチップ */}
      {tip && (
        <div style={{
          position: "fixed", zIndex: 9999, pointerEvents: "none",
          background: "#1e293b", color: "#f8fafc", borderRadius: 8,
          padding: "10px 14px", fontSize: "0.78rem",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)", minWidth: 150, lineHeight: 1.6,
          left: Math.min(tip.x + 14, winW - 180),
          top: tip.y - 125 < 8 ? tip.y + 14 : tip.y - 125,
        }}>
          <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 2 }}>{tip.ticker}</div>
          <div style={{ color: "#94a3b8", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{tip.sector}</div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 3 }}>
            <span style={{ color: "#94a3b8" }}>構成比</span>
            <span style={{ fontWeight: 600 }}>{tip.weight.toFixed(1)}%</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <span style={{ color: "#94a3b8" }}>含損益</span>
            <span style={{ fontWeight: 600, color: tip.gain >= 0 ? "#10b981" : "#f87171" }}>
              {tip.gain >= 0 ? "+" : ""}{tip.gain.toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* 縦軸=セクター面積(flex:sw + min-height)、左列=ラベル固定幅、右=銘柄幅(flex:weight + min-width) */}
      {/* min-height/min-width で最小視認サイズを確保しつつ、大きいものを比例スケール */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, height: 320 }}>
        {sectors.map(({ sector, items, sw }) => (
          <div key={sector} style={{ flex: sw, minHeight: 6, display: "flex", gap: 2 }}>
            {/* セクターラベル列（固定幅・常時表示） */}
            <div style={{
              width: 68, flexShrink: 0, display: "flex", alignItems: "center",
              padding: "3px 5px", background: "#f8fafc", borderRadius: 4,
              border: "1px solid #e2e8f0", overflow: "hidden",
            }}>
              <div style={{
                fontSize: "0.56rem", fontWeight: 700, color: "#64748b",
                letterSpacing: "0.03em", textTransform: "uppercase",
                wordBreak: "break-word", lineHeight: 1.25,
              }}>
                {sector}
              </div>
            </div>
            {/* 銘柄エリア（1行ラベル：VOO 24.5%（+2.5%）） */}
            <div style={{ flex: 1, display: "flex", gap: 2, minWidth: 0 }}>
              {items.map(h => {
                const gainStr = (h.gain_pct >= 0 ? "+" : "") + h.gain_pct.toFixed(1) + "%";
                const label = h.weight >= 1.5
                  ? `${h.ticker} ${h.weight.toFixed(1)}%（${gainStr}）`
                  : h.ticker;
                return (
                  <div
                    key={h.ticker}
                    style={{
                      flex: h.weight, minWidth: 40, background: gainBg(h.gain_pct),
                      borderRadius: 4, padding: "3px 5px", overflow: "hidden",
                      display: "flex", alignItems: "center", cursor: "pointer",
                    }}
                    onMouseEnter={e => {
                      if (!tappedRef.current)
                        setTip({ ticker: h.ticker, sector, weight: h.weight, gain: h.gain_pct, x: e.clientX, y: e.clientY });
                    }}
                    onMouseMove={e => {
                      if (!tappedRef.current)
                        setTip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
                    }}
                    onMouseLeave={() => { if (tappedRef.current !== h.ticker) setTip(null); }}
                    onClick={e => {
                      e.stopPropagation();
                      if (tappedRef.current === h.ticker) {
                        tappedRef.current = null; setTip(null);
                      } else {
                        const r = e.currentTarget.getBoundingClientRect();
                        tappedRef.current = h.ticker;
                        setTip({ ticker: h.ticker, sector, weight: h.weight, gain: h.gain_pct, x: r.left + r.width / 2, y: r.top });
                      }
                    }}
                  >
                    <div style={{
                      fontWeight: 700, fontSize: "0.65rem", color: "#fff",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      pointerEvents: "none", lineHeight: 1.3,
                    }}>
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* カラースケール凡例 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.6rem", color: "#94a3b8" }}>含損益：</span>
        {[
          { label: "+20%〜", bg: "#065f46" }, { label: "+10%〜", bg: "#047857" },
          { label: "+5%〜",  bg: "#059669" }, { label: "+2%〜",  bg: "#10b981" },
          { label: "0〜+2%", bg: "#34d399" }, { label: "0〜-2%", bg: "#f87171" },
          { label: "-10%〜", bg: "#dc2626" }, { label: "-20%〜", bg: "#7f1d1d" },
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
