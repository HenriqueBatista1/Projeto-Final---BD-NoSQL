"use client";

import Image from "next/image";
import Link from "next/link";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useCart } from "./cart-context";

export function CartDrawer() {
  const { items, isOpen, closeCart, addItem, removeItem, totalPrice, totalItems } =
    useCart();

  const formattedTotal = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(totalPrice);

  const hasUnavailableItems = items.some((item) => !item.available);

  return (
    <Drawer open={isOpen} onClose={closeCart} title={`Seu Carrinho (${totalItems})`}>
      <div className="flex h-full flex-col justify-between">
        {/* Lista de Itens ou Estado Vazio */}
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-3xl">
              🛒
            </div>
            <p className="mt-4 text-base font-semibold text-slate-800">
              Seu carrinho está vazio
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Explore o catálogo e adicione itens para começar suas compras.
            </p>
            <Button variant="secondary" size="sm" onClick={closeCart} className="mt-6">
              Ver Produtos
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
            {items.map((item) => {
              const formattedPrice = new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(item.price);

              return (
                <div key={item.externalId} className="flex gap-4 py-4">
                  {/* Foto miniatura */}
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-white p-2">
                    <Image
                      src={item.image}
                      alt={item.title}
                      fill
                      unoptimized
                      className="object-contain"
                    />
                  </div>

                  {/* Informações e controles */}
                  <div className="flex flex-1 flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <p className="line-clamp-1 text-sm font-medium text-slate-900" title={item.title}>
                          {item.title}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeItem(item.externalId)}
                          className="text-xs text-slate-400 hover:text-red-600 transition"
                          title="Remover produto"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-indigo-600 mt-0.5">
                        {formattedPrice}
                      </p>
                    </div>

                    {/* Alerta de Estoque Insuficiente */}
                    {!item.available && (
                      <div className="my-1 rounded bg-red-50 p-1.5 text-xs text-red-700">
                        Restam apenas <strong>{item.stock}</strong> no estoque!
                      </div>
                    )}

                    {/* Controles de Quantidade */}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50">
                        <button
                          type="button"
                          onClick={() => addItem(item.externalId, -1)}
                          className="flex h-7 w-7 items-center justify-center text-slate-600 hover:bg-slate-200 rounded-l-lg transition"
                          title="Diminuir"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-xs font-bold text-slate-800">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => addItem(item.externalId, 1)}
                          className="flex h-7 w-7 items-center justify-center text-slate-600 hover:bg-slate-200 rounded-r-lg transition"
                          title="Aumentar"
                        >
                          +
                        </button>
                      </div>

                      <span className="text-xs font-bold text-slate-900">
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Rodapé Fixo com Subtotal e Botão para Checkout */}
        {items.length > 0 && (
          <div className="border-t border-slate-200 bg-white pt-4 mt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-slate-500">Subtotal:</span>
              <span className="text-xl font-bold text-slate-900">
                {formattedTotal}
              </span>
            </div>

            {hasUnavailableItems && (
              <p className="mb-3 text-xs text-red-600 text-center font-medium">
                Ajuste os itens que excedem o estoque antes de finalizar.
              </p>
            )}

            <Link
              href="/checkout"
              onClick={closeCart}
              className={`block w-full text-center rounded-lg py-3 text-sm font-semibold text-white shadow-sm transition ${
                hasUnavailableItems
                  ? "pointer-events-none bg-slate-300"
                  : "bg-indigo-600 hover:bg-indigo-500"
              }`}
            >
              Finalizar Pedido &rarr;
            </Link>
          </div>
        )}
      </div>
    </Drawer>
  );
}