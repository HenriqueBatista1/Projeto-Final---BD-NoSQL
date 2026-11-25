import type { ReactNode } from "react";

import { Navbar } from "@/components/ui/navbar";

export default function StoreLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        Polyglot Store · Persistência poliglota com PostgreSQL, MongoDB e Redis
      </footer>
    </div>
  );
}
