// =======================================================================
// Seed sample painting photos by pulling public-domain oil paintings from
// the Art Institute of Chicago's open API and writing painting_images rows
// that point at their IIIF image URLs.
//
// Usage:
//   npm run seed:images          # skip paintings that already have an image
//   npm run seed:images -- --force   # overwrite existing primary images
//
// Why this works:
//   - ArtIC's API is free, no key required.
//   - Image URLs are stable IIIF 2.0 URLs hosted by them.
//   - Our <PaintingImage> component renders a plain <img src>, so external
//     URLs work with no Next config changes.
//
// When Robert sends real photos, upload them to the `paintings` Storage
// bucket via the admin panel — that will demote these samples and insert
// a new primary image pointing at Supabase Storage.
// =======================================================================

import { createClient } from "@supabase/supabase-js";
import { SEED_PAINTINGS } from "../lib/seed-data";
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

const FORCE = process.argv.includes("--force");

// -----------------------------------------------------------------------
// ArtIC search helper
// -----------------------------------------------------------------------

type ArtICItem = {
  id: number;
  title: string;
  image_id: string | null;
  artist_title: string | null;
};

async function fetchArtIC(query: string, limit = 60): Promise<ArtICItem[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    fields: "id,title,image_id,artist_title",
    "query[term][is_public_domain]": "true",
  });
  const res = await fetch(`https://api.artic.edu/api/v1/artworks/search?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`ArtIC API ${res.status} for q="${query}"`);
  }
  const json = (await res.json()) as { data: ArtICItem[] };
  return json.data.filter((d) => !!d.image_id);
}

function imageUrl(imageId: string): string {
  // IIIF 2.0 image: 1200px wide, auto height, good quality for our detail view.
  return `https://www.artic.edu/iiif/2/${imageId}/full/1200,/0/default.jpg`;
}

// Fisher–Yates shuffle with a fixed seed so the mapping is stable across runs
// (so re-running the script picks the same image for the same painting when
// possible, instead of randomly reshuffling).
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -----------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------

async function main() {
  console.log("→ Fetching sample oil paintings from the Art Institute of Chicago…");

  const [landscapes, abstracts] = await Promise.all([
    fetchArtIC("landscape oil painting"),
    fetchArtIC("abstract modern oil painting"),
  ]);

  console.log(`  ${landscapes.length} landscape candidates, ${abstracts.length} abstract candidates`);

  if (landscapes.length === 0 || abstracts.length === 0) {
    console.error("✗ Got no results from ArtIC — check network and try again.");
    process.exit(1);
  }

  // Shuffle with a fixed seed so the same painting gets the same image on re-runs.
  const landShuf = shuffle(landscapes, 1968);
  const absShuf = shuffle(abstracts, 2024);

  // Check which paintings already have images, so we know whether to skip.
  const { data: existing, error: existErr } = await supabase
    .from("painting_images")
    .select("painting_id, is_primary")
    .eq("is_primary", true);
  if (existErr) {
    console.error("✗ Failed to read painting_images:", existErr.message);
    process.exit(1);
  }
  const hasPrimary = new Set((existing ?? []).map((r) => r.painting_id));

  let landIdx = 0;
  let absIdx = 0;
  let inserted = 0;
  let skipped = 0;
  let overwritten = 0;

  for (const p of SEED_PAINTINGS) {
    if (hasPrimary.has(p.id) && !FORCE) {
      skipped++;
      continue;
    }

    const pool = p.series === "nature" ? landShuf : absShuf;
    const poolIdx = p.series === "nature" ? landIdx++ : absIdx++;
    const pick = pool[poolIdx % pool.length];

    const url = imageUrl(pick.image_id!);
    const alt = `${pick.title}${pick.artist_title ? ` — ${pick.artist_title}` : ""} (sample image)`;

    if (hasPrimary.has(p.id) && FORCE) {
      // Demote the existing primary for this painting.
      const { error } = await supabase
        .from("painting_images")
        .update({ is_primary: false })
        .eq("painting_id", p.id)
        .eq("is_primary", true);
      if (error) {
        console.error(`  ✗ ${p.id}: could not demote existing primary — ${error.message}`);
        continue;
      }
      overwritten++;
    }

    const { error } = await supabase.from("painting_images").insert({
      painting_id: p.id,
      url,
      alt,
      is_primary: true,
      sort_order: 0,
    });
    if (error) {
      console.error(`  ✗ ${p.id}: insert failed — ${error.message}`);
      continue;
    }
    inserted++;
    console.log(`  ✓ ${p.id}  ${p.title.padEnd(28)} ← ${pick.title.slice(0, 40)}`);
  }

  console.log("");
  console.log(`✓ Done. ${inserted} inserted, ${overwritten} overwritten, ${skipped} already had images (re-run with --force to overwrite those too).`);
}

main().catch((err) => {
  console.error("✗ Failed:", err.message);
  process.exit(1);
});
