import "server-only";
import { createServerSupabaseClient } from "./supabase/server";
import { DELETED_PAINTING_NOTE } from "./deleted-painting";
import { SEED_PAINTINGS } from "./seed-data";
import type { Painting, PaintingImage } from "./types";

const COLUMNS = "id, slug, title, year, series, medium, w, h, price, status, framing, note, palette, aspect";
// Import photographs can be reused; seed prices/status are never inventory.
const SEED_BY_ID = new Map(SEED_PAINTINGS.map((p) => [p.id, p]));
const SEED_BY_SLUG = new Map(SEED_PAINTINGS.map((p) => [p.slug, p]));
const FRAMED_SLUGS = new Set(["img-2329", "img-2330", "img-2359", "img-2360", "img-2373", "img-2398", "img-2421"]);

function withImages(painting: Painting, images: PaintingImage[]): Painting {
  const seed = SEED_BY_ID.get(painting.id) ?? SEED_BY_SLUG.get(painting.slug);
  const photos = images.length ? images : seed?.images ?? [];
  return {
    ...painting,
    framing: painting.framing ?? "Unframed; shipped flat",
    images: [...photos].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  };
}

function sortForGallery(paintings: Painting[]): Painting[] {
  return [...paintings].sort((a, b) =>
    Number(FRAMED_SLUGS.has(a.slug)) - Number(FRAMED_SLUGS.has(b.slug)) ||
    Math.max(b.w, b.h) - Math.max(a.w, a.h) ||
    Math.min(b.w, b.h) - Math.min(a.w, a.h) || b.w - a.w || b.h - a.h ||
    a.title.localeCompare(b.title, undefined, { numeric: true }),
  );
}

export async function getPaintings(): Promise<Painting[]> {
  const supabase = createServerSupabaseClient();
  const [paintingsRes, imagesRes] = await Promise.all([
    supabase.from("paintings").select(COLUMNS).order("sort_order", { ascending: true, nullsFirst: false }),
    supabase.from("painting_images").select("painting_id, url, alt, width, height, is_primary, sort_order"),
  ]);
  if (paintingsRes.error) throw new Error("The painting catalog is temporarily unavailable.", { cause: paintingsRes.error });
  if (imagesRes.error) throw new Error("Painting photographs are temporarily unavailable.", { cause: imagesRes.error });
  const byPainting = new Map<string, PaintingImage[]>();
  for (const img of imagesRes.data ?? []) {
    const photos = byPainting.get(img.painting_id) ?? [];
    photos.push(img);
    byPainting.set(img.painting_id, photos);
  }
  return sortForGallery((paintingsRes.data as unknown as Painting[])
    .filter((p) => p.note !== DELETED_PAINTING_NOTE)
    .map((p) => withImages(p, byPainting.get(p.id) ?? [])));
}

export async function getPainting(idOrSlug: string): Promise<Painting | null> {
  if (!/^[a-zA-Z0-9_-]{1,160}$/.test(idOrSlug)) return null;
  const supabase = createServerSupabaseClient();
  let result = await supabase.from("paintings").select(COLUMNS).eq("id", idOrSlug).maybeSingle();
  if (result.error) throw new Error("The painting is temporarily unavailable.", { cause: result.error });
  if (!result.data) result = await supabase.from("paintings").select(COLUMNS).eq("slug", idOrSlug).maybeSingle();
  if (result.error) throw new Error("The painting is temporarily unavailable.", { cause: result.error });
  if (!result.data || result.data.note === DELETED_PAINTING_NOTE) return null;
  const painting = result.data as unknown as Painting;
  const images = await supabase.from("painting_images")
    .select("url, alt, width, height, is_primary, sort_order").eq("painting_id", painting.id);
  if (images.error) throw new Error("Painting photographs are temporarily unavailable.", { cause: images.error });
  return withImages(painting, images.data ?? []);
}
