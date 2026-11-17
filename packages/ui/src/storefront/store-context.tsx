'use client';

import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react';
import type { StoreConfig, StoreProduct } from './types';

export interface CartLine {
  productSlug: string;
  size: string;
  color: string;
  quantity: number;
}

type Overlay = 'cart' | 'menu' | 'search' | 'player' | null;

/** The page's main call to action (e.g. "Add to cart"). A host such as Telegram can render it natively. */
export interface PrimaryAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface StoreContextValue {
  store: StoreConfig;
  products: StoreProduct[];
  variant: 'web' | 'miniapp';
  href: (path?: string) => string;
  productBySlug: (slug: string) => StoreProduct | undefined;
  cart: CartLine[];
  addToCart: (line: CartLine) => void;
  setQuantity: (line: CartLine, quantity: number) => void;
  cartCount: number;
  subtotalMinor: number;
  wishlist: ReadonlySet<string>;
  toggleWishlist: (slug: string) => void;
  overlay: Overlay;
  setOverlay: (overlay: Overlay) => void;
  primaryAction: PrimaryAction | null;
  setPrimaryAction: (action: PrimaryAction | null) => void;
  /** True when the host shows primaryAction itself (Telegram MainButton) — pages then hide their own bar. */
  nativePrimary: boolean;
  setNativePrimary: (native: boolean) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const sameLine = (a: CartLine, b: CartLine) =>
  a.productSlug === b.productSlug && a.size === b.size && a.color === b.color;

/**
 * Client state for one storefront.
 * shortcut: cart and wishlist live in memory for the phase 3 layout; phase 8 moves them to the API.
 */
export function StoreProvider({
  store,
  products,
  basePath,
  variant = 'web',
  children,
}: {
  store: StoreConfig;
  products: StoreProduct[];
  basePath: string;
  variant?: 'web' | 'miniapp';
  children: ReactNode;
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<ReadonlySet<string>>(new Set());
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [primaryAction, setPrimaryAction] = useState<PrimaryAction | null>(null);
  const [nativePrimary, setNativePrimary] = useState(false);

  const bySlug = useMemo(() => new Map(products.map((p) => [p.slug, p])), [products]);

  const addToCart = useCallback((line: CartLine) => {
    setCart((lines) =>
      lines.some((l) => sameLine(l, line))
        ? lines.map((l) => (sameLine(l, line) ? { ...l, quantity: Math.min(l.quantity + line.quantity, 10) } : l))
        : [...lines, line],
    );
  }, []);

  const setQuantity = useCallback((line: CartLine, quantity: number) => {
    setCart((lines) =>
      quantity <= 0
        ? lines.filter((l) => !sameLine(l, line))
        : lines.map((l) => (sameLine(l, line) ? { ...l, quantity: Math.min(quantity, 10) } : l)),
    );
  }, []);

  const toggleWishlist = useCallback((slug: string) => {
    setWishlist((prev) => {
      const next = new Set(prev);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  }, []);

  const value = useMemo<StoreContextValue>(() => {
    const subtotalMinor = cart.reduce(
      (sum, l) => sum + (bySlug.get(l.productSlug)?.price.amountMinor ?? 0) * l.quantity,
      0,
    );
    return {
      store,
      products,
      variant,
      href: (path = '') => `${basePath}${path}` || '/',
      productBySlug: (slug) => bySlug.get(slug),
      cart,
      addToCart,
      setQuantity,
      cartCount: cart.reduce((n, l) => n + l.quantity, 0),
      subtotalMinor,
      wishlist,
      toggleWishlist,
      overlay,
      setOverlay,
      primaryAction,
      setPrimaryAction,
      nativePrimary,
      setNativePrimary,
    };
  }, [store, products, variant, basePath, bySlug, cart, addToCart, setQuantity, wishlist, toggleWishlist, overlay, primaryAction, nativePrimary]);

  return <StoreContext value={value}>{children}</StoreContext>;
}

export function useStore() {
  const ctx = use(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
