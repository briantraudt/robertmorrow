// =======================================================================
// Cart + UI state context. Everything that needs cart data or the detail/
// drawer/toast state hangs off this provider.
// =======================================================================
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import type { Painting } from "@/lib/types";

const STORAGE_KEY = "rm-cart";

type CartContextType = {
  cart: Painting[];
  cartOpen: boolean;
  detail: Painting | null;
  toast: string | null;
  addToCart: (p: Painting) => void;
  removeFromCart: (index: number) => void;
  clearCart: () => void;
  removePurchased: (ids: string[]) => void;
  hydrated: boolean;
  openCart: () => void;
  closeCart: () => void;
  openDetail: (p: Painting) => void;
  closeDetail: () => void;
  isInCart: (id: string) => boolean;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [cart, setCart] = useState<Painting[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<Painting | null>(null);
  const detailRef = useRef<Painting | null>(null);
  detailRef.current = detail;
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) setCart(data.filter((p, index) => p && typeof p.id === "string" && typeof p.title === "string" && Number.isFinite(p.price) && p.status !== "sold" && data.findIndex((q) => q?.id === p.id) === index).slice(0, 10));
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  // Persist after hydration (so we don't wipe saved cart on first render)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, hydrated]);

  // Refresh other buyers' sales, prices and artwork changes in already-open tabs.
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await fetch("/api/inventory", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !Array.isArray(data.paintings)) return;
        const paintings = data.paintings as Painting[];
        const byId = new Map(paintings.map((p) => [p.id, p]));
        setCart((current) => current.flatMap((old) => {
          const fresh = byId.get(old.id);
          return fresh && fresh.status !== "sold" ? [fresh] : [];
        }));
        setDetail((current) => current ? byId.get(current.id) ?? { ...current, status: "sold" } : null);
        if (!detailRef.current) router.refresh();
      } catch { /* Keep the cart during an outage; checkout validates on the server. */ }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [hydrated, router]);

  const isInCart = useCallback(
    (id: string) => cart.some((p) => p.id === id),
    [cart],
  );

  const addToCart = useCallback((p: Painting) => {
    if (p.status !== "available") return;
    setCart((current) => {
      if (current.some((c) => c.id === p.id)) return current;
      return [...current, p];
    });
    setDetail(null);
    setToast(p.title);
    window.setTimeout(() => setToast((t) => (t === p.title ? null : t)), 2200);
    window.setTimeout(() => setCartOpen(true), 300);
  }, []);

  const removeFromCart = useCallback((index: number) => {
    setCart((c) => c.filter((_, i) => i !== index));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);
  const removePurchased = useCallback((ids: string[]) => {
    setCart((current) => current.filter((p) => !ids.includes(p.id)));
    router.refresh();
  }, [router]);
  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const openDetail = useCallback((p: Painting) => setDetail(p), []);
  const closeDetail = useCallback(() => setDetail(null), []);

  const value = useMemo<CartContextType>(
    () => ({
      cart,
      cartOpen,
      detail,
      toast,
      addToCart,
      removeFromCart,
      clearCart,
      removePurchased,
      hydrated,
      openCart,
      closeCart,
      openDetail,
      closeDetail,
      isInCart,
    }),
    [
      cart,
      cartOpen,
      detail,
      toast,
      addToCart,
      removeFromCart,
      clearCart,
      removePurchased,
      hydrated,
      openCart,
      closeCart,
      openDetail,
      closeDetail,
      isInCart,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
