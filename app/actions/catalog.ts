"use server";

import { toActionFailure } from "@/lib/action-errors";
import { suggestProductsSchema } from "@/lib/action-schemas";
import type { ActionResult } from "@/lib/action-result";
import { getCatalogService } from "@/lib/services/factories";
import type { SuggestedProduct } from "@/lib/types";

/**
 * Server Action para buscar até 5 sugestões de produtos enquanto o usuário digita.
 */
export async function suggestProductsAction(
  query: string,
): Promise<ActionResult<SuggestedProduct[]>> {
  const validation = suggestProductsSchema.safeParse(query);
  if (!validation.success) {
    if (validation.error.issues[0]?.code === "too_small") {
      return { success: true, data: [] };
    }
    return { success: false, error: "A busca informada é inválida." };
  }

  try {
    const suggestions = await getCatalogService().suggest(validation.data);
    return { success: true, data: suggestions };
  } catch (error) {
    return toActionFailure(
      error,
      "Erro inesperado ao buscar sugestões:",
      "Não foi possível buscar sugestões. Tente novamente.",
    );
  }
}