// =======================================================================
// /admin — protected list of all paintings.
// =======================================================================

import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import { getPaintings } from "@/lib/paintings";
import AdminChrome from "@/components/admin/admin-chrome";
import RecentOrders, { type StudioOrder } from "@/components/admin/recent-orders";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic"; // always fresh on admin

export default async function AdminHome() {
  await requireAdmin();
  const paintings = await getPaintings();
  const { data: offers, error: offersError } = await createServerSupabaseClient()
    .from("offers")
    .select("id, token, painting_id, name, amount, status, created_at")
    .order("created_at", { ascending: false })
    .limit(25);
  if (offersError) console.error("[admin] Could not load recent offers", { code: offersError.code });
  const { data: orders, error: ordersError } = await createServerSupabaseClient()
    .from("orders")
    .select("id, created_at, painting_ids, name, email, amount_total, currency, stripe_payment_intent, stripe_session_id, shipping_address")
    .eq("status", "paid").order("created_at", { ascending: false }).limit(25);
  if (ordersError) console.error("[admin] Could not load recent orders", { code: ordersError.code });

  const available = paintings.filter((p) => p.status === "available").length;
  const sold = paintings.filter((p) => p.status === "sold").length;
  const reserved = paintings.filter((p) => p.status === "reserved").length;

  return (
    <AdminChrome>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
          gap: 20,
          marginBottom: 28,
        }}
      >
        <div>
          <h1 className="serif" style={{ fontSize: 36, fontWeight: 400, marginBottom: 6 }}>
            Paintings
          </h1>
          <p className="muted" style={{ fontSize: 13 }}>
            {paintings.length} total · {available} available · {reserved} reserved · {sold} sold
            {" · "}<a href="#studio-orders-title" style={{ textDecoration: "underline" }}>Recent orders</a>
          </p>
        </div>
        <Link
          href="/admin/paintings/new"
          className="small-caps"
          style={{
            padding: "12px 22px",
            background: "var(--ink)",
            color: "var(--paper)",
            fontSize: 11,
            letterSpacing: "0.22em",
          }}
        >
          + New painting
        </Link>
      </div>

      <div style={{ border: "1px solid var(--line)", overflowX: "auto" }}>
        <div
          className="small-caps muted"
          style={{
            display: "grid",
            minWidth: 720,
            gridTemplateColumns: "60px minmax(0,2fr) 1fr 100px 100px 100px",
            gap: 14,
            padding: "14px 18px",
            fontSize: 9.5,
            letterSpacing: "0.2em",
            borderBottom: "1px solid var(--line-2)",
            background: "var(--paper-2)",
          }}
        >
          <div />
          <div>Title</div>
          <div>Medium / Size</div>
          <div>Price</div>
          <div>Status</div>
          <div />
        </div>
        {paintings.map((p) => {
          const primary = p.images?.find((i) => i.is_primary) ?? p.images?.[0];
          return (
            <div
              key={p.id}
              style={{
                display: "grid",
                minWidth: 720,
                gridTemplateColumns: "60px minmax(0,2fr) 1fr 100px 100px 100px",
                gap: 14,
                padding: "14px 18px",
                alignItems: "center",
                borderBottom: "1px solid var(--line-2)",
                fontSize: 14,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  background: "var(--paper-2)",
                  overflow: "hidden",
                }}
              >
                {primary ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={primary.url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : null}
              </div>
              <div>
                <div className="serif italic" style={{ fontSize: 16 }}>
                  {p.title}
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {p.year > 0 ? p.year : "Year not set"}
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {p.medium}
                <br />
                {p.w}″ × {p.h}″
              </div>
              <div className="serif">{p.price > 0 ? `$${p.price}` : "Not set"}</div>
              <div>
                <StatusPill status={p.status} />
              </div>
              <div style={{ textAlign: "right" }}>
                <Link
                  href={`/admin/paintings/${p.id}`}
                  className="small-caps"
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.22em",
                    color: "var(--ink)",
                    borderBottom: "1px solid var(--ink)",
                    paddingBottom: 2,
                  }}
                >
                  Edit
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <RecentOrders orders={(orders ?? []) as StudioOrder[]} paintings={paintings} unavailable={!!ordersError} />
      <section style={{ marginTop: 48 }} aria-labelledby="studio-offers-title">
        <h2 id="studio-offers-title" className="serif" style={{ fontSize: 30, fontWeight: 400, marginBottom: 18 }}>
          Recent offers
        </h2>
        {offersError ? (
          <p role="alert" className="muted">Offers could not be loaded. Please refresh and try again.</p>
        ) : !offers?.length ? (
          <p className="muted" style={{ fontSize: 13 }}>No offers yet.</p>
        ) : (
          <div style={{ borderTop: "1px solid var(--line)" }}>
            {offers.map((offer) => (
              <Link key={offer.id} href={`/admin/offers/${offer.token}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", padding: "18px 0", borderBottom: "1px solid var(--line)" }}>
                <div>
                  <div className="serif italic" style={{ fontSize: 18 }}>{paintings.find((painting) => painting.id === offer.painting_id)?.title ?? "Painting removed from website"}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{offer.name}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <span className="serif" style={{ fontSize: 20 }}>${offer.amount.toLocaleString("en-US")}</span>
                  <span className="small-caps muted" style={{ fontSize: 10 }}>{offer.status}</span>
                  <span aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AdminChrome>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === "sold" ? "#a42f2f" : status === "reserved" ? "#8B6F47" : "var(--ink-3)";
  return (
    <span
      className="small-caps"
      style={{
        fontSize: 9,
        letterSpacing: "0.22em",
        padding: "4px 8px",
        border: `1px solid ${color}`,
        color,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}
