// =======================================================================
// PATCH /api/admin/paintings/[id] — update fields and/or primary image
// DELETE /api/admin/paintings/[id] — remove painting and dependent records
// =======================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { findPainting as seedFind } from "@/lib/seed-data";
import { revalidatePath } from "next/cache";
import { forbiddenOriginResponse, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

const EDITABLE_FIELDS = [
  "title",
  "year",
  "series",
  "medium",
  "w",
  "h",
  "price",
  "status",
  "framing",
  "note",
  "sort_order",
] as const;

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
  currentId: string,
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
    if (!data || data.id === currentId) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const supabase = createServerSupabaseClient();
    const current = await supabase
      .from("paintings")
      .select("id, slug, title")
      .eq("id", params.id)
      .maybeSingle();
    if (current.error) throw current.error;

    // Whitelist fields we accept on update.
    const update: Record<string, string | number | null> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) {
        const v = body[key];
        if (v === "" || v === undefined || v === null) {
          if (key === "note" || key === "framing" || key === "sort_order") update[key] = null;
          if (key === "year") update[key] = 0;
        } else {
          update[key] =
            ["year", "w", "h", "price", "sort_order"].includes(key)
              ? Number(v)
              : String(v);
        }
      }
    }
    if ("title" in update) {
      update.slug = await uniqueSlug(supabase, String(update.title), params.id);
    }
    if (Object.keys(update).length) {
      update["updated_at"] = new Date().toISOString();
      const { data: updated, error } = await supabase
        .from("paintings")
        .update(update)
        .eq("id", params.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!updated) {
        const seed = seedFind(params.id);
        if (!seed) {
          return NextResponse.json(
            { error: "Painting not found." },
            { status: 404 },
          );
        }
        const { error: insertErr } = await supabase.from("paintings").insert({
          id: seed.id,
          slug: seed.slug,
          title: seed.title,
          year: seed.year,
          series: seed.series,
          medium: seed.medium,
          w: seed.w,
          h: seed.h,
          price: seed.price,
          status: seed.status,
          framing: seed.framing ?? null,
          note: seed.note ?? null,
          palette: seed.palette ?? null,
          aspect: seed.aspect ?? null,
          ...update,
        });
        if (insertErr) throw insertErr;
      }
    }

    // Optional new primary image.
    if (body.imageUrl) {
      // Demote any existing primary, then insert the new one as primary.
      await supabase
        .from("painting_images")
        .update({ is_primary: false })
        .eq("painting_id", params.id);

      const { error: imgErr } = await supabase.from("painting_images").insert({
        painting_id: params.id,
        url: String(body.imageUrl),
        alt: body.imageAlt ? String(body.imageAlt) : null,
        width: body.imageWidth ? Number(body.imageWidth) : null,
        height: body.imageHeight ? Number(body.imageHeight) : null,
        is_primary: true,
        sort_order: 0,
      });
      if (imgErr) throw imgErr;
    }

    revalidatePath("/");
    revalidatePath(`/paintings/${params.id}`);
    if (current.data?.slug) revalidatePath(`/paintings/${current.data.slug}`);
    if (typeof update.slug === "string") revalidatePath(`/paintings/${update.slug}`);
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/paintings PATCH]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServerSupabaseClient();
    const { data: painting, error: findErr } = await supabase
      .from("paintings")
      .select("id, slug")
      .eq("id", params.id)
      .maybeSingle();
    if (findErr) throw findErr;

    if (!painting) {
      return NextResponse.json({ error: "Painting not found." }, { status: 404 });
    }

    // Remove dependent rows explicitly so admin deletion works even if the
    // deployed database was created before the cascade constraints existed.
    const { error: offersErr } = await supabase
      .from("offers")
      .delete()
      .eq("painting_id", params.id);
    if (offersErr) throw offersErr;

    // Storage objects remain — cheap, and useful as a backup if a deletion was accidental.
    const { error: imagesErr } = await supabase
      .from("painting_images")
      .delete()
      .eq("painting_id", params.id);
    if (imagesErr) throw imagesErr;

    const { error } = await supabase
      .from("paintings")
      .delete()
      .eq("id", params.id);
    if (error) throw error;

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath(`/paintings/${painting.slug}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/paintings DELETE]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
