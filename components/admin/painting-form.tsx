"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Painting } from "@/lib/types";

type Mode = "create" | "edit";

type Props = {
  mode: Mode;
  painting?: Painting;
};

type FormState = {
  title: string;
  year: string;
  medium: string;
  w: string;
  h: string;
  price: string;
  status: "available" | "sold" | "reserved";
  framing: string;
  note: string;
  sort_order: string;
};

const CLIENT_UPLOAD_MAX_BYTES = 3.75 * 1024 * 1024;
const CLIENT_DIRECT_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
const CLIENT_IMAGE_MAX_EDGE = 2200;
const CLIENT_JPEG_QUALITIES = [0.86, 0.76, 0.66];

async function readJson<T extends { error?: string }>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (res.status === 413 || /request entity too large/i.test(text)) {
      throw new Error("That image is too large to upload. Choose a smaller file or export it as a JPEG first.");
    }
    throw new Error(text.slice(0, 180) || "Server returned an unreadable response.");
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try exporting it as a JPEG or PNG."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not prepare image for upload."));
      },
      "image/jpeg",
      quality,
    );
  });
}

function isHeicFile(file: File) {
  return (
    /hei[cf]/i.test(file.type) ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

async function prepareUploadFile(file: File): Promise<File> {
  if (isHeicFile(file)) {
    if (file.size <= CLIENT_DIRECT_UPLOAD_MAX_BYTES) return file;
    throw new Error("That HEIC image is too large to upload. Choose a file under 12 MB or export it as a JPEG first.");
  }

  if (file.size <= CLIENT_UPLOAD_MAX_BYTES && file.type === "image/jpeg") {
    return file;
  }

  const img = await loadImage(file);
  const scale = Math.min(1, CLIENT_IMAGE_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare image for upload.");
  ctx.drawImage(img, 0, 0, width, height);

  let best: Blob | null = null;
  for (const quality of CLIENT_JPEG_QUALITIES) {
    const blob = await canvasToBlob(canvas, quality);
    best = blob;
    if (blob.size <= CLIENT_UPLOAD_MAX_BYTES) break;
  }

  if (!best || best.size > CLIENT_UPLOAD_MAX_BYTES) {
    throw new Error("That image is too large to upload. Choose a smaller file or export it as a JPEG first.");
  }

  const name = file.name.replace(/\.[^.]+$/, "") || "painting";
  return new File([best], `${name}.jpg`, { type: "image/jpeg" });
}

export default function PaintingForm({ mode, painting }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    title: painting?.title ?? "",
    year: painting?.year ? String(painting.year) : "",
    medium: painting?.medium ?? "Acrylic on canvas",
    w: painting?.w ? String(painting.w) : "",
    h: painting?.h ? String(painting.h) : "",
    price: painting?.price ? String(painting.price) : "",
    status: (painting?.status as "available" | "sold" | "reserved") ?? "available",
    framing: painting?.framing ?? "Unframed; shipped flat",
    note: painting?.note ?? "",
    sort_order: "",
  }));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(
    painting?.images?.find((i) => i.is_primary)?.url ||
      painting?.images?.[0]?.url ||
      null,
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFileLabel, setSelectedFileLabel] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(isHeicFile(f) ? null : URL.createObjectURL(f));
    setSelectedFileLabel(
      isHeicFile(f)
        ? `${f.name} selected; it will be converted to JPEG after upload.`
        : `${f.name} selected; it will be compressed before upload.`,
    );
    setError(null);
  }

  async function uploadImage(): Promise<{ url: string; width?: number; height?: number } | null> {
    if (!file) return null;
    const uploadFile = await prepareUploadFile(file);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("filename", uploadFile.name);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = await readJson<{ error?: string; url?: string; width?: number; height?: number }>(res);
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    if (!data.url) throw new Error("Upload failed.");
    return { url: data.url, width: data.width, height: data.height };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let uploadedImage: { url: string; width?: number; height?: number } | null = null;
      if (file) uploadedImage = await uploadImage();

      const payload: Record<string, string | number | null> = {
        title: form.title,
        year: form.year.trim() ? Number(form.year) : 0,
        series: painting?.series ?? "abstract",
        medium: form.medium,
        w: Number(form.w),
        h: Number(form.h),
        price: Number(form.price),
        status: form.status,
        framing: form.framing || null,
        note: form.note || null,
      };
      if (form.sort_order) payload.sort_order = Number(form.sort_order);
      if (uploadedImage) {
        payload.imageUrl = uploadedImage.url;
        payload.imageWidth = uploadedImage.width ?? null;
        payload.imageHeight = uploadedImage.height ?? null;
      }

      const url =
        mode === "create"
          ? "/api/admin/paintings"
          : `/api/admin/paintings/${painting!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Save failed.");

      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!painting) return;
    if (
      !confirm(
        `Delete "${painting.title}"? This cannot be undone and will remove any related offer records.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/paintings/${painting.id}`, {
        method: "DELETE",
      });
      const data = await readJson<{ error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Delete failed.");
      router.push("/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 32 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) 2fr",
          gap: 40,
          alignItems: "start",
        }}
      >
        {/* Image */}
        <div>
          <label
            className="small-caps muted"
            style={{ fontSize: 10, letterSpacing: "0.22em", display: "block", marginBottom: 10 }}
          >
            Photograph
          </label>
          <div
            onClick={() => fileInput.current?.click()}
            style={{
              aspectRatio: "4 / 5",
              background: "var(--paper-2)",
              border: "1px dashed var(--line)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              overflow: "hidden",
            }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="preview"
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <span className="muted small-caps" style={{ fontSize: 10.5 }}>
                {file && isHeicFile(file) ? "HEIC selected" : "Click to upload"}
              </span>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,.heic,.heif"
            onChange={onFileChange}
            style={{ display: "none" }}
          />
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="small-caps"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.22em",
                color: "var(--ink)",
                borderBottom: "1px solid var(--ink)",
                paddingBottom: 2,
              }}
            >
              {preview || selectedFileLabel ? "Replace image" : "Choose image"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
            JPEG, PNG, WebP, or HEIC — large photos are compressed before upload; HEIC photos are converted on the server.
          </p>
          {selectedFileLabel ? (
            <p className="muted" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
              {selectedFileLabel}
            </p>
          ) : null}
        </div>

        {/* Fields */}
        <div style={{ display: "grid", gap: 22 }}>
          <Field label="Title">
            <input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Year (optional)">
            <input
              type="number"
              value={form.year}
              onChange={(e) => update("year", e.target.value)}
              style={inputStyle}
            />
          </Field>

          <Field label="Medium">
            <input
              value={form.medium}
              onChange={(e) => update("medium", e.target.value)}
              required
              placeholder="Acrylic on canvas"
              style={inputStyle}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18 }}>
            <Field label="Width (in)">
              <input
                type="number"
                value={form.w}
                onChange={(e) => update("w", e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Height (in)">
              <input
                type="number"
                value={form.h}
                onChange={(e) => update("h", e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Price (USD)">
              <input
                type="number"
                value={form.price}
                onChange={(e) => update("price", e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) =>
                  update("status", e.target.value as "available" | "sold" | "reserved")
                }
                style={inputStyle}
              >
                <option value="available">Available</option>
                <option value="reserved">Reserved</option>
                <option value="sold">Sold</option>
              </select>
            </Field>
            <Field label="Sort order (optional)">
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => update("sort_order", e.target.value)}
                placeholder="Leave blank"
                style={inputStyle}
              />
            </Field>
          </div>

          <Field label="Framing">
            <input
              value={form.framing}
              onChange={(e) => update("framing", e.target.value)}
              placeholder="Unframed; shipped flat"
              style={inputStyle}
            />
          </Field>

          <Field label="Note (internal)">
            <textarea
              value={form.note}
              onChange={(e) => update("note", e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </Field>
        </div>
      </div>

      {error && (
        <div
          style={{
            color: "#a42f2f",
            fontSize: 13,
            padding: "12px 16px",
            background: "rgba(164,47,47,0.06)",
            border: "1px solid rgba(164,47,47,0.25)",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          paddingTop: 24,
          borderTop: "1px solid var(--line-2)",
        }}
      >
        <div>
          {mode === "edit" && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="small-caps"
              style={{
                fontSize: 10.5,
                letterSpacing: "0.22em",
                color: "#a42f2f",
                opacity: deleting ? 0.5 : 1,
              }}
            >
              {deleting ? "Deleting…" : "Delete painting"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="small-caps"
            style={{
              padding: "12px 22px",
              fontSize: 11,
              letterSpacing: "0.22em",
              color: "var(--ink)",
              border: "1px solid var(--line)",
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="small-caps"
            style={{
              padding: "12px 22px",
              background: "var(--ink)",
              color: "var(--paper)",
              fontSize: 11,
              letterSpacing: "0.22em",
              opacity: saving ? 0.5 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving…" : mode === "create" ? "Create painting" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="small-caps muted"
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          display: "block",
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  fontSize: 14,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: "var(--body)",
};
