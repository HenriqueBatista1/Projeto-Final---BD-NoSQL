"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { registerAction } from "../actions/auth";

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(registerAction, null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <main className="flex min-h-[calc(100vh-10rem)] items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 shadow-sm">
        <h1 className="mb-8 text-center text-2xl font-bold tracking-tight text-slate-900">
          Criar conta
        </h1>

        {state?.error && (
          <p
            role="alert"
            className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {state.error}
          </p>
        )}

        <form action={formAction} className="space-y-5">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Nome
            </label>
            <Input
              id="name"
              name="name"
              autoComplete="name"
              required
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={150}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              aria-describedby="password-hint"
              required
              minLength={8}
              maxLength={128}
            />
            <p id="password-hint" className="mt-1.5 text-sm text-slate-600">
              Use pelo menos 8 caracteres.
            </p>
          </div>

          <Button type="submit" disabled={isPending} className="w-full py-2.5">
            {isPending ? "Criando conta..." : "Criar conta"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Já tem uma conta?{" "}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Entrar
          </Link>
        </p>
      </Card>
    </main>
  );
}
