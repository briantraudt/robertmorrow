import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import AdminChrome from "@/components/admin/admin-chrome";
import PaintingForm from "@/components/admin/painting-form";

export const dynamic = "force-dynamic";

export default async function NewPaintingPage() {
  requireAdmin();
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
          className="serif"
          style={{ fontSize: 36, fontWeight: 400, marginTop: 8 }}
        >
          New painting
        </h1>
      </div>
      <PaintingForm mode="create" />
    </AdminChrome>
  );
}
