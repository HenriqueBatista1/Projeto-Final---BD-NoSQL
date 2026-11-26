"use server";

import { getCurrentSession } from "@/lib/session";
import { removeCartSchema, updateCartSchema } from "@/lib/action-schemas";
import { toCartActionFailure } from "@/lib/action-errors";
import type { ActionResult } from "@/lib/action-result";
import { getCartService } from "@/lib/services/factories";
import type { HydratedCartItem } from "@/lib/types";

/**
 * Retorna os itens hidratados do carrinho do usuário logado no Redis.
 */
export async function getCartAction(): Promise<ActionResult<HydratedCartItem[]>> {
  try {
    const session = await getCurrentSession();
    if (!session) {
      return { success: true, data: [] };
    }

    return {
      success: true,
      data: await getCartService().getCart(session.userId),
    };
  } catch (error) {
    return toCartActionFailure(error);
  }
}

/**
 * Adiciona ou incrementa a quantidade de um item no Redis (HINCRBY).
 * Para diminuir, envie quantity negativo (ex.: -1).
 */
export async function updateCartItemAction(
  externalId: number,
  quantity = 1,
): Promise<ActionResult<HydratedCartItem[]>> {
  const validation = updateCartSchema.safeParse({ externalId, quantity });
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Parâmetros do carrinho inválidos.",
    };
  }

  try {
    const session = await getCurrentSession();
    if (!session) {
      return {
        success: false,
        error: "Você precisa entrar na sua conta para atualizar o carrinho.",
      };
    }

    const cartService = getCartService();
    await cartService.updateItemQuantity(
      session.userId,
      validation.data.externalId,
      validation.data.quantity,
    );
    return {
      success: true,
      data: await cartService.getCart(session.userId),
    };
  } catch (error) {
    return toCartActionFailure(error);
  }
}

/**
 * Remove completamente um item do carrinho no Redis (HDEL).
 */
export async function removeCartItemAction(
  externalId: number,
): Promise<ActionResult<HydratedCartItem[]>> {
  const validation = removeCartSchema.safeParse({ externalId });
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "ID do produto inválido.",
    };
  }

  try {
    const session = await getCurrentSession();
    if (!session) {
      return {
        success: false,
        error: "Você precisa entrar na sua conta para atualizar o carrinho.",
      };
    }

    const cartService = getCartService();
    await cartService.removeItem(session.userId, validation.data.externalId);
    return {
      success: true,
      data: await cartService.getCart(session.userId),
    };
  } catch (error) {
    return toCartActionFailure(error);
  }
}
