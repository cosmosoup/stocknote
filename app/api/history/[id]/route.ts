import { NextRequest, NextResponse } from "next/server";
import { getReportById } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const numId = parseInt(id, 10);
  if (isNaN(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const report = await getReportById(numId);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
