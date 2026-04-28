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
import { isAdmin } from "@/lib/admin-auth";
import { forbiddenOriginResponse, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "paintings";
// Cap the stored image's long edge. Keeps uploads reasonable and the
// gallery fast without losing detail on a 24" monitor.
const MAX_EDGE = 2200;
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOriginResponse();
  if (!isAdmin()) {
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
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Please use a file under 12 MB." },
        { status: 413 },
      );
    }
    const originalName = (form.get("filename") as string) || "painting";
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
      const meta = await sharp(inputBytes, { failOn: "none" })
        .rotate()
        .metadata();
      const pipeline = sharp(inputBytes, { failOn: "none" })
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
      // Sharp couldn't decode (rare — mostly exotic HEIC variants on some
      // platforms). Fall back to the raw bytes.
      console.warn("[api/admin/upload] sharp failed, uploading raw:", e);
      processed = inputBytes;
    }

    // ---- Build path and upload -------------------------------------------
    const safe = originalName
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/\.[^.]+$/, "");
    const ext = processed === inputBytes ? (originalName.match(/\.([a-z0-9]+)$/i)?.[1] || "jpg") : "jpg";
    const stamp = Date.now();
    const path = `${stamp}-${safe}.${ext}`;

    const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : file.type || "application/octet-stream";

    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, processed, {
        contentType,
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
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
