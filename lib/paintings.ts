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
      console.error("getPaintings: paintings query failed:", paintingsRes.error.message);
      throw paintingsRes.error;
    }
    if (imagesRes.error) {
      console.error("getPaintings: images query failed:", imagesRes.error.message);
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
    console.error(
      "getPaintings: falling back to seed data —",
      err instanceof Error ? err.message : err,
    );
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
      console.error("getPainting: paintings query failed:", error.message);
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
    console.error(
      "getPainting: falling back to seed —",
      err instanceof Error ? err.message : err,
    );
  }
  return seedFind(idOrSlug) ?? null;
}
