// =======================================================================
// Seed the paintings table from lib/seed-data.ts. Idempotent — safe to re-run.
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
  console.log(`→ Seeding ${SEED_PAINTINGS.length} paintings…`);

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

  const { error } = await supabase.from("paintings").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("✗ Seed failed:", error.message);
    process.exit(1);
  }
  console.log("✓ Done. Paintings upserted.");
  console.log("");
  console.log("Next: upload Robert's real photographs to the Supabase `paintings`");
  console.log("storage bucket, then insert rows into `painting_images` pointing at them.");
}

main();
