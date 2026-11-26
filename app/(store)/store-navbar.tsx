"use client";

import { Navbar } from "@/components/ui/navbar";
import { useCart } from "@/components/cart/cart-context";
import { logoutAction } from "../actions/auth";

export function StoreNavbar({ userName }: { userName?: string }) {
  const { totalItems, openCart } = useCart();

  async function handleLogout() {
    await logoutAction();
  }

  return (
    <Navbar
      userName={userName}
      onLogout={handleLogout}
      cartCount={totalItems}
      onCartClick={openCart}
    />
  );
}
