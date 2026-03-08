import { NextRequest, NextResponse } from "next/server";
import { getMacroStrategy, saveMacroStrategy } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** マクロ投資戦略を取得 */
export async function GET() {
  try {
    const value = await getMacroStrategy();
    return NextResponse.json({ macro_strategy: value });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** マクロ投資戦略を保存 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { macro_strategy?: string };
    await saveMacroStrategy(body.macro_strategy ?? "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
