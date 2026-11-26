import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../actions/auth";
import { StoreNavbar } from "./store-navbar";
import { CartProvider } from "@/components/cart/cart-context";
import { CartDrawer } from "@/components/cart/cart-drawer";

export default async function StoreLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <CartProvider>
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <StoreNavbar userName={session.name} />
        <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </main>
        <CartDrawer />
        <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          Polyglot Store · Persistência poliglota com PostgreSQL, MongoDB e Redis
        </footer>
      </div>
    </CartProvider>
  );
}