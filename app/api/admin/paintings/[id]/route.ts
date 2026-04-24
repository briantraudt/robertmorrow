// =======================================================================
// PATCH /api/admin/paintings/[id] — update fields and/or primary image
// DELETE /api/admin/paintings/[id] — remove painting (refuses if offers exist)
// =======================================================================

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { revalidatePath } from "next/cache";

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
  "note",
  "slug",
  "sort_order",
] as const;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const supabase = createServerSupabaseClient();

    // Whitelist fields we accept on update.
    const update: Record<string, string | number | null> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) {
        const v = body[key];
        if (v === "" || v === undefined || v === null) {
          if (key === "note" || key === "sort_order") update[key] = null;
          if (key === "year") update[key] = 0;
        } else {
          update[key] =
            ["year", "w", "h", "price", "sort_order"].includes(key)
              ? Number(v)
              : String(v);
        }
      }
    }
    if (Object.keys(update).length) {
      update["updated_at"] = new Date().toISOString();
      const { error } = await supabase
        .from("paintings")
        .update(update)
        .eq("id", params.id);
      if (error) throw error;
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
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/paintings PATCH]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createServerSupabaseClient();

    // Guard: refuse delete if any offers reference this painting.
    const { count: offerCount } = await supabase
      .from("offers")
      .select("id", { count: "exact", head: true })
      .eq("painting_id", params.id);
    if ((offerCount ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            "This painting has offers on record. Mark it as sold or archived instead of deleting.",
        },
        { status: 409 },
      );
    }

    // Remove image rows first (storage objects remain — cheap, and we keep
    // them as backup).
    await supabase.from("painting_images").delete().eq("painting_id", params.id);
    const { error } = await supabase.from("paintings").delete().eq("id", params.id);
    if (error) throw error;

    revalidatePath("/");
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/admin/paintings DELETE]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
