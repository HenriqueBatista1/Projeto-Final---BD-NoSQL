"use client";

import Image from "next/image";
import type { Product } from "@/lib/types";
import { Button, Card, CardContent, CardTitle, StockBadge } from "@/components/ui";
import { useCart } from "@/components/cart/cart-context";

type ProductCardProps = {
  product: Product;
  onAddToCart?: (product: Product) => void;
  loading?: boolean;
};

export function ProductCard({ product }: { product: Product }) {
  const { addItem, loading } = useCart();
  const isOutOfStock = product.stock <= 0;

  // Formata o preço para moeda brasileira (R$) ou dólares
  const formattedPrice = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(product.price);

  return (
    <Card
      id={`product-${product.externalId}`}
      className="flex h-full flex-col justify-between overflow-hidden transition-all hover:shadow-md"
    >
      {/* Imagem do Produto com fundo neutro */}
      <div className="relative flex h-52 w-full items-center justify-center bg-white p-6">
        <div className="relative h-40 w-full">
          <Image
            src={product.image}
            alt={product.title}
            fill
            unoptimized
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
            className="object-contain"
            priority={false}
          />
        </div>
        <div className="absolute top-3 right-3">
          <StockBadge stock={product.stock} />
        </div>
      </div>

      {/* Detalhes do Produto */}
      <CardContent className="flex flex-1 flex-col justify-between p-5">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            {product.category}
          </span>
          <CardTitle className="mt-1 line-clamp-2 text-base font-medium text-slate-800" title={product.title}>
            {product.title}
          </CardTitle>
          <p className="mt-2 text-xs text-slate-500 line-clamp-2">
            {product.description}
          </p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <div>
            <span className="text-xs text-slate-400">Preço</span>
            <p className="text-lg font-bold text-slate-900">{formattedPrice}</p>
          </div>

          <Button
            size="sm"
            disabled={isOutOfStock || loading}
            onClick={() => addItem(product.externalId)}
            className="whitespace-nowrap"
          >
            {isOutOfStock ? "Esgotado" : "Adicionar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}