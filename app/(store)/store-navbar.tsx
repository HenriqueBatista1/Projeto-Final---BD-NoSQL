"use client";

import { Navbar } from "@/components/ui/navbar";
import { useCart } from "@/components/cart/cart-context";
import { logoutAction } from "../actions/auth";

export function StoreNavbar({ userName }: { userName?: string }) {
  const { totalItems, openCart } = useCart();

  async function handleLogout() {
    const result = await logoutAction();
    if (result && !result.success) {
      console.error("Erro ao encerrar sessão:", result.error);
    }
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
