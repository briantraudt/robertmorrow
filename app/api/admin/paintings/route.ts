// =======================================================================
// POST /api/admin/paintings — create a new painting
//
// Body: all painting fields (id optional — generated from slug if omitted).
// The client may also send { imageUrl, imageWidth, imageHeight } to create a
// primary painting_images row in the same transaction.
// =======================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export async function POST(req: Request) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const {
      title,
      year,
      series,
      medium,
      w,
      h,
      price,
      status,
      note,
      slug: slugIn,
      sort_order,
      imageUrl,
      imageWidth,
      imageHeight,
    } = body as Record<string, string | number | undefined>;

    if (!title || !year || !series || !medium || !w || !h || !price) {
      return NextResponse.json(
        { error: "Title, year, series, medium, width, height and price are required." },
        { status: 400 },
      );
    }

    const slug = slugIn ? slugify(String(slugIn)) : slugify(String(title));
    const id = `rm-${slug}-${Math.random().toString(36).slice(2, 7)}`;

    const supabase = createServerSupabaseClient();
    const { error: insErr } = await supabase.from("paintings").insert({
      id,
      slug,
      title: String(title),
      year: Number(year),
      series: String(series),
      medium: String(medium),
      w: Number(w),
      h: Number(h),
      price: Number(price),
      status: (status as string) || "available",
      note: note ? String(note) : null,
      sort_order: sort_order ? Number(sort_order) : null,
    });
    if (insErr) throw insErr;

    if (imageUrl) {
      const { error: imgErr } = await supabase.from("painting_images").insert({
        painting_id: id,
        url: String(imageUrl),
        alt: `${title}, ${year}`,
        width: imageWidth ? Number(imageWidth) : null,
        height: imageHeight ? Number(imageHeight) : null,
        is_primary: true,
        sort_order: 0,
      });
      if (imgErr) throw imgErr;
    }

    revalidatePath("/");
    revalidatePath("/admin");
    return NextResponse.json({ ok: true, id, slug });
  } catch (err) {
    console.error("[api/admin/paintings POST]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
