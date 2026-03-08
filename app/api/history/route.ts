import { NextResponse } from "next/server";
import { getReportHistory } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const history = await getReportHistory(60);
  return NextResponse.json(history);
}
