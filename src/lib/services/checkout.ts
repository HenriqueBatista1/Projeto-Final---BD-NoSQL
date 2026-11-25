import type {
  CartAndSessionRepository,
  CatalogRepository,
  OrderAndInventoryRepository,
} from "../repositories/contracts";
import { InsufficientStockError } from "../errors";

export type PaymentMethod = "PIX" | "CARTAO_CREDITO";

export type CheckoutInput = {
  userId: number;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
};

export type CheckoutResult = {
  orderId: number;
  createdAt: string;
  cartCleared: boolean;
};

export type CheckoutErrorCode =
  | "EMPTY_CART"
  | "MISSING_PRODUCT"
  | "INSUFFICIENT_STOCK";

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CheckoutError";
  }
}

export class CheckoutService {
  constructor(
    private readonly cart: Pick<
      CartAndSessionRepository,
      "getCart" | "clearCart"
    >,
    private readonly catalog: Pick<CatalogRepository, "findByExternalIds">,
    private readonly orders: Pick<OrderAndInventoryRepository, "placeOrder">,
  ) {}

  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    const cart = await this.cart.getCart(input.userId);
    const cartItems = Object.entries(cart).map(([externalId, quantity]) => ({
      externalId: Number(externalId),
      quantity,
    }));

    if (cartItems.length === 0) {
      throw new CheckoutError("EMPTY_CART", "Seu carrinho está vazio.");
    }

    const products = await this.catalog.findByExternalIds(
      cartItems.map((item) => item.externalId),
    );
    const productsById = new Map(
      products.map((product) => [product.externalId, product]),
    );

    const missingItem = cartItems.find(
      (item) => !productsById.has(item.externalId),
    );
    if (missingItem) {
      throw new CheckoutError(
        "MISSING_PRODUCT",
        `O produto ${missingItem.externalId} não está disponível no catálogo.`,
      );
    }

    const orderItems = cartItems
      .map((item) => {
        const product = productsById.get(item.externalId)!;
        return {
          externalId: item.externalId,
          title: product.title,
          unitPrice: product.price,
          quantity: item.quantity,
        };
      })
      .sort((left, right) => left.externalId - right.externalId);

    let placedOrder: Awaited<ReturnType<typeof this.orders.placeOrder>>;
    try {
      placedOrder = await this.orders.placeOrder({
        userId: input.userId,
        deliveryAddress: input.deliveryAddress,
        paymentMethod: input.paymentMethod,
        items: orderItems,
      });
    } catch (error) {
      if (error instanceof InsufficientStockError) {
        throw new CheckoutError(
          "INSUFFICIENT_STOCK",
          `Estoque insuficiente para o produto ${error.externalId}.`,
          { cause: error },
        );
      }
      throw error;
    }

    try {
      await this.cart.clearCart(input.userId);
      return { ...placedOrder, cartCleared: true };
    } catch {
      return { ...placedOrder, cartCleared: false };
    }
  }
}
