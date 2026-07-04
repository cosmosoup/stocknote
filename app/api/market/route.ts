import { NextResponse } from "next/server";
import { loadPortfolio, getCashJpy } from "@/lib/supabase";
import { fetchMarketData } from "@/lib/market";
import { fetchNews } from "@/lib/news";

export const dynamic = "force-dynamic";

/**
 * リアルタイム市場ダッシュボード用API
 * Claude APIを呼ばずに市場データ・ニュースのみを即座に返す（コストゼロ・数秒で応答）
 */
export async function GET() {
  try {
    const portfolio = await loadPortfolio();
    const [cashJpy, news] = await Promise.all([getCashJpy(), fetchNews()]);
    const market = await fetchMarketData(portfolio, cashJpy);
    return NextResponse.json({ market, news });
  } catch (err) {
    console.error("Market data fetch error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
