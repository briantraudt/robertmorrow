export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const PAINTING_ID_PATTERN = /^[a-zA-Z0-9_-]{1,160}$/;

export class CheckoutError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function text(value: unknown, name: string, max: number, optional = false): string {
  if (optional && (value === undefined || value === null || value === "")) return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new CheckoutError(`Please enter a valid ${name}.`);
  return value.trim();
}

export function validateCheckoutBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new CheckoutError("Invalid checkout request.");
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 10) throw new CheckoutError("Choose between 1 and 10 paintings.");
  const ids = value.items.map((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !PAINTING_ID_PATTERN.test(item.id)) throw new CheckoutError("Invalid painting in your cart. Please add it again.");
    return item.id as string;
  });
  if (new Set(ids).size !== ids.length) throw new CheckoutError("Each original painting can only be purchased once.");
  if (value.reservationId !== undefined && (typeof value.reservationId !== "string" || !UUID_PATTERN.test(value.reservationId))) throw new CheckoutError("Invalid checkout reference.");
  const email = text(value.email, "email address", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CheckoutError("Please enter a valid email address.");
  const name = text(value.name, "full name", 120);
  if (!value.address || typeof value.address !== "object" || Array.isArray(value.address)) throw new CheckoutError("Please enter your delivery address.");
  const addr = value.address as Record<string, unknown>;
  const country = text(addr.country ?? "US", "country", 2).toUpperCase();
  if (country !== "US") throw new CheckoutError("Online checkout currently supports US delivery. Please contact Robert for other destinations.");
  const address = {
    line1: text(addr.line1, "street address", 200), line2: text(addr.line2, "apartment or suite", 200, true),
    city: text(addr.city, "city", 100), state: text(addr.state, "state", 100),
    postal_code: text(addr.postal_code, "ZIP code", 10), country,
  };
  if (!/^\d{5}(?:-\d{4})?$/.test(address.postal_code)) throw new CheckoutError("Please enter a valid US ZIP code.");
  return { ids: ids.sort(), reservationId: value.reservationId as string | undefined, buyer: { email, name, address } };
}
