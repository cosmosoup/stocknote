import { NextRequest, NextResponse } from "next/server";
import { getMacroStrategy, saveMacroStrategy, getCashJpy, saveCashJpy } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** マクロ投資戦略・キャッシュ残高を取得 */
export async function GET() {
  try {
    const [macro_strategy, cash_jpy] = await Promise.all([
      getMacroStrategy(),
      getCashJpy(),
    ]);
    return NextResponse.json({ macro_strategy, cash_jpy });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** マクロ投資戦略・キャッシュ残高を保存 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as { macro_strategy?: string; cash_jpy?: number };
    const tasks: Promise<void>[] = [];
    if (body.macro_strategy !== undefined) {
      tasks.push(saveMacroStrategy(body.macro_strategy));
    }
    if (body.cash_jpy !== undefined) {
      tasks.push(saveCashJpy(body.cash_jpy));
    }
    await Promise.all(tasks);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
