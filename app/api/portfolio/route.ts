import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import type { PortfolioItem } from "@/types";

export const dynamic = "force-dynamic";

/** ポートフォリオ一覧取得 */
export async function GET() {
  const db = getSupabase();
  const { data, error } = await db
    .from("portfolio")
    .select("*")
    .order("id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** 銘柄追加 */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as Partial<PortfolioItem>;
  const { ticker, shares, cost_price, cost_rate, hypothesis } = body;

  if (!ticker || shares == null || cost_price == null) {
    return NextResponse.json(
      { error: "ticker, shares, cost_price are required" },
      { status: 400 }
    );
  }

  const db = getSupabase();
  const { data, error } = await db
    .from("portfolio")
    .insert([{
      ticker: ticker.trim().toUpperCase(),
      shares,
      cost_price,
      cost_rate: cost_rate ?? null,
      hypothesis: hypothesis ?? "",
    }])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}

/** 銘柄更新 */
export async function PUT(request: NextRequest) {
  const body = (await request.json()) as Partial<PortfolioItem>;
  const { id, ticker, shares, cost_price, cost_rate, hypothesis } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getSupabase();
  const { data, error } = await db
    .from("portfolio")
    .update({
      ticker,
      shares,
      cost_price,
      cost_rate: cost_rate ?? null,
      hypothesis: hypothesis ?? "",
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

/** 銘柄削除 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const db = getSupabase();
  const { error } = await db.from("portfolio").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
