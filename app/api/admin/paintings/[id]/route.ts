// Protected painting edits. Published slugs remain stable when titles change.
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin-auth";
import { DELETED_PAINTING_NOTE } from "@/lib/deleted-painting";
import { revalidatePath } from "next/cache";
import { forbiddenOriginResponse, isSameOrigin } from "@/lib/security";
import { InputError, readFormJson, validatePainting } from "@/lib/admin-validation";

export const runtime = "nodejs";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await context.params;
  try {
    const { fields: update, image } = validatePainting(await readFormJson(req));
    const supabase = createServerSupabaseClient();
    const { data: current, error: findError } = await supabase
      .from("paintings")
      .select("id, slug, title, year, status, note")
      .eq("id", params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!current || current.note === DELETED_PAINTING_NOTE) {
      return NextResponse.json({ error: "Painting not found." }, { status: 404 });
    }
    if (update.note === DELETED_PAINTING_NOTE) throw new InputError("That note is reserved for deleted paintings.");
    if (update.status && update.status !== current.status && current.status === "sold") {
      return NextResponse.json({ error: "A sold painting cannot be made available again." }, { status: 409 });
    }

    const { error } = await supabase.rpc("rm_admin_save_painting", {
      p_id: params.id,
      p_fields: update,
      p_image: image,
      p_create: false,
      p_expected_status: current.status,
    });
    if (error) {
      if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 409 });
      throw error;
    }

    revalidatePath("/");
    revalidatePath(`/paintings/${current.slug}`);
    revalidatePath("/admin");
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof InputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[api/admin/paintings PATCH]", error);
    return NextResponse.json({ error: "Could not save the painting. Please refresh and try again." }, { status: 500 });
  }
}

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = await context.params;
  try {
    const supabase = createServerSupabaseClient();
    const { data: painting, error: findError } = await supabase
      .from("paintings")
      .select("id, slug, status, note")
      .eq("id", params.id)
      .maybeSingle();
    if (findError) throw findError;
    if (!painting) return NextResponse.json({ error: "Painting not found." }, { status: 404 });
    if (painting.note === DELETED_PAINTING_NOTE) return NextResponse.json({ ok: true });
    if (painting.status !== "available") {
      return NextResponse.json({ error: "Reserved and sold paintings cannot be deleted. Their order records must be preserved." }, { status: 409 });
    }

    // Hide from the storefront while preserving images, offers and sale history.
    const { error } = await supabase.rpc("rm_admin_save_painting", {
      p_id: painting.id,
      p_fields: { note: DELETED_PAINTING_NOTE },
      p_image: null,
      p_create: false,
      p_expected_status: "available",
    });
    if (error) {
      if (error.code === "P0001") return NextResponse.json({ error: error.message }, { status: 409 });
      throw error;
    }

    revalidatePath("/");
    revalidatePath("/admin");
    revalidatePath(`/paintings/${painting.slug}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/admin/paintings DELETE]", error);
    return NextResponse.json({ error: "Could not delete the painting. Please try again." }, { status: 500 });
  }
}
