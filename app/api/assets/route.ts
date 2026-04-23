import { NextResponse } from "next/server";
import { getAssetHistory, getOtherAssets } from "@/lib/supabase";
import { fetchBtcJpy } from "@/lib/market";

export const dynamic = "force-dynamic";

/** 総資産履歴 + 現在のその他資産設定を返す */
export async function GET() {
  try {
    const [history, otherAssets, btcPrice] = await Promise.all([
      getAssetHistory(90),
      getOtherAssets(),
      fetchBtcJpy(),
    ]);
    return NextResponse.json({
      history,
      other_assets: otherAssets,
      btc_price_jpy: btcPrice,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
