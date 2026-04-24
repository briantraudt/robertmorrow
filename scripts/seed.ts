// =======================================================================
// Replace the paintings table from lib/seed-data.ts.
// Usage: npm run seed
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
// =======================================================================

import { createClient } from "@supabase/supabase-js";
import { SEED_PAINTINGS } from "../lib/seed-data";

// Load .env.local
import { config } from "dotenv";
config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`→ Replacing catalog with ${SEED_PAINTINGS.length} paintings…`);

  const rows = SEED_PAINTINGS.map((p, i) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    year: p.year,
    series: p.series,
    medium: p.medium,
    w: p.w,
    h: p.h,
    price: p.price,
    status: p.status,
    note: p.note ?? null,
    palette: p.palette ?? null,
    aspect: p.aspect ?? null,
    sort_order: i,
  }));

  const { error: imageDeleteError } = await supabase
    .from("painting_images")
    .delete()
    .neq("painting_id", "");
  if (imageDeleteError) {
    console.error("✗ Could not clear painting images:", imageDeleteError.message);
    process.exit(1);
  }

  const { error: paintingDeleteError } = await supabase
    .from("paintings")
    .delete()
    .neq("id", "");
  if (paintingDeleteError) {
    console.error("✗ Could not clear paintings:", paintingDeleteError.message);
    process.exit(1);
  }

  const { error } = await supabase.from("paintings").insert(rows);
  if (error) {
    console.error("✗ Seed failed:", error.message);
    process.exit(1);
  }

  const imageRows = SEED_PAINTINGS.flatMap((p) =>
    p.images.map((img) => ({
      painting_id: p.id,
      url: img.url,
      alt: img.alt ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
      is_primary: img.is_primary ?? false,
      sort_order: img.sort_order ?? 0,
    })),
  );

  if (imageRows.length) {
    const { error: imageError } = await supabase
      .from("painting_images")
      .insert(imageRows);
    if (imageError) {
      console.error("✗ Image seed failed:", imageError.message);
      process.exit(1);
    }
  }

  console.log("✓ Done. Paintings and images replaced.");
}

main();
