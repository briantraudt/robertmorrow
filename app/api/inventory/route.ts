import { NextResponse } from "next/server";
import { getPaintings } from "@/lib/paintings";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json({ paintings: await getPaintings() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Inventory is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
