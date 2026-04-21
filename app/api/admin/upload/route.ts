// =======================================================================
// POST /api/admin/upload — multipart form upload → Supabase Storage
//
// Returns { url, path, width, height } on success. Max ~4 MB on Vercel
// Hobby; larger uploads should be resized on the client first.
// =======================================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
// Increase body size limit for this route (still bounded by Vercel).
export const maxDuration = 30;

const BUCKET = "paintings";

export async function POST(req: Request) {
  if (!isAdmin()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!rawUrl || !serviceKey) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
    }
    // Validate URL early so we can give a clearer error than "malformed".
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
    // Accept any image/* MIME, plus HEIC/HEIF which some browsers send with
    // application/octet-stream when dragged in from Finder.
    const looksLikeImage =
      file.type.startsWith("image/") ||
      /\.(heic|heif|jpe?g|png|webp|gif|avif|tiff?|bmp)$/i.test(
        (form.get("filename") as string) || "",
      );
    if (!looksLikeImage) {
      return NextResponse.json({ error: "File must be an image." }, { status: 400 });
    }

    // Build a unique, hopefully-readable path. Preserve the original extension
    // so HEIC uploads stay HEIC, PNG stays PNG, etc.
    const originalName = (form.get("filename") as string) || "painting";
    const safe = originalName
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/-+/g, "-");
    const nameExt = safe.match(/\.([a-z0-9]+)$/)?.[1];
    const typeExt = file.type.split("/")[1]?.replace(/[^a-z0-9]/g, "");
    const ext = nameExt || typeExt || "jpg";
    const stamp = Date.now();
    const path = `${stamp}-${safe.replace(/\.[^.]+$/, "")}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Fall back to a sensible content-type if the browser didn't send one.
    const mimeByExt: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      avif: "image/avif",
      heic: "image/heic",
      heif: "image/heif",
      tif: "image/tiff",
      tiff: "image/tiff",
      bmp: "image/bmp",
    };
    const contentType =
      file.type && file.type.startsWith("image/")
        ? file.type
        : mimeByExt[ext] || "application/octet-stream";

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType,
        upsert: false,
        cacheControl: "31536000",
      });
    if (upErr) throw upErr;

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ ok: true, url: publicUrl, path });
  } catch (err) {
    console.error("[api/admin/upload]", err);
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
