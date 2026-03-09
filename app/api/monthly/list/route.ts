import { NextResponse } from "next/server";
import { getMonthlyReportList } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const list = await getMonthlyReportList();
  return NextResponse.json(list);
}
