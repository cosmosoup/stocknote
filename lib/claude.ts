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
  const brentWtiSpread = market.brent > 0 && market.oil > 0
    ? ` / スプレッド +${(market.brent - market.oil).toFixed(2)}`
    : "";
  const marketSection = `
## 市場データ (${dateStr})
- S&P500: ${market.sp500.toFixed(0)} (${market.sp500_chg >= 0 ? "+" : ""}${market.sp500_chg.toFixed(2)}%)
- NASDAQ: ${market.nasdaq.toFixed(0)} (${market.nasdaq_chg >= 0 ? "+" : ""}${market.nasdaq_chg.toFixed(2)}%)
- VIX: ${market.vix.toFixed(2)}
- 米10年金利: ${market.tnx.toFixed(3)}%
- USD/JPY: ${market.usdjpy.toFixed(2)}
- ドル指数(DXY): ${market.dxy.toFixed(2)}
- Gold: ${market.gold.toFixed(0)} USD/oz (${market.gold_chg >= 0 ? "+" : ""}${market.gold_chg.toFixed(2)}%)
- WTI原油: ${market.oil.toFixed(2)} USD/bbl (${market.oil_chg >= 0 ? "+" : ""}${market.oil_chg.toFixed(2)}%)
- Brent原油: ${market.brent.toFixed(2)} USD/bbl (${market.brent_chg >= 0 ? "+" : ""}${market.brent_chg.toFixed(2)}%)${brentWtiSpread}
- Fear&Greed Index: ${market.fear_greed}/100`;

  // ポートフォリオ
  const pfLines = p
    .map((e) => {
      const base = `- ${e.ticker}: 現在値 ${e.is_jpy ? e.current_price.toFixed(0) + "円" : e.current_price.toFixed(2) + "USD"} / 前日比 ${e.change_pct >= 0 ? "+" : ""}${e.change_pct.toFixed(2)}% / 含損益 ${e.gain_pct >= 0 ? "+" : ""}${e.gain_pct.toFixed(1)}% (${e.gain_jpy >= 0 ? "+" : ""}${e.gain_jpy.toFixed(0)}円) / 構成比 ${e.weight.toFixed(1)}%`;
      return e.hypothesis ? `${base} | 投資仮説: ${e.hypothesis}` : base;
    })
    .join("\n");

  // キャッシュ情報
  const cashJpy = market.cash_jpy ?? 0;
  const totalIncCash = market.total_jpy * 10000 + cashJpy;
  const cashRatio = totalIncCash > 0 ? (cashJpy / totalIncCash) * 100 : 0;
  const cashSection = cashJpy > 0
    ? `\nキャッシュ: ${(cashJpy / 10000).toFixed(1)}万円（ポートフォリオ全体の${cashRatio.toFixed(1)}%）`
    : "";

  const pfSection = `
## ポートフォリオ
株式評価額: ${market.total_jpy.toFixed(0)}万円${cashSection}
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
              `[${i + 1}] [${n.source}] ${n.title}\n${n.summary.slice(0, 280)}`
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
  const systemPrompt = `あなたは長期投資を専門とするトップヘッジファンド・マネージャーです。
このポートフォリオのオーナーは中長期投資家（保有期間5年以上を基本とする）です。
デイトレードや短期売買は想定していません。

【投資哲学（必ず遵守）】
- 地政学リスク・戦争・パニック売りによる下落は、歴史的に見て中長期優良資産は必ず回復してきた（WWI・WWII・湾岸戦争・9.11・リーマン・コロナすべて回復）
- 売るべき判断基準は「株価が下がったこと」ではなく「中長期の投資仮説が根本から毀損されたか否か」
- 優良な個別株・インデックスは短期下落で売ることを推奨しない。耐えることが原則
- ただし、企業の競争優位・財務健全性・成長ストーリーが崩れた場合は見直しを勧める

【分析の質要件（必ず全項目を守ること）】

■ ニュースと市場データを必ず連結して読むこと
  - NG: ニュースを列挙するだけ、指標を羅列するだけ、両者が別々に浮いている記述
  - OK: 「[ニュースX]が示す地政学リスクは[指標Y]の動きに既に織り込まれており、その波及先として[セクターZ]が〜」のように因果の連鎖を明示する
  - 要人発言（Fed議長・財務長官・OPEC閣僚・各国首脳など）がニュースに含まれる場合、必ずその政策的含意とポートフォリオへの影響を述べること
  - 地政学イベントは「事象→コモディティ/金利/為替への影響経路→保有銘柄への波及」の順で論じること
  - 市場が「現時点で何を織り込んでいるか」と「まだ織り込んでいないリスク」を区別して記述すること

■ リスク分析は必ずポートフォリオ固有の数値で定量化し、以下のテーブル形式で出力すること
  - NG: 「VIXが高水準で不安定」「金利上昇リスクがある」という教科書的記述
  - OK: 下記テーブル形式で必ず出力する（試算値は概算でよいが根拠を添えること）

| リスク要因 | シナリオ | 試算インパクト | 根拠 |
|---|---|---|---|
| 例: VIX継続高止まり | VIX35超が2週間継続 | △XX万円 | 過去同水準の平均下落率×現評価額 |
| 例: 円高進行 | USD/JPY -10円 | △XX万円 | USD建て保有×為替感応度 |

  - 為替（USD/JPY）・DXY・Brent/WTIスプレッドなど複数指標を組み合わせて現局面を立体的に評価すること
  - テーブルの後に2〜3文で「最も警戒すべきシナリオ」を端的に述べること

■ マクロ仮説との整合性チェックは単一の明確な判定を下すこと
  - NG: 「一方では〜、他方では〜」という両論併記・留保表現
  - OK: 冒頭に【支持】【矛盾】【中立】のいずれか一語で判定し、その根拠を2〜3文で述べる。曖昧な表現は禁止
  - 現在の市場データと投資戦略・マクロ仮説（オーナー設定）を突き合わせて、「仮説は今の局面に有効か？」を判定すること

■ 今週のアクション優先度は具体的なトリガー条件付きで記述すること
  - NG: 「引き続き注視する」「動向を見守る」「モニタリングが必要」という表現は絶対に使わない
  - OK: 「[銘柄/指標]が[具体的な水準・条件]になった場合、[具体的なアクション]を検討」という形式で書く
  - キャッシュ保有比率が高い場合は、どの条件で・どの銘柄に・どの程度再投資するかの判断基準を示すこと
  - 最低2件、最大4件のアクション項目を書くこと

【出力形式】
- 最初の出力は必ず ## から始める（タイトル行・日時行を先頭に出さない）
- 必ず絵文字見出しを使用する（例: ## 📈 市場概況）
- 市場概況テーブルとポートフォリオテーブルを必ず含める
- 各セクションの末尾に【まとめ】を入れる
- 「## 📊 ポートフォリオ・リスク分析」セクションを必ず含める
- 投資仮説は✅（強気継続）⚠️（要注意・監視強化）❌（仮説毀損・見直し推奨）で判定し、判定理由を1〜2文で明記すること
- 金額にはドル記号($)を使わない（USDと表記）
- 日本語で出力する
- 【出力長の厳守】レポート全体を必ず2500トークン（目安：日本語4000文字）以内に収めること。冗長な前置き・繰り返し・常套句は省き、具体的な数値と鋭い洞察のみで構成すること。最後のセクションを含むすべての文章を必ず完結させること。文章の途中で終わることは絶対に禁止。`;

  const userContent = buildPrompt(market, news, history, macroStrategy);

  const message = await getClient().messages.create({
    model: "claude-sonnet-4-6",
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
