import Anthropic from "@anthropic-ai/sdk";
import type { MarketData, NewsItem, HistoryPoint } from "@/types";

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

function buildPrompt(
  market: MarketData,
  news: NewsItem[],
  history: HistoryPoint[],
  macroStrategy: string
): string {
  const p = market.portfolio;
  const dateStr = new Date(market.generated_at).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  // 市場概況
  const marketSection = `
## 市場データ (${dateStr})
- S&P500: ${market.sp500.toFixed(0)} (${market.sp500_chg >= 0 ? "+" : ""}${market.sp500_chg.toFixed(2)}%)
- NASDAQ: ${market.nasdaq.toFixed(0)} (${market.nasdaq_chg >= 0 ? "+" : ""}${market.nasdaq_chg.toFixed(2)}%)
- VIX: ${market.vix.toFixed(2)}
- 米10年金利: ${market.tnx.toFixed(3)}%
- USD/JPY: ${market.usdjpy.toFixed(2)}
- Gold: ${market.gold.toFixed(0)} USD/oz (${market.gold_chg >= 0 ? "+" : ""}${market.gold_chg.toFixed(2)}%)
- WTI原油: ${market.oil.toFixed(2)} USD/bbl (${market.oil_chg >= 0 ? "+" : ""}${market.oil_chg.toFixed(2)}%)
- Fear&Greed Index: ${market.fear_greed}/100`;

  // ポートフォリオ
  const pfLines = p
    .map((e) => {
      const base = `- ${e.ticker}: 現在値 ${e.is_jpy ? e.current_price.toFixed(0) + "円" : e.current_price.toFixed(2) + "USD"} / 前日比 ${e.change_pct >= 0 ? "+" : ""}${e.change_pct.toFixed(2)}% / 含損益 ${e.gain_pct >= 0 ? "+" : ""}${e.gain_pct.toFixed(1)}% / 構成比 ${e.weight.toFixed(1)}%`;
      return e.hypothesis ? `${base} | 投資仮説: ${e.hypothesis}` : base;
    })
    .join("\n");

  const pfSection = `
## ポートフォリオ
評価額: ${market.total_jpy.toFixed(0)}万円
本日損益: ${market.daily_gain_jpy >= 0 ? "+" : ""}${market.daily_gain_jpy.toFixed(1)}万円 (${market.daily_pct >= 0 ? "+" : ""}${market.daily_pct.toFixed(2)}%)
通算損益: ${market.total_gain_jpy >= 0 ? "+" : ""}${market.total_gain_jpy.toFixed(1)}万円 (${market.total_pct >= 0 ? "+" : ""}${market.total_pct.toFixed(2)}%)

### 銘柄別
${pfLines}`;

  // ニュース
  const newsSection =
    news.length > 0
      ? `\n## 最新ニュース\n` +
        news
          .map(
            (n, i) =>
              `[${i + 1}] [${n.source}] ${n.title}\n${n.summary.slice(0, 150)}`
          )
          .join("\n\n")
      : "";

  // 過去ログ
  const histSection =
    history.length > 0
      ? `\n## 過去ログ（直近${history.length}日）\n` +
        history
          .map(
            (h) =>
              `${h.date}: 通算 ${h.total_pct >= 0 ? "+" : ""}${h.total_pct.toFixed(2)}% / ${h.total_jpy.toFixed(0)}万円`
          )
          .join("\n")
      : "";

  const strategySection = macroStrategy
    ? `\n## 投資戦略・マクロ仮説（オーナー設定）\n${macroStrategy}`
    : "";

  return `${strategySection}\n${marketSection}\n${pfSection}${newsSection}${histSection}`;
}

/** Claude APIを呼び出してMarkdown形式のレポートを生成 */
export async function generateReport(
  market: MarketData,
  news: NewsItem[],
  history: HistoryPoint[],
  macroStrategy = ""
): Promise<string> {
  const systemPrompt = `あなたはウォール街のトップヘッジファンド・マネージャーです。
個人投資家のポートフォリオについて、プロフェッショナルな日次レポートを生成してください。

【厳守ルール】
- 最初の出力は必ず ## から始める（タイトル行・日時行を先頭に出さない）
- 必ず絵文字見出しを使用する（例: ## 📈 市場概況）
- 市場概況テーブルとポートフォリオテーブルを必ず含める
- 各セクションの末尾に【まとめ】を入れる
- 必ず「## 📊 ポートフォリオ・リスク分析」セクションを含める（相関リスク・集中リスク・通貨リスク・ボラティリティなどを定量的に分析）
- 投資仮説は✅（強気継続）⚠️（要注意）❌（見直し推奨）で判定
- 金額にはドル記号($)を使わない（USDと表記）
- 具体的な数値を引用して分析を行う
- 日本語で出力する
- 【出力長の厳守】レポート全体を必ず2500トークン（目安：日本語4000文字）以内に収めること。冗長な前置き・繰り返し・常套句は省き、具体的な数値と鋭い洞察のみで構成すること。最後のセクションを含むすべての文章を必ず完結させること。文章の途中で終わることは絶対に禁止。`;

  const userContent = buildPrompt(market, news, history, macroStrategy);

  const message = await getClient().messages.create({
    model: "claude-opus-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
    system: systemPrompt,
  });

  const content = message.content[0];
  if (content.type !== "text") {
    throw new Error("Unexpected response type from Claude API");
  }
  return content.text;
}
