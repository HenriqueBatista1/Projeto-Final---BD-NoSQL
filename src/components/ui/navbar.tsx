"use client";

import Link from "next/link";

import { Button } from "./button";

export type NavbarProps = {
  userName?: string;
  onLogout?: () => void;
};

export function Navbar({ userName, onLogout }: NavbarProps) {
  return (
    <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <nav
        aria-label="Navegação principal"
        className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
      >
        <Link href="/" className="text-brand-800 text-lg font-bold tracking-tight">
          Polyglot Store
        </Link>
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            href="/orders"
            className="focus-visible:outline-brand-700 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Meus Pedidos
          </Link>
          {userName ? <span className="hidden text-sm text-slate-600 md:inline">Olá, {userName}</span> : null}
          <Button variant="ghost" size="sm" onClick={onLogout} disabled={!onLogout}>
            Sair
          </Button>
        </div>
      </nav>
    </header>
  );
}
