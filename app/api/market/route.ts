import { NextResponse } from "next/server";
import { loadPortfolio, getCashJpy } from "@/lib/supabase";
import { fetchMarketData } from "@/lib/market";
import { fetchNews } from "@/lib/news";
import { translateNews } from "@/lib/newsTranslate";

export const dynamic = "force-dynamic";

/**
 * リアルタイム市場ダッシュボード用API
 * 市場データはClaude APIを呼ばず即座に返す。ニュースのみ日本語訳のため
 * Haikuモデルを使用するが、翻訳済みキャッシュがあれば新着分のみ呼び出す
 */
export async function GET() {
  try {
    const portfolio = await loadPortfolio();
    const [cashJpy, newsRaw] = await Promise.all([getCashJpy(), fetchNews()]);
    const [market, news] = await Promise.all([
      fetchMarketData(portfolio, cashJpy),
      translateNews(newsRaw),
    ]);
    return NextResponse.json({ market, news });
  } catch (err) {
    console.error("Market data fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
