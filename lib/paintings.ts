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
    const { data, error } = await supabase
      .from("paintings")
      .select(
        `
        id, slug, title, year, series, medium, w, h, price, status, note,
        palette, aspect,
        images:painting_images ( url, alt, width, height, is_primary, sort_order )
      `,
      )
      .order("sort_order", { ascending: true, nullsFirst: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      // Table empty — use seed data until the catalog is loaded.
      return SEED_PAINTINGS;
    }
    return data as unknown as Painting[];
  } catch {
    // Supabase not configured yet — fall back to seed data so the site still
    // renders during local development and preview.
    return SEED_PAINTINGS;
  }
}

export async function getPainting(
  idOrSlug: string,
): Promise<Painting | null> {
  try {
    const supabase = createServerSupabaseClient();
    const { data } = await supabase
      .from("paintings")
      .select(
        `
        id, slug, title, year, series, medium, w, h, price, status, note,
        palette, aspect,
        images:painting_images ( url, alt, width, height, is_primary, sort_order )
      `,
      )
      .or(`id.eq.${idOrSlug},slug.eq.${idOrSlug}`)
      .maybeSingle();
    if (data) return data as unknown as Painting;
  } catch {
    /* fall through to seed */
  }
  return seedFind(idOrSlug) ?? null;
}
