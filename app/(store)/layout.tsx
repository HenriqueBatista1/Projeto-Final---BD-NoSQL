import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "../actions/auth";
import { StoreNavbar } from "./store-navbar";

export default async function StoreLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  // 1. Verifica se existe sessão ativa no Redis
  const session = await getCurrentSession();

  // 2. Se NÃO houver usuário logado, redireciona imediatamente para o Login
  if (!session) {
    redirect("/login");
  }

  // 3. Se estiver logado, renderiza a loja com a Navbar contendo o nome dele
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <StoreNavbar userName={session.name} />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
        Polyglot Store · Persistência poliglota com PostgreSQL, MongoDB e Redis
      </footer>
    </div>
  );
}