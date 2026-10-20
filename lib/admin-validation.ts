export class InputError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "InputError";
  }
}

export function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InputError("Please provide a valid form.");
  }
  return value as Record<string, unknown>;
}

export async function readFormJson(req: Request): Promise<Record<string, unknown>> {
  const maxBytes = 64 * 1024;
  if (Number(req.headers.get("content-length") || "0") > maxBytes) {
    throw new InputError("The form is too large.", 413);
  }
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new InputError("The form is too large.", 413);
  }
  try {
    return objectInput(JSON.parse(raw));
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError("Please provide a valid form.");
  }
}

export function textInput(value: unknown, label: string, max: number, required = false): string {
  if (value == null && !required) return "";
  if (typeof value !== "string") throw new InputError(`${label} is invalid.`);
  const text = value.trim();
  if (required && !text) throw new InputError(`${label} is required.`);
  if (text.length > max) throw new InputError(`${label} must be ${max} characters or fewer.`);
  return text;
}

export function emailInput(value: unknown): string {
  const email = textInput(value, "Email", 254, true);
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new InputError("Please enter a valid email address.");
  }
  return email;
}

export function safeStripeCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["checkout.stripe.com", "buy.stripe.com"].includes(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function integerInput(value: unknown, label: string, min: number, max = 2147483647): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new InputError(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return value;
}

export function validateContact(value: unknown) {
  const body = objectInput(value);
  const name = textInput(body.name, "Name", 160, true);
  const subject = textInput(body.subject, "Subject", 200) || "Contact";
  if (/[\r\n]/.test(name + subject)) throw new InputError("Name and subject must each be one line.");
  return { name, email: emailInput(body.email), subject, message: textInput(body.message, "Message", 10000, true) };
}

export function validateOffer(value: unknown) {
  const body = objectInput(value);
  const painting_id = textInput(body.painting_id, "Painting", 200, true);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(painting_id)) throw new InputError("Painting is invalid.");
  return {
    painting_id,
    amount: integerInput(body.amount, "Offer", 1, 999999),
    name: textInput(body.name, "Name", 160, true),
    email: emailInput(body.email),
    phone: textInput(body.phone, "Phone", 80),
    message: textInput(body.message, "Message", 10000),
  };
}

export function validatePainting(value: unknown, create = false) {
  const body = objectInput(value);
  const fields: Record<string, string | number | null> = {};
  for (const field of ["title", "medium"] as const) {
    if (create || field in body) fields[field] = textInput(body[field], field === "title" ? "Title" : "Medium", 240, true);
  }
  for (const field of ["w", "h", "price"] as const) {
    if (create || field in body) fields[field] = integerInput(body[field], { w: "Width", h: "Height", price: "Price" }[field], field === "price" ? 0 : 1, field === "price" ? 999999 : 2147483647);
  }
  if ("year" in body || create) fields.year = integerInput(body.year ?? 0, "Year", 0, 9999);
  if ("sort_order" in body) fields.sort_order = body.sort_order == null || body.sort_order === "" ? null : integerInput(body.sort_order, "Sort order", -2147483648);
  if ("status" in body || create) {
    const status = body.status ?? "available";
    if (typeof status !== "string" || !["available", "reserved", "sold"].includes(status)) throw new InputError("Status is invalid.");
    fields.status = status;
  }
  if ("series" in body || create) {
    const series = body.series ?? "abstract";
    if (typeof series !== "string" || !["abstract", "nature"].includes(series)) throw new InputError("Series is invalid.");
    fields.series = series;
  }
  for (const field of ["note", "framing"] as const) {
    if (field in body) fields[field] = textInput(body[field], field === "note" ? "Note" : "Framing", field === "note" ? 10000 : 500) || null;
  }
  let image: { url: string; alt: string; width: number | null; height: number | null } | null = null;
  if (body.imageUrl) {
    const url = textInput(body.imageUrl, "Image URL", 2048, true);
    const storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    let valid = false;
    try {
      const parsed = new URL(url);
      valid = parsed.protocol === "https:" && !!storageUrl && parsed.origin === new URL(storageUrl).origin && parsed.pathname.startsWith("/storage/v1/object/public/paintings/");
    } catch { /* rejected below */ }
    if (!valid) throw new InputError("Please upload the photograph using Choose image.");
    image = {
      url,
      alt: textInput(body.imageAlt, "Image description", 500),
      width: body.imageWidth == null ? null : integerInput(body.imageWidth, "Image width", 1, 50000),
      height: body.imageHeight == null ? null : integerInput(body.imageHeight, "Image height", 1, 50000),
    };
  }
  return { fields, image };
}
