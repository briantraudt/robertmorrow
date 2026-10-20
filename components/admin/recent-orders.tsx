import "server-only";
import type { Painting } from "@/lib/types";

export type StudioOrder = {
  id: string; created_at: string; painting_ids: string[] | null;
  name: string | null; email: string | null; amount_total: number;
  currency: string; stripe_payment_intent: string | null;
  stripe_session_id: string | null; shipping_address: unknown;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function deliveryLines(value: unknown) {
  const shipping = object(value);
  const address = shipping.address ? object(shipping.address) : shipping;
  return [text(shipping.name), text(address.line1), text(address.line2),
    [text(address.city), text(address.state), text(address.postal_code)].filter(Boolean).join(", "),
    text(address.country)].filter(Boolean);
}

export default function RecentOrders({ orders, paintings, unavailable }: {
  orders: StudioOrder[]; paintings: Painting[]; unavailable: boolean;
}) {
  return (
    <section style={{ marginTop: 48 }} aria-labelledby="studio-orders-title">
      <h2 id="studio-orders-title" className="serif" style={{ fontSize: 30, fontWeight: 400, marginBottom: 10 }}>Recent orders</h2>
      <p className="muted" style={{ fontSize: 12, marginBottom: 18 }}>The 25 most recently recorded paid orders. Buyer and delivery details are private to Studio.</p>
      {unavailable ? <p role="alert" className="muted">Orders could not be loaded. Please refresh and try again.</p>
        : orders.length === 0 ? <p className="muted" style={{ fontSize: 13 }}>No paid orders have been recorded yet.</p>
        : <div style={{ borderTop: "1px solid var(--line)" }}>{orders.map((order) => {
          const titles = (order.painting_ids ?? []).map((id) => paintings.find((painting) => painting.id === id)?.title ?? `Painting ${id}`);
          const delivery = deliveryLines(order.shipping_address);
          const date = new Date(order.created_at);
          const recorded = Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" : "Date unavailable";
          const currency = /^[a-z]{3}$/i.test(order.currency ?? "") ? order.currency.toUpperCase() : "USD";
          const total = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(order.amount_total / 100);
          return <article key={order.id} style={{ padding: "22px 0", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 14 }}>
              <div><h3 className="serif italic" style={{ fontSize: 22, fontWeight: 400 }}>{titles.join(" · ") || "Painting purchase"}</h3>
                <p className="muted" style={{ fontSize: 11, marginTop: 5 }}>Recorded {recorded}</p></div>
              <div><span className="serif" style={{ fontSize: 24 }}>{total}</span><span className="small-caps muted" style={{ fontSize: 9, marginLeft: 12 }}>Paid</span></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: 22, fontSize: 13, lineHeight: 1.65 }}>
              <div><p className="small-caps muted" style={{ fontSize: 9, marginBottom: 6 }}>Buyer</p><p>{order.name || "Name not provided"}</p><p style={{ overflowWrap: "anywhere" }}>{order.email || "Email not provided"}</p></div>
              <div><p className="small-caps muted" style={{ fontSize: 9, marginBottom: 6 }}>Delivery</p>{delivery.length ? delivery.map((line, i) => <p key={i}>{line}</p>) : <p className="muted">Delivery details not provided.</p>}</div>
              <div><p className="small-caps muted" style={{ fontSize: 9, marginBottom: 6 }}>Payment reference</p><p style={{ overflowWrap: "anywhere", fontSize: 11 }}>{order.stripe_payment_intent || order.stripe_session_id || order.id}</p></div>
            </div>
          </article>;
        })}</div>}
    </section>
  );
}
