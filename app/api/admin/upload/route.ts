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
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image." }, { status: 400 });
    }

    // Build a unique, hopefully-readable path.
    const originalName = (form.get("filename") as string) || "painting";
    const safe = originalName
      .toLowerCase()
      .replace(/[^a-z0-9.-]/g, "-")
      .replace(/-+/g, "-");
    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
    const stamp = Date.now();
    const path = `${stamp}-${safe.replace(/\.[^.]+$/, "")}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
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
