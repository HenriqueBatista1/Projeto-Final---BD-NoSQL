"use server";

import { z } from "zod";
import { getCurrentSession } from "./auth";
import { CartService } from "@/lib/services/cart";
import { CartAndSessionRepository } from "@/lib/repositories/cart-session";
import { CatalogRepository } from "@/lib/repositories/catalog";
import { OrderAndInventoryRepository } from "@/lib/repositories/orders-inventory";
import type { HydratedCartItem } from "@/lib/types";

const updateCartSchema = z.object({
  externalId: z.number().int().positive("ID do produto inválido"),
  quantity: z
    .number()
    .int("A quantidade deve ser um número inteiro")
    .refine((val) => val !== 0, "Quantidade não pode ser zero"),
});

const removeCartSchema = z.object({
  externalId: z.number().int().positive("ID do produto inválido"),
});

function getCartDependencies() {
  const cartRepo = new CartAndSessionRepository();
  const catalogRepo = new CatalogRepository();
  const inventoryRepo = new OrderAndInventoryRepository();
  const cartService = new CartService(cartRepo, catalogRepo, inventoryRepo);

  return { cartRepo, catalogRepo, cartService };
}

/**
 * Retorna os itens hidratados do carrinho do usuário logado no Redis.
 */
export async function getCartAction(): Promise<HydratedCartItem[]> {
  const session = await getCurrentSession();
  if (!session) {
    return [];
  }

  const { cartService } = getCartDependencies();
  return cartService.getCart(session.userId);
}

/**
 * Adiciona ou incrementa a quantidade de um item no Redis (HINCRBY).
 * Para diminuir, envie quantity negativo (ex.: -1).
 */
export async function updateCartItemAction(
  externalId: number,
  quantity = 1,
): Promise<HydratedCartItem[]> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Usuário não autenticado");
  }

  const validation = updateCartSchema.safeParse({ externalId, quantity });
  if (!validation.success) {
    throw new Error(
      validation.error.issues[0]?.message ?? "Parâmetros do carrinho inválidos",
    );
  }

  const { cartRepo, catalogRepo, cartService } = getCartDependencies();

  // Se estiver adicionando, valida se o produto realmente existe no catálogo
  if (quantity > 0) {
    const product = await catalogRepo.findByExternalId(externalId);
    if (!product) {
      throw new Error(`Produto ${externalId} não encontrado no catálogo.`);
    }
  }

  await cartRepo.addItem(session.userId, externalId, quantity);
  return cartService.getCart(session.userId);
}

/**
 * Remove completamente um item do carrinho no Redis (HDEL).
 */
export async function removeCartItemAction(
  externalId: number,
): Promise<HydratedCartItem[]> {
  const session = await getCurrentSession();
  if (!session) {
    throw new Error("Usuário não autenticado");
  }

  const validation = removeCartSchema.safeParse({ externalId });
  if (!validation.success) {
    throw new Error(
      validation.error.issues[0]?.message ?? "ID do produto inválido",
    );
  }

  const { cartRepo, cartService } = getCartDependencies();
  await cartRepo.removeItem(session.userId, externalId);

  return cartService.getCart(session.userId);
}
