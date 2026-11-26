import { CartAndSessionRepository } from "../repositories/cart-session";
import { CatalogRepository } from "../repositories/catalog";
import { OrderAndInventoryRepository } from "../repositories/orders-inventory";
import { UserRepository } from "../repositories/users";
import { AuthService } from "./auth";
import { CartService } from "./cart";
import { CatalogService } from "./catalog";
import { CheckoutService } from "./checkout";

export function getAuthService(): AuthService {
  return new AuthService(
    new UserRepository(),
    new CartAndSessionRepository(),
  );
}

export function getCatalogService(): CatalogService {
  return new CatalogService(
    new CatalogRepository(),
    new OrderAndInventoryRepository(),
  );
}

export function getCartService(): CartService {
  return new CartService(
    new CartAndSessionRepository(),
    new CatalogRepository(),
    new OrderAndInventoryRepository(),
  );
}

export function getCheckoutService(): CheckoutService {
  return new CheckoutService(
    new CartAndSessionRepository(),
    new CatalogRepository(),
    new OrderAndInventoryRepository(),
  );
}
