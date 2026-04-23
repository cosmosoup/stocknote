import { NextRequest, NextResponse } from "next/server";
import {
  getMacroStrategy, saveMacroStrategy,
  getCashJpy, saveCashJpy,
  getOtherAssets, saveOtherAssets,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** マクロ投資戦略・キャッシュ残高・その他資産を取得 */
export async function GET() {
  try {
    const [macro_strategy, cash_jpy, other] = await Promise.all([
      getMacroStrategy(),
      getCashJpy(),
      getOtherAssets(),
    ]);
    return NextResponse.json({ macro_strategy, cash_jpy, ...other });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** マクロ投資戦略・キャッシュ残高・その他資産を保存 */
export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      macro_strategy?: string;
      cash_jpy?: number;
      trust_jpy?: number;
      btc_amount?: number;
      free_cash_jpy?: number;
    };
    const tasks: Promise<void>[] = [];
    if (body.macro_strategy !== undefined) tasks.push(saveMacroStrategy(body.macro_strategy));
    if (body.cash_jpy !== undefined) tasks.push(saveCashJpy(body.cash_jpy));

    const otherPatch: Record<string, number> = {};
    if (body.trust_jpy !== undefined) otherPatch.trust_jpy = body.trust_jpy;
    if (body.btc_amount !== undefined) otherPatch.btc_amount = body.btc_amount;
    if (body.free_cash_jpy !== undefined) otherPatch.free_cash_jpy = body.free_cash_jpy;
    if (Object.keys(otherPatch).length > 0) tasks.push(saveOtherAssets(otherPatch));

    await Promise.all(tasks);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
