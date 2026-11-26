"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentSession } from "./auth";
import { CheckoutService, CheckoutError } from "@/lib/services/checkout";
import { CartAndSessionRepository } from "@/lib/repositories/cart-session";
import { CatalogRepository } from "@/lib/repositories/catalog";
import { OrderAndInventoryRepository } from "@/lib/repositories/orders-inventory";

const checkoutSchema = z.object({
  deliveryAddress: z
    .string()
    .min(5, "O endereço de entrega deve ter pelo menos 5 caracteres."),
  paymentMethod: z.enum(["PIX", "CARTAO_CREDITO"], {
    error: "Selecione uma forma de pagamento válida.",
  }),
});

export type CheckoutActionResult = {
  success: boolean;
  orderId?: number;
  error?: string;
};

function getCheckoutService() {
  return new CheckoutService(
    new CartAndSessionRepository(),
    new CatalogRepository(),
    new OrderAndInventoryRepository(),
  );
}

/**
 * Server Action para executar o checkout transacional poliglota.
 */
export async function checkoutAction(
  prevState: CheckoutActionResult | null,
  formData: FormData,
): Promise<CheckoutActionResult> {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/login");
  }

  const rawAddress = formData.get("deliveryAddress");
  const rawPaymentMethod = formData.get("paymentMethod");

  const validation = checkoutSchema.safeParse({
    deliveryAddress: rawAddress,
    paymentMethod: rawPaymentMethod,
  });

  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const { deliveryAddress, paymentMethod } = validation.data;
  const checkoutService = getCheckoutService();

  try {
    const result = await checkoutService.checkout({
      userId: session.userId,
      deliveryAddress,
      paymentMethod,
    });

    return {
      success: true,
      orderId: result.orderId,
    };
  } catch (error) {
    if (error instanceof CheckoutError) {
      return { success: false, error: error.message };
    }
    console.error("Erro inesperado no checkout:", error);
    return {
      success: false,
      error: "Ocorreu uma falha ao processar seu pedido. Tente novamente.",
    };
  }
}