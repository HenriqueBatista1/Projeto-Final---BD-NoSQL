"use client";

import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { logoutAction } from "../actions/auth";

export function StoreNavbar({ userName }: { userName?: string }) {
  async function handleLogout() {
    await logoutAction();
  }

  // Se o usuário não estiver logado, exibe um link para ir ao login
  if (!userName) {
    return (
      <header className="border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
        <nav
          aria-label="Navegação principal"
          className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        >
          <Link href="/" className="text-lg font-bold tracking-tight text-indigo-700">
            Polyglot Store
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              Entrar
            </Link>
          </div>
        </nav>
      </header>
    );
  }

  return <Navbar userName={userName} onLogout={handleLogout} />;
}