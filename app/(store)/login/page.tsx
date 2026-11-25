"use client";

import { useActionState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { loginAction, type LoginActionResult } from "../../actions/auth";

const initialState: LoginActionResult = {
  success: false,
};

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Acessar Conta
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Entre com suas credenciais para gerenciar seus pedidos e compras.
          </p>
        </div>

        {/* Mensagem de erro retornada pelo backend */}
        {state?.error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </div>
        )}

        <form action={formAction} className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              E-mail
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu.email@exemplo.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Senha
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full py-2.5">
            {isPending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}