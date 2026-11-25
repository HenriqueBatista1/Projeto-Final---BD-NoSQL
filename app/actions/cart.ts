"use server";

import { getCurrentSession } from "./auth";
import { CartService } from "@/lib/services/cart";
import { CartAndSessionRepository } from "@/lib/repositories/cart-session";
import { CatalogRepository } from "@/lib/repositories/catalog";
import { OrderAndInventoryRepository } from "@/lib/repositories/orders-inventory";
import type { HydratedCartItem } from "@/lib/types";

function getCartDependencies() {
  const cartRepo = new CartAndSessionRepository();
  const catalogRepo = new CatalogRepository();
  const inventoryRepo = new OrderAndInventoryRepository();
  const cartService = new CartService(cartRepo, catalogRepo, inventoryRepo);

  return { cartRepo, cartService };
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

  const { cartRepo, cartService } = getCartDependencies();
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

  const { cartRepo, cartService } = getCartDependencies();
  await cartRepo.removeItem(session.userId, externalId);

  return cartService.getCart(session.userId);
}