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
  useState,
} from "react";
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
  openCart: () => void;
  closeCart: () => void;
  openDetail: (p: Painting) => void;
  closeDetail: () => void;
  isInCart: (id: string) => boolean;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Painting[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [detail, setDetail] = useState<Painting | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw));
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

  const isInCart = useCallback(
    (id: string) => cart.some((p) => p.id === id),
    [cart],
  );

  const addToCart = useCallback((p: Painting) => {
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
