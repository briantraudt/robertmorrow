// =======================================================================
// Bulk import local painting photos into Supabase.
//
// Usage:
//   npx tsx scripts/bulk-import-paintings.ts /path/to/IMG_1234.heic ...
//
// Creates placeholder catalog rows that can be edited later in /admin.
// =======================================================================

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const BUCKET = "paintings";
const MAX_EDGE = 2200;
const DEFAULT_PRICE = 550;
const LANDSCAPE_SIZE = { w: 24, h: 19 };
const PORTRAIT_SIZE = { w: 18, h: 24 };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Pass one or more local image paths.");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function slugFromFile(file: string) {
  return path
    .basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function titleFromSlug(slug: string) {
  const number = slug.match(/\d+/)?.[0] ?? slug;
  return `Test ${number}`;
}

async function nextSortOrder() {
  const { data, error } = await supabase
    .from("paintings")
    .select("sort_order")
    .order("sort_order", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) throw error;
  return Number(data?.[0]?.sort_order ?? -1) + 1;
}

async function processImage(file: string, slug: string) {
  const input = await fs.readFile(file);
  const pipeline = sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88, mozjpeg: true });

  const out = await pipeline.toBuffer({ resolveWithObject: true });
  const storagePath = `${Date.now()}-${slug}.jpg`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, out.data, {
    contentType: "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  return {
    url: publicUrl,
    width: out.info.width,
    height: out.info.height,
    aspect: out.info.width / out.info.height,
  };
}

async function main() {
  let sortOrder = await nextSortOrder();

  for (const file of files) {
    await fs.access(file);

    const slug = slugFromFile(file);
    const id = `rm-${slug}`;
    const title = titleFromSlug(slug);

    const { data: existing, error: existingError } = await supabase
      .from("paintings")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      console.log(`Skipping ${slug}; a painting with that slug already exists.`);
      continue;
    }

    const image = await processImage(file, slug);
    const size = image.aspect >= 1 ? LANDSCAPE_SIZE : PORTRAIT_SIZE;

    const { error: paintingError } = await supabase.from("paintings").insert({
      id,
      slug,
      title,
      year: 0,
      series: "abstract",
      medium: "Acrylic on canvas",
      w: size.w,
      h: size.h,
      price: DEFAULT_PRICE,
      status: "available",
      note: null,
      aspect: image.aspect,
      sort_order: sortOrder++,
    });
    if (paintingError) throw paintingError;

    const { error: imageError } = await supabase.from("painting_images").insert({
      painting_id: id,
      url: image.url,
      alt: title,
      width: image.width,
      height: image.height,
      is_primary: true,
      sort_order: 0,
    });
    if (imageError) throw imageError;

    console.log(`Imported ${title} (${slug})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
