import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { MarketData } from "@/types";

export const dynamic = "force-dynamic";

/** 最新レポートのポートフォリオ評価（セクター付き）を返す */
export async function GET() {
  const db = getSupabase();
  const { data, error } = await db
    .from("report_log")
    .select("market_data, created_at")
    .not("market_data", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data?.market_data) {
    return NextResponse.json({ holdings: [], updatedAt: null });
  }

  const md = data.market_data as MarketData;
  return NextResponse.json({
    holdings: md.portfolio ?? [],
    updatedAt: data.created_at as string,
  });
}
