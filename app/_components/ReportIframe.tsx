"use client";

import { useState } from "react";

// チャート画像フェードインアニメーション（旧レポートにも動的注入）
// 画像ロード完了時に発火させることでタイミングを合わせる
const CHART_ANIM_KEYFRAMES = `
@keyframes chart-enter { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
`;
const CHART_ANIM_SCRIPT = `
(function(){
  var imgs = document.querySelectorAll('.chart-img');
  imgs.forEach(function(img,i){
    img.style.opacity='0';
    var delay=(i*0.12)+'s';
    function go(){ img.style.animation='chart-enter 0.7s cubic-bezier(0.22,1,0.36,1) '+delay+' both'; }
    if(img.complete&&img.naturalHeight>0){ go(); }
    else { img.addEventListener('load',go); }
  });
})();
`;

// テーブル横スクロール用スタイル（旧レポートにも動的注入）
const TABLE_FIX_CSS = `
.rpt-tbl-wrap {
  overflow-x: auto !important;
  -webkit-overflow-scrolling: touch;
  margin: 12px 0;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.rpt-tbl-wrap table {
  margin: 0 !important;
  border-radius: 0 !important;
  overflow: visible !important;
  border: none !important;
  min-width: 520px;
  font-size: 0.82rem;
}
.rpt-tbl-wrap table th {
  white-space: nowrap;
  background: #f8fafc;
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
}
.rpt-tbl-wrap table td {
  white-space: normal;
  color: #475569;
  border-bottom: 1px solid #f1f5f9;
}
`;

function applyChartAnim(doc: Document) {
  if (!doc.getElementById("__rpt_chart_anim")) {
    const style = doc.createElement("style");
    style.id = "__rpt_chart_anim";
    style.textContent = CHART_ANIM_KEYFRAMES;
    (doc.head ?? doc.body).appendChild(style);
  }
  if (!doc.getElementById("__rpt_chart_script")) {
    const script = doc.createElement("script");
    script.id = "__rpt_chart_script";
    script.textContent = CHART_ANIM_SCRIPT;
    doc.body.appendChild(script);
  }
}

function applyTableScroll(doc: Document) {
  // スタイルを注入（旧レポートでもCSSが確実に当たる）
  if (!doc.getElementById("__rpt_tbl_fix")) {
    const style = doc.createElement("style");
    style.id = "__rpt_tbl_fix";
    style.textContent = TABLE_FIX_CSS;
    (doc.head ?? doc.body).appendChild(style);
  }

  // .report 内のすべてのテーブルをラッパーで囲む
  doc.querySelectorAll(".report table").forEach((table) => {
    // すでにラップ済みはスキップ
    if (table.parentElement?.classList.contains("rpt-tbl-wrap")) return;
    const wrap = doc.createElement("div");
    wrap.className = "rpt-tbl-wrap";
    table.parentNode!.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}

interface Props {
  html: string;
  defaultHeight?: number;
  sandbox?: string;
}

export default function ReportIframe({
  html,
  defaultHeight = 1000,
  sandbox = "allow-same-origin allow-scripts",
}: Props) {
  const [height, setHeight] = useState(defaultHeight);

  return (
    <iframe
      srcDoc={html}
      sandbox={sandbox}
      style={{ width: "100%", height, border: "none", display: "block" }}
      onLoad={(e) => {
        const doc = e.currentTarget.contentDocument;
        if (!doc) return;
        applyChartAnim(doc);
        // テーブルスクロール適用（旧レポートにも有効）
        applyTableScroll(doc);
        // iframe高さをコンテンツに合わせる
        setHeight((doc.body?.scrollHeight ?? defaultHeight) + 40);
      }}
      title="StockNote Report"
    />
  );
}
