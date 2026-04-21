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
  series: "abstract" | "nature";
  medium: string;
  w: string;
  h: string;
  price: string;
  status: "available" | "sold" | "reserved";
  note: string;
  slug: string;
  sort_order: string;
};

export default function PaintingForm({ mode, painting }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    title: painting?.title ?? "",
    year: painting?.year ? String(painting.year) : String(new Date().getFullYear()),
    series: (painting?.series as "abstract" | "nature") ?? "abstract",
    medium: painting?.medium ?? "Oil on linen",
    w: painting?.w ? String(painting.w) : "",
    h: painting?.h ? String(painting.h) : "",
    price: painting?.price ? String(painting.price) : "",
    status: (painting?.status as "available" | "sold" | "reserved") ?? "available",
    note: painting?.note ?? "",
    slug: painting?.slug ?? "",
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
  const fileInput = useRef<HTMLInputElement>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function uploadImage(): Promise<string | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("filename", file.name);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    return data.url as string;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (file) imageUrl = await uploadImage();

      const payload: Record<string, string | number | null> = {
        title: form.title,
        year: Number(form.year),
        series: form.series,
        medium: form.medium,
        w: Number(form.w),
        h: Number(form.h),
        price: Number(form.price),
        status: form.status,
        note: form.note || null,
        slug: form.slug || undefined as unknown as string,
      };
      if (form.sort_order) payload.sort_order = Number(form.sort_order);
      if (imageUrl) payload.imageUrl = imageUrl;

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
      const data = await res.json();
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
        `Delete "${painting.title}"? This cannot be undone. (Painting must have no offers on record.)`,
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
      const data = await res.json();
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
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span className="muted small-caps" style={{ fontSize: 10.5 }}>
                Click to upload
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
              {preview ? "Replace image" : "Choose image"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.5 }}>
            JPEG, PNG, WebP, HEIC, or GIF. 4MB max. Large photos may fail — resize first.
          </p>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Field label="Year">
              <input
                type="number"
                value={form.year}
                onChange={(e) => update("year", e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Series">
              <select
                value={form.series}
                onChange={(e) => update("series", e.target.value as "abstract" | "nature")}
                style={inputStyle}
              >
                <option value="abstract">Abstract</option>
                <option value="nature">Nature</option>
              </select>
            </Field>
          </div>

          <Field label="Medium">
            <input
              value={form.medium}
              onChange={(e) => update("medium", e.target.value)}
              required
              placeholder="Oil on linen"
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

          <Field label="Slug (optional — auto from title)">
            <input
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
              placeholder="auto-generated"
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
