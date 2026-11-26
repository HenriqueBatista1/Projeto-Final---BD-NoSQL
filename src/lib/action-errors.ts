import { CartProductUnavailableError } from "./services/cart";
import type { ActionFailure } from "./action-result";

export function toActionFailure(
  error: unknown,
  context: string,
  fallback: string,
): ActionFailure {
  console.error(context, error);
  return { success: false, error: fallback };
}

export function toCartActionFailure(error: unknown): ActionFailure {
  if (error instanceof CartProductUnavailableError) {
    return {
      success: false,
      error: "Um ou mais produtos não estão disponíveis no catálogo.",
    };
  }

  return toActionFailure(
    error,
    "Erro inesperado no carrinho:",
    "Não foi possível atualizar o carrinho. Tente novamente.",
  );
}
