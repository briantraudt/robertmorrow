"use client";

// Renders the overlay version of <Detail> only when context.detail is set.
import { useCart } from "./cart-provider";
import Detail from "./detail";

export default function DetailOverlay() {
  const { detail } = useCart();
  if (!detail) return null;
  return <Detail />;
}
