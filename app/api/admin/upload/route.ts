// =======================================================================
// POST /api/admin/upload — multipart form upload → Supabase Storage
//
// Accepts any common image type (JPEG/PNG/WebP/HEIC/GIF/TIFF/AVIF/BMP),
// auto-rotates via EXIF, resizes to a sensible max width, and re-encodes to JPEG so the
// gallery renders consistently across browsers (HEIC is not supported on
// Chrome/Firefox/Windows).
//
// Returns { url, path, width, height }. Max ~4 MB on Vercel Hobby.
// =======================================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { isAdmin } from "@/lib/admin-auth";
import { forbiddenOriginResponse, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "paintings";
// Cap the stored image's long edge. Keeps uploads reasonable and the
// gallery fast without losing detail on a 24" monitor.
const MAX_EDGE = 2200;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!rawUrl || !serviceKey) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
    }
    let url: string;
    try {
      url = new URL(rawUrl).toString().replace(/\/$/, "");
    } catch {
      return NextResponse.json(
        {
          error:
            "Supabase URL is malformed. Check NEXT_PUBLIC_SUPABASE_URL in Vercel — it should look like https://xxxxx.supabase.co (no trailing slash, no whitespace).",
        },
        { status: 500 },
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Please use a non-empty image under 4 MB. Export large HEIC images as JPEG first." },
        { status: 413 },
      );
    }
    const filename = form.get("filename");
    const originalName = typeof filename === "string" ? filename.slice(0, 240) : "painting";
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(heic|heif|jpe?g|png|webp|gif|avif|tiff?|bmp)$/i.test(originalName);
    if (!looksLikeImage) {
      return NextResponse.json({ error: "File must be an image." }, { status: 400 });
    }

    // ---- Normalize / trim / resize with sharp -----------------------------
    const inputBytes = Buffer.from(await file.arrayBuffer());
    let processed: Buffer;
    let width: number | undefined;
    let height: number | undefined;
    try {
      const meta = await sharp(inputBytes, { failOn: "error", limitInputPixels: 80000000 })
        .rotate()
        .metadata();
      const pipeline = sharp(inputBytes, { failOn: "error", limitInputPixels: 80000000 })
        .rotate() // respect EXIF orientation (iPhone photos)
        .resize({
          width: MAX_EDGE,
          height: MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88, mozjpeg: true });

      const out = await pipeline.toBuffer({ resolveWithObject: true });
      processed = out.data;
      width = out.info.width;
      height = out.info.height;
      console.log(
        `[upload] rotated ${meta.width}x${meta.height} → resized ${out.info.width}x${out.info.height}`,
      );
    } catch (e) {
      console.warn("[api/admin/upload] Image decoding failed.", e instanceof Error ? e.name : "Unknown error");
      return NextResponse.json({ error: "This image could not be read. Please export it as a JPEG or PNG and try again." }, { status: 422 });
    }

    // ---- Build path and upload -------------------------------------------
    const safe = originalName
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/\.[^.]+$/, "");
    const path = `${randomUUID()}-${safe || "painting"}.jpg`;

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, processed, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "31536000",
      });
    if (upErr) throw upErr;

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ ok: true, url: publicUrl, path, width, height });
  } catch (err) {
    console.error("[api/admin/upload]", err);
    return NextResponse.json({ error: "Could not upload the image. Please try again." }, { status: 500 });
  }
}
