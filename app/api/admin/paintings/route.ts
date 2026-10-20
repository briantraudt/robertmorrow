// POST /api/admin/paintings — create a painting and its optional photograph.
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { revalidatePath } from "next/cache";
import { forbiddenOriginResponse, isSameOrigin } from "@/lib/security";
import { InputError, readFormJson, validatePainting } from "@/lib/admin-validation";
import { DELETED_PAINTING_NOTE } from "@/lib/deleted-painting";

export const runtime = "nodejs";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-") || "painting";
}

async function uniqueSlug(supabase: ReturnType<typeof createServerSupabaseClient>, title: string) {
  const base = slugify(title);
  for (let suffix = 1; suffix < 100; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`;
    const { data, error } = await supabase.from("paintings").select("id").eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (!data) return slug;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { fields, image } = validatePainting(await readFormJson(req), true);
    if (fields.note === DELETED_PAINTING_NOTE) throw new InputError("That note is reserved for deleted paintings.");
    const supabase = createServerSupabaseClient();
    const slug = await uniqueSlug(supabase, String(fields.title));
    const id = `rm-${randomUUID()}`;
    const { error } = await supabase.rpc("rm_admin_save_painting", {
      p_id: id,
      p_fields: { slug, ...fields },
      p_image: image,
      p_create: true,
      p_expected_status: null,
    });
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "A painting with this title was just added. Please try saving again." }, { status: 409 });
      if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 400 });
      throw error;
    }

    revalidatePath("/");
    revalidatePath("/admin");
    return NextResponse.json({ ok: true, id, slug });
  } catch (error) {
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[api/admin/paintings POST]", error);
    return NextResponse.json({ error: "Could not create the painting. Please try again." }, { status: 500 });
  }
}
