"use server";

import { CatalogService } from "@/lib/services/catalog";
import { CatalogRepository } from "@/lib/repositories/catalog";
import { OrderAndInventoryRepository } from "@/lib/repositories/orders-inventory";
import type { SuggestedProduct } from "@/lib/types";

function getCatalogService() {
  return new CatalogService(
    new CatalogRepository(),
    new OrderAndInventoryRepository(),
  );
}

/**
 * Server Action para buscar até 5 sugestões de produtos enquanto o usuário digita.
 */
export async function suggestProductsAction(
  query: string,
): Promise<SuggestedProduct[]> {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const catalogService = getCatalogService();
  return catalogService.suggest(query);
}