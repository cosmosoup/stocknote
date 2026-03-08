/** シンプルなMarkdown→HTML変換（外部ライブラリ不使用） */
export function convertMdToHtml(md: string): string {
  let html = md;

  // コードブロック（```）
  html = html.replace(
    /```[\s\S]*?```/g,
    (m) =>
      `<pre><code>${escHtml(m.slice(3, -3).replace(/^\w+\n/, ""))}</code></pre>`
  );

  // インラインコード
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // 水平線
  html = html.replace(/^---+$/gm, "<hr>");

  // 見出し（h2, h3, h4）
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // blockquote
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // テーブル
  html = html.replace(
    /(\|.+\|\n)(\|[-:| ]+\|\n)((?:\|.+\|\n?)*)/g,
    (_, header, _sep, body) => {
      const headerCells = header
        .trim()
        .split("|")
        .filter((c: string) => c.trim())
        .map((c: string) => `<th>${c.trim()}</th>`)
        .join("");
      const bodyRows = body
        .trim()
        .split("\n")
        .filter((r: string) => r.trim())
        .map((row: string) => {
          const cells = row
            .split("|")
            .slice(1, -1)
            .map((c) => `<td>${c.trim()}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("\n");
      return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }
  );

  // リスト（順序なし）
  html = html.replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  // リスト（順序あり）
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  // 投資仮説判定バッジ
  html = html.replace(/✅/g, '<span class="verdict-ok">✅</span>');
  html = html.replace(/⚠️/g, '<span class="verdict-warn">⚠️</span>');
  html = html.replace(/❌/g, '<span class="verdict-ng">❌</span>');

  // 太字・斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // 段落（連続する空行でブロック分割）
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      // すでにブロック要素タグで始まる場合はそのまま
      if (/^<(h[1-6]|ul|ol|table|blockquote|pre|hr)/.test(block))
        return block;
      return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    })
    .join("\n");

  return html;
}

export function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
