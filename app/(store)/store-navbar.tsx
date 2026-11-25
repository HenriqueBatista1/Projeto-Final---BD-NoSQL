"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-context";
import { logoutAction } from "../actions/auth";

export function StoreNavbar({ userName }: { userName?: string }) {
  const { totalItems, openCart } = useCart();

  async function handleLogout() {
    await logoutAction();
  }

  return (
    <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <Link href="/" className="text-lg font-bold tracking-tight text-indigo-700">
          Polyglot Store
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/orders"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Meus Pedidos
          </Link>

          {/* Botão do Carrinho com Badge em tempo real */}
          <button
            type="button"
            onClick={openCart}
            className="relative flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <span>🛒 Carrinho</span>
            {totalItems > 0 && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                {totalItems}
              </span>
            )}
          </button>

          {userName && (
            <span className="hidden text-sm text-slate-600 md:inline">
              Olá, {userName}
            </span>
          )}

          <Button variant="ghost" size="sm" onClick={handleLogout}>
            Sair
          </Button>
        </div>
      </nav>
    </header>
  );
}