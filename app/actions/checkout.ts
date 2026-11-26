"use server";

import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { checkoutSchema } from "@/lib/action-schemas";
import { toActionFailure } from "@/lib/action-errors";
import { CheckoutError } from "@/lib/services/checkout";
import { getCheckoutService } from "@/lib/services/factories";
import type { Session } from "@/lib/types";

export type CheckoutActionResult = {
  success: boolean;
  orderId?: number;
  error?: string;
};

/**
 * Server Action para executar o checkout transacional poliglota.
 */
export async function checkoutAction(
  prevState: CheckoutActionResult | null,
  formData: FormData,
): Promise<CheckoutActionResult> {
  let session: Session | null;
  try {
    session = await getCurrentSession();
  } catch (error) {
    return toActionFailure(
      error,
      "Erro inesperado ao consultar a sessão do checkout:",
      "Não foi possível validar sua sessão. Tente novamente.",
    );
  }

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

  try {
    const result = await getCheckoutService().checkout({
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
    return toActionFailure(
      error,
      "Erro inesperado no checkout:",
      "Ocorreu uma falha ao processar seu pedido. Tente novamente.",
    );
  }
}