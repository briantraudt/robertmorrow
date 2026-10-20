import type { Painting } from "@/lib/types";

export const CHECKOUT_STORAGE_KEY = "rm-checkout-v1";
export const reservationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutForm = {
  email: string;
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
};

export const emptyCheckoutForm: CheckoutForm = {
  email: "", name: "", address1: "", address2: "", city: "", state: "", zip: "",
};

export type CheckoutDraft = {
  version: 1;
  reservationId: string;
  form: CheckoutForm;
  fingerprint: string;
  items: { id: string; slug: string }[];
  summary: Painting[];
  total?: number;
  expiresAt?: string;
};

export function checkoutFingerprint(items: { id: string }[], form: CheckoutForm) {
  return JSON.stringify({
    ids: items.map((item) => item.id).sort(),
    form,
  });
}

export function readCheckoutDraft(): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as CheckoutDraft;
    if (
      draft.version !== 1 ||
      !reservationIdPattern.test(draft.reservationId) ||
      !draft.form ||
      !Object.keys(emptyCheckoutForm).every((key) => typeof draft.form[key as keyof CheckoutForm] === "string") ||
      !Array.isArray(draft.items) || draft.items.length === 0 ||
      !draft.items.every((item) => typeof item?.id === "string" && typeof item.slug === "string") ||
      !Array.isArray(draft.summary) ||
      !draft.summary.every((item) => typeof item?.id === "string" && typeof item.title === "string" && typeof item.price === "number" && Array.isArray(item.images)) ||
      draft.fingerprint !== checkoutFingerprint(draft.items, draft.form)
    ) return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveCheckoutDraft(draft: CheckoutDraft) {
  // Save the idempotency reference before contacting the server. The Stripe
  // client secret and payment details are never written to browser storage.
  sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearCheckoutDraft(reservationId: string) {
  try {
    if (readCheckoutDraft()?.reservationId === reservationId) {
      sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
    }
  } catch {
    // A released/paid draft is harmless if private browsing disallows removal;
    // the next server verification remains authoritative.
  }
}

export type CheckoutStatus = {
  status: "paid" | "processing" | "pending" | "released";
  paintingIds?: string[];
  orderRef?: string;
};

export async function checkoutRequest<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 15_000);
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "We couldn’t confirm your checkout. Please try again.");
    return data as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
