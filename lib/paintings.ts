// =======================================================================
// Painting data access — reads from Supabase, falls back to seed data.
// Usage:
//   const paintings = await getPaintings();
// =======================================================================

import "server-only";
import { createServerSupabaseClient } from "./supabase/server";
import { SEED_PAINTINGS, findPainting as seedFind } from "./seed-data";
import type { Painting } from "./types";

export async function getPaintings(): Promise<Painting[]> {
  try {
    const supabase = createServerSupabaseClient();

    // Two separate queries, joined in JS — more robust than PostgREST embedded
    // resources, which can silently fail on relationship inference.
    const [paintingsRes, imagesRes] = await Promise.all([
      supabase
        .from("paintings")
        .select(
          "id, slug, title, year, series, medium, w, h, price, status, note, palette, aspect",
        )
        .order("sort_order", { ascending: true, nullsFirst: false }),
      supabase
        .from("painting_images")
        .select("painting_id, url, alt, width, height, is_primary, sort_order"),
    ]);

    if (paintingsRes.error) {
      console.error(
        "RMDBG paintings error:",
        JSON.stringify({
          message: paintingsRes.error.message,
          code: paintingsRes.error.code,
          details: paintingsRes.error.details,
          hint: paintingsRes.error.hint,
        }),
      );
      throw paintingsRes.error;
    }
    if (imagesRes.error) {
      console.error(
        "RMDBG images error:",
        JSON.stringify({
          message: imagesRes.error.message,
          code: imagesRes.error.code,
          details: imagesRes.error.details,
          hint: imagesRes.error.hint,
        }),
      );
      // Don't throw — degrade gracefully to paintings-without-images.
    }

    const rows = paintingsRes.data ?? [];
    if (rows.length === 0) return SEED_PAINTINGS;

    // Group images by painting_id.
    const byPainting = new Map<string, Painting["images"]>();
    for (const img of imagesRes.data ?? []) {
      const list = byPainting.get(img.painting_id) ?? [];
      list.push({
        url: img.url,
        alt: img.alt,
        width: img.width,
        height: img.height,
        is_primary: img.is_primary,
        sort_order: img.sort_order,
      });
      byPainting.set(img.painting_id, list);
    }

    return rows.map((p) => ({
      ...(p as unknown as Painting),
      images: byPainting.get(p.id) ?? [],
    }));
  } catch (err) {
    const safeErr =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack?.slice(0, 400) }
        : { raw: String(err) };
    console.error("RMDBG getPaintings catch:", JSON.stringify(safeErr));
    console.error("RMDBG getPaintings env:", JSON.stringify({
      hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasAnon: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      urlStart: process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30) ?? null,
    }));
    return SEED_PAINTINGS;
  }
}

export async function getPainting(
  idOrSlug: string,
): Promise<Painting | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data: painting, error } = await supabase
      .from("paintings")
      .select(
        "id, slug, title, year, series, medium, w, h, price, status, note, palette, aspect",
      )
      .or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`)
      .maybeSingle();
    if (error) {
      console.error(
        "RMDBG getPainting error:",
        JSON.stringify({
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        }),
      );
      throw error;
    }
    if (painting) {
      const { data: images } = await supabase
        .from("painting_images")
        .select("url, alt, width, height, is_primary, sort_order")
        .eq("painting_id", (painting as { id: string }).id);
      return {
        ...(painting as unknown as Painting),
        images: images ?? [],
      };
    }
  } catch (err) {
    const safeErr =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack?.slice(0, 400) }
        : { raw: String(err) };
    console.error("RMDBG getPainting catch:", JSON.stringify(safeErr));
  }
  return seedFind(idOrSlug) ?? null;
}
