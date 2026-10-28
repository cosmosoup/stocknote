import Anthropic from "@anthropic-ai/sdk";
import type { MarketData, NewsItem, HistoryPoint } from "@/types";
import { buildStructureContext } from "./analysis";

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
  macroStrategy: string,
  macroContext: string
): string {
  const p = market.portfolio;
  const now = new Date(market.generated_at);
  const dateStr = now.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", weekday: "short" });

  // 市場概況
  const brentWtiSpread = market.brent > 0 && market.oil > 0
    ? ` / スプレッド +${(market.brent - market.oil).toFixed(2)}`
    : "";
  const marketSection = `
## 本日の市場データ (${dateStr})【当日の値動き。ノイズを含むため判断根拠にしない】
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
      const withHypothesis = e.hypothesis ? `${base} | 投資仮説: ${e.hypothesis}` : base;
      if (e.price_stale) return `${withHypothesis} | ⚠️価格取得失敗のため含損益%は無視して分析すること`;
      if (e.split_suspected) return `${withHypothesis} | ⚠️含損益%が異常値（株式分割等でデータがずれている可能性）のためこの数値には言及せず注意喚起のみに留めること`;
      return withHypothesis;
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
## ポートフォリオ（本日時点）
株式評価額: ${market.total_jpy.toFixed(0)}万円${cashSection}
本日損益: ${market.daily_gain_jpy >= 0 ? "+" : ""}${market.daily_gain_jpy.toFixed(1)}万円 (${market.daily_pct >= 0 ? "+" : ""}${market.daily_pct.toFixed(2)}%)【当日の値動き】
通算損益: ${market.total_gain_jpy >= 0 ? "+" : ""}${market.total_gain_jpy.toFixed(1)}万円 (${market.total_pct >= 0 ? "+" : ""}${market.total_pct.toFixed(2)}%)

### 銘柄別（現在値・前日比・含損益・構成比・投資仮説）
${pfLines}`;

  // ニュース（地政学・インシデント・政策・要人発言の材料。番号で引用させる）
  const newsSection =
    news.length > 0
      ? `\n## 最新ニュース（番号で引用すること）\n` +
        news
          .map(
            (n, i) =>
              `[${i + 1}] [${n.source}] ${n.title}\n${n.summary.slice(0, 280)}`
          )
          .join("\n\n")
      : "";

  // 俯瞰・構造データ（中期トレンド・セクターローテーション・保有構造・記録ベース成績）
  const structureSection = buildStructureContext(market, history);

  const strategySection = macroStrategy
    ? `\n## 投資戦略・マクロ仮説（オーナー設定）\n${macroStrategy}`
    : "";

  return `${strategySection}\n${macroContext}\n${structureSection}\n${marketSection}\n${pfSection}${newsSection}`;
}

/** Claude APIを呼び出してMarkdown形式のレポートを生成 */
export async function generateReport(
  market: MarketData,
  news: NewsItem[],
  history: HistoryPoint[],
  macroStrategy = "",
  macroContext = ""
): Promise<string> {
  const systemPrompt = `あなたは、マクロ環境の分析を最重視するトップヘッジファンドのポートフォリオ・マネージャーです。
このポートフォリオのオーナーは中長期投資家（保有期間5年以上を基本とする）です。デイトレードや短期売買は想定していません。

【判断の重み付け（最重要・全項目に優先）】
売買・資産配分の判断は、次の順に重みを置く。
 1. 市場環境と今後の想定 … 最大の重み。金融政策と金利、インフレ、景気・雇用、流動性・信用、センチメントと需給（IPO・決算を含む）、地政学・インシデント・政策リスク、セクターへの資金の流れ
 2. ポートフォリオ全体の構造 … 集中・通貨・テーマの重複・現金比率
 3. 個別銘柄の中期トレンドと投資仮説 … 補助。個別のチャートの形は、環境認識に基づく判断の「実行タイミングの補助」としてのみ使う
- 話の起点は常に「今、市場環境はどうで、今後どうなりそうか」。保有銘柄の値動きから話を組み立てない
- 売買の結論は、まず環境認識とシナリオから導き、そのあとで「だから自分のポジションはどうするか」に落とす

【事実性の原則（必ず遵守）】
- 現在の状況（政策金利、利回り、物価、雇用、直近の発表結果、要人発言、イベントの日程）は、提供データとニュースだけが根拠。あなたの記憶で補わない。データにない事実は「データなし」とする
- 数値は提供データから引用し、項目名を添える（例:「コアPCE前年比3.0%」）
- 将来の見通しは断定せず、確率付きのシナリオで示す。確率は主観的な見立てであることを明記し、根拠となる変数と「見通しを変えるサイン」を必ず添える
- 市場が既に織り込んでいる内容と、まだ織り込んでいない内容を区別する
- 直近のイベント（FOMC、決算、経済指標）は、「結果が分かっているもの」と「これから発表されるもの」を区別する。結果が提供データにないものは、結果を推測で書かない
- 経済指標カレンダーの「Federal Funds Rate」は政策金利（目標レンジ上限など）の予想値で、実効FF金利と水準が異なる場合がある
- バリュエーション（PERなど）のデータは取得していない。ニュースに記載がある場合のみ、その出典を示して言及する

【投資哲学】
- 地政学リスクやパニック売りによる下落は、歴史的に中長期優良資産は回復してきた。「株価が下がったこと」だけを理由に売らない
- 売却・見直しの基準は、中長期の投資仮説の毀損、または市場環境の構造的な変化（金融政策の転換、信用収縮、金利と株価水準の乖離など）
- 長期保有が基本だが、エクスポージャーの増減（現金の投入・待機、リバランス、集中の緩和、ヘッジ、資産配分の傾斜）は、市場環境に応じて能動的に提案してよい

【時間軸の原則】
- 前日比・本日損益は「今日の出来事」であり、分析と提案の根拠にしない
- 「本日◯%下落したから」「前日比が大きいから」を単独の理由にした提案は禁止
- 日次ノイズで結論を変えない。環境変数が変化したときだけ方針を変える

【必須セクション（この順で出力する）】

1. ## 📈 市場概況
   - 指標テーブル（主要指数・金利・為替・商品）を簡潔に。ここは「今日の出来事」の整理にとどめる

2. ## 🌐 マクロ環境と先行きの変数
   次の6項目それぞれで、「現状（数値）→ 方向（改善／悪化／横ばい）→ 市場と保有資産への含意」を示す。
   (1) 金融政策・金利: 政策金利の水準と軌道、市場の織り込み（2年債−政策金利）、長期金利の方向、イールドカーブ、FRBの直近の発表・声明
   (2) インフレ・景気・雇用: 物価の方向（総合・コア・期待インフレ）、景気の勢い、雇用の強弱、スタグフレーション／ソフトランディング／景気後退のどれに近いか
   (3) 流動性・信用: ハイイールドスプレッド、金融環境、FRBバランスシート
   (4) センチメント・需給: Fear&Greedと内訳、VIX期間構造、IPOの供給と熱量、決算シーズンの焦点
   (5) 地政学・インシデント・政策リスク: ニュースから、市場に影響し得る出来事を挙げ、ニュース番号を引用する
   (6) セクターローテーションが示すもの: どのセクターに資金が向かい／離れているか、それが景気・金利のどの見方と整合するか
   末尾に【総合判定: リスクオン／中立／リスクオフ】のいずれか一語を示し、根拠を2〜3文で述べる

3. ## 🔮 今後1〜3か月のシナリオ
   メイン・上振れ・下振れの3シナリオを、確率（合計100%）付きのテーブルで示す。
   列: シナリオ｜確率｜前提となる変数の動き｜株式｜債券・金利｜ドル円｜有利なセクター／不利なセクター｜見通しが変わるサイン
   テーブルの後に、現時点で最も確率が高いと見る根拠を2〜3文で述べる

4. ## 📅 今後2週間の注目イベント
   提供データのイベントだけを使い、最大8件をテーブルで示す。
   列: 日時（日本時間）｜イベント｜予想｜強い結果のときの市場の反応｜弱い結果のときの市場の反応
   結果が提供データにないイベントの結果を推測しない

5. ## 🧭 構造分析（俯瞰）
   ポートフォリオ側の構造。集中度・通貨・テーマの重複・保有構成の中期成績（対S&P500）から「構造上の最大の弱点」を1つ明示し、各保有銘柄を【トレンド継続】【調整中】【トレンド悪化】に分類して数値の根拠を添える（テーブル）。ETFの内訳は概算で考慮し「概算」と明記する

6. ## 📊 ポートフォリオ・リスク分析
   リスクはポートフォリオ固有の数値で定量化し、シナリオと結びつけて次のテーブルで示す。
   | リスク要因 | シナリオ | 試算インパクト | 根拠 |
   | 例: 長期金利の再上昇 | 米10年債が+50bp | △XX万円 | USD建て株式の評価額×金利感応度（概算） |
   | 例: 円高進行 | USD/JPY -10円 | △XX万円 | USD建て保有×為替感応度 |
   テーブルの後に、最も警戒すべきシナリオを2〜3文で述べる

7. ## 🔗 マクロ仮説との整合性チェック
   冒頭に【支持】【矛盾】【中立】のいずれか一語で判定し、根拠を2〜3文で述べる。両論併記や留保表現は禁止。現在の環境と、オーナー設定の投資戦略・マクロ仮説を突き合わせる

8. ## 🎯 売買判断（アクション優先度）
   - 冒頭に「現局面の基本方針」を一文で示す: リスク資産の総量を【増やす】【維持】【減らす】のいずれか＋理由（環境変数2つ以上とシナリオ）
   - 続けて、優先度順に最低2件・最大4件のアクションを書く。各アクションに必ず次を入れる:
     ①種別（買い増し／現金の投入／利確・縮小／リバランス／ヘッジ／保有継続の確認）
     ②環境認識に基づく根拠（マクロ変数2つ以上と、どのシナリオを前提とするか）
     ③時間軸（例: 今後1〜3か月）
     ④実行条件（経済指標・イベントの結果、マクロ指標の水準、週次終値の水準など。日次の値動きは条件にしない）
     ⑤規模（総資産の何%・何万円）
     ⑥見通しが外れたときの修正・撤退条件
   - 「買う／売る／持つ」の結論を曖昧にしない。「現状維持」も有効だが、その場合も「環境がどう変わったら何をするか」を具体的に書く
   - キャッシュ比率が高い場合は、どの環境条件で・どの資産に・どの程度投入するかの基準を示す
   - 個別銘柄の判断は、環境認識から導いた方針に沿って具体化する。個別のチャートだけを根拠にしない
   - NG: 「引き続き注視する」「動向を見守る」「モニタリングが必要」という表現は絶対に使わない

9. ## 📰 本日のマーケットトピックス（必ず最後のセクション）
   - **[見出し10字以内]**: 要約（日本語・1〜2文・そのニュースがなぜ重要かを端的に）
   （6〜8項目）
   条件：国内ニュース（日銀・日本市場・政策・企業動向）と海外ニュース（Fed・米国市場・地政学）を必ず混在。翻訳ではなく意訳・要点を日本語で抽出。市場インパクト順に並べる

【出力形式】
- 最初の出力は必ず ## から始める（タイトル行・日時行を先頭に出さない）
- 上記の見出し（絵文字付き）をそのまま使う
- 各セクションの末尾に【まとめ】を1〜2文で入れる（市場概況とトピックスを除く）
- 投資仮説は✅（強気継続）⚠️（要注意・監視強化）❌（仮説毀損・見直し推奨）で判定し、判定理由を1〜2文で明記する（構造分析か売買判断の中で）
- 金額にはドル記号($)を使わない（USDと表記）
- 日本語で出力する
- 【出力長の厳守】レポート全体を必ず6500トークン（目安：日本語9000文字）以内に収める。冗長な前置き・繰り返し・常套句は省き、具体的な数値と鋭い洞察だけで構成する。最後のセクションを含むすべての文章を必ず完結させる。文章の途中で終わることは絶対に禁止`;

  const userContent = buildPrompt(market, news, history, macroStrategy, macroContext);

  const message = await getClient().messages.create({
    model: "claude-sonnet-5-5",
    // 思考(thinking)に使ったトークンも max_tokens に含まれるため、レポート本文(約6500トークン)＋思考分を見込んで余裕を持たせる
    max_tokens: 16000,
    // 思考の深さ: 既定(high)だと生成に時間がかかりすぎるため medium（マクロの統合判断には思考を使いつつ速度とのバランスを取る）
    output_config: { effort: "medium" },
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
    system: systemPrompt,
  });

  // 思考ブロックなどテキスト以外が先頭に来ることがあるため、テキストブロックだけを結合して使う
  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text) {
    throw new Error(`Unexpected response from Claude API (stop_reason: ${message.stop_reason})`);
  }
  if (message.stop_reason === "max_tokens") {
    console.warn("Claude APIの出力が上限(max_tokens)に達し、レポートが途中で切れている可能性があります");
  }
  return text;
}
