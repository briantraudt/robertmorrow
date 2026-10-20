import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getPainting } from "@/lib/paintings";
import AdminChrome from "@/components/admin/admin-chrome";
import PaintingForm from "@/components/admin/painting-form";

export const dynamic = "force-dynamic";

export default async function EditPaintingPage(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  await requireAdmin(`/admin/paintings/${encodeURIComponent(params.id)}`);
  const painting = await getPainting(params.id);
  if (!painting) notFound();

  return (
    <AdminChrome>
      <div style={{ marginBottom: 28 }}>
        <Link
          href="/admin"
          className="small-caps muted"
          style={{ fontSize: 10.5, letterSpacing: "0.22em" }}
        >
          ← Paintings
        </Link>
        <h1
          className="serif italic"
          style={{ fontSize: 36, fontWeight: 400, marginTop: 8 }}
        >
          {painting.title}
        </h1>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          {painting.slug}
        </div>
      </div>
      <PaintingForm mode="edit" painting={painting} />
    </AdminChrome>
  );
}
