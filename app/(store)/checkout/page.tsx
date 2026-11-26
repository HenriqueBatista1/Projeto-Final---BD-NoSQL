"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { useCart } from "@/components/cart/cart-context";
import { checkoutAction, type CheckoutActionResult } from "../../actions/checkout";

const initialState: CheckoutActionResult = {
  success: false,
};

export default function CheckoutPage() {
  const { items, totalPrice, refreshCart } = useCart();
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CARTAO_CREDITO">("PIX");
  const [state, formAction, isPending] = useActionState(
    async (prev: CheckoutActionResult | null, formData: FormData) => {
      const res = await checkoutAction(prev, formData);
      if (res.success) {
        // Atualiza o estado do carrinho no navegador (ele foi esvaziado no Redis pós-commit!)
        await refreshCart();
      }
      return res;
    },
    initialState,
  );

  const formattedTotal = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(totalPrice);

  // 1. Tela de Pedido Confirmado com Sucesso!
  if (state?.success && state.orderId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-600">
          ✓
        </div>
        <h1 className="mt-6 text-3xl font-extrabold text-slate-900">
          Pedido Confirmado!
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Sua compra foi processada com sucesso via transação ACID no PostgreSQL.
        </p>
        <div className="my-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wider text-slate-400">
            Número do Pedido
          </p>
          <p className="text-2xl font-bold text-indigo-700">#{state.orderId}</p>
        </div>
        <div className="flex justify-center gap-4">
          <Link
            href="/orders"
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
          >
            Ver Meus Pedidos
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Continuar Comprando
          </Link>
        </div>
      </div>
    );
  }

  // 2. Se o carrinho estiver vazio
  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <p className="text-5xl">🛒</p>
        <h2 className="mt-4 text-xl font-bold text-slate-800">
          Seu carrinho está vazio
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Adicione produtos antes de ir para o checkout.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          Voltar ao Catálogo
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Finalizar Compra
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Revise seus itens, informe o endereço e confirme o pagamento.
        </p>
      </div>

      {/* Alerta de erro da transação (ex: estoque esgotado durante o lock) */}
      {state?.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Atenção:</strong> {state.error}
        </div>
      )}

      <form action={formAction}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Coluna 1: Endereço e Pagamento */}
          <div className="space-y-6 lg:col-span-7">
            {/* Endereço */}
            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900">
                1. Endereço de Entrega
              </h2>
              <div className="mt-4">
                <label
                  htmlFor="deliveryAddress"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Endereço Completo
                </label>
                <Input
                  id="deliveryAddress"
                  name="deliveryAddress"
                  required
                  placeholder="Ex: Av. Paulista, 1000 - Apto 42 - São Paulo/SP"
                  defaultValue="Rua das Flores, 123 - Centro"
                />
              </div>
            </Card>

            {/* Forma de Pagamento */}
            <Card className="p-6">
              <h2 className="text-lg font-bold text-slate-900">
                2. Forma de Pagamento
              </h2>
              <input type="hidden" name="paymentMethod" value={paymentMethod} />

              <div className="mt-4 grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("PIX")}
                  className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition ${
                    paymentMethod === "PIX"
                      ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-2xl">⚡</span>
                  <span className="mt-2 text-sm font-bold">PIX</span>
                  <span className="text-xs text-slate-500">
                    Aprovação instantânea
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("CARTAO_CREDITO")}
                  className={`flex flex-col items-center justify-center rounded-xl border p-4 text-center transition ${
                    paymentMethod === "CARTAO_CREDITO"
                      ? "border-indigo-600 bg-indigo-50/50 text-indigo-900 ring-2 ring-indigo-600"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className="text-2xl">💳</span>
                  <span className="mt-2 text-sm font-bold">Cartão de Crédito</span>
                  <span className="text-xs text-slate-500">
                    Até 12x sem juros
                  </span>
                </button>
              </div>
            </Card>
          </div>

          {/* Coluna 2: Resumo do Pedido */}
          <div className="lg:col-span-5">
            <Card className="sticky top-6 p-6">
              <h2 className="text-lg font-bold text-slate-900">
                Resumo do Pedido
              </h2>

              <div className="mt-4 max-h-72 overflow-y-auto divide-y divide-slate-100 pr-1">
                {items.map((item) => (
                  <div key={item.externalId} className="flex items-center gap-3 py-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-50 p-1">
                      <Image
                        src={item.image}
                        alt={item.title}
                        fill
                        unoptimized
                        className="object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-xs font-medium text-slate-800">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        Qtd: {item.quantity} ×{" "}
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(item.price)}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-slate-900">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-slate-200 pt-4 space-y-2">
                <div className="flex justify-between text-sm text-slate-500">
                  <span>Frete</span>
                  <span className="font-semibold text-emerald-600">Grátis</span>
                </div>
                <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Total</span>
                  <span className="text-xl text-indigo-700">
                    {formattedTotal}
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="mt-6 w-full py-3 text-base shadow-sm"
              >
                {isPending ? "Processando Transação..." : "Confirmar e Pagar"}
              </Button>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}