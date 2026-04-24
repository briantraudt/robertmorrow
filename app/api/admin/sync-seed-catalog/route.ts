import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SEED_PAINTINGS } from "@/lib/seed-data";

export const runtime = "nodejs";

const CLEANUP_TOKEN = "de93397713f284ba35e41a9aa968a51b0462ca899e32f6d1";

export async function POST(req: Request) {
  const token = req.headers.get("x-cleanup-token");
  if (token !== CLEANUP_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: beforeRows, error: beforeError } = await supabase
    .from("paintings")
    .select("id, slug, title")
    .order("sort_order", { ascending: true, nullsFirst: false });
  if (beforeError) {
    return NextResponse.json({ error: beforeError.message }, { status: 500 });
  }

  const { error: imageDeleteError } = await supabase
    .from("painting_images")
    .delete()
    .neq("painting_id", "");
  if (imageDeleteError) {
    return NextResponse.json({ error: imageDeleteError.message }, { status: 500 });
  }

  const { error: paintingDeleteError } = await supabase
    .from("paintings")
    .delete()
    .neq("id", "");
  if (paintingDeleteError) {
    return NextResponse.json({ error: paintingDeleteError.message }, { status: 500 });
  }

  const paintingRows = SEED_PAINTINGS.map((p, i) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    year: p.year,
    series: p.series,
    medium: p.medium,
    w: p.w,
    h: p.h,
    price: p.price,
    status: p.status,
    note: p.note ?? null,
    palette: p.palette ?? null,
    aspect: p.aspect ?? null,
    sort_order: i,
  }));

  const { error: insertError } = await supabase.from("paintings").insert(paintingRows);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const imageRows = SEED_PAINTINGS.flatMap((p) =>
    p.images.map((img) => ({
      painting_id: p.id,
      url: img.url,
      alt: img.alt ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
      is_primary: img.is_primary ?? false,
      sort_order: img.sort_order ?? 0,
    })),
  );

  if (imageRows.length) {
    const { error: imageInsertError } = await supabase
      .from("painting_images")
      .insert(imageRows);
    if (imageInsertError) {
      return NextResponse.json({ error: imageInsertError.message }, { status: 500 });
    }
  }

  const { data: afterRows, error: afterError } = await supabase
    .from("paintings")
    .select("id, slug, title")
    .order("sort_order", { ascending: true, nullsFirst: false });
  if (afterError) {
    return NextResponse.json({ error: afterError.message }, { status: 500 });
  }

  const oldTitles = (afterRows ?? []).filter((p) => !p.title.startsWith("Untitled "));

  return NextResponse.json({
    ok: true,
    beforeCount: beforeRows?.length ?? 0,
    beforeTitles: beforeRows?.map((p) => p.title) ?? [],
    afterCount: afterRows?.length ?? 0,
    afterTitles: afterRows?.map((p) => p.title) ?? [],
    oldTitlesRemaining: oldTitles,
  });
}
