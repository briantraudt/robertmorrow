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
import { forbiddenOriginResponse, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

function slugify(s: string) {
  const slug = s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return slug || "painting";
}

async function uniqueSlug(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  title: string,
) {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
      .from("paintings")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    if (!data) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
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
      framing,
      sort_order,
      imageUrl,
      imageWidth,
      imageHeight,
    } = body as Record<string, string | number | undefined>;

    if (!title || !medium || !w || !h || !price) {
      return NextResponse.json(
        { error: "Title, medium, width, height and price are required." },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();
    const slug = await uniqueSlug(supabase, String(title));
    const id = `rm-${slug}-${Math.random().toString(36).slice(2, 7)}`;

    const { error: insErr } = await supabase.from("paintings").insert({
      id,
      slug,
      title: String(title),
      year: year ? Number(year) : 0,
      series: series ? String(series) : "abstract",
      medium: String(medium),
      w: Number(w),
      h: Number(h),
      price: Number(price),
      status: (status as string) || "available",
      framing: framing ? String(framing) : null,
      note: note ? String(note) : null,
      sort_order: sort_order ? Number(sort_order) : null,
    });
    if (insErr) throw insErr;

    if (imageUrl) {
      const { error: imgErr } = await supabase.from("painting_images").insert({
        painting_id: id,
        url: String(imageUrl),
        alt: year ? `${title}, ${year}` : String(title),
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
