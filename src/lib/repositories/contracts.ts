import type {
  Order,
  PlacedOrderItem,
  ProductRecord,
  PublicUser,
  Session,
  SuggestedProduct,
  UserRecord,
} from "../types";

export interface CatalogRepository {
  list(category?: string): Promise<ProductRecord[]>;
  findByExternalIds(ids: number[]): Promise<ProductRecord[]>;
  findByExternalId(id: number): Promise<ProductRecord | null>;
  listCategories(): Promise<string[]>;
  suggest(query: string): Promise<SuggestedProduct[]>;
}

export interface CartAndSessionRepository {
  getCart(userId: number): Promise<Record<number, number>>;
  addItem(userId: number, externalId: number, quantity?: number): Promise<number>;
  removeItem(userId: number, externalId: number): Promise<void>;
  clearCart(userId: number): Promise<void>;
  createSession(session: Session): Promise<string>;
  getSession(token: string): Promise<Session | null>;
  deleteSession(token: string): Promise<void>;
}

export interface OrderAndInventoryRepository {
  stocksFor(ids: number[]): Promise<Map<number, number>>;
  placeOrder(input: {
    userId: number;
    deliveryAddress: string;
    paymentMethod: string;
    items: PlacedOrderItem[];
  }): Promise<{ orderId: number; createdAt: string }>;
  history(userId: number): Promise<Order[]>;
}

export interface UserRepository {
  create(
    input: Pick<UserRecord, "name" | "email" | "passwordHash">,
  ): Promise<PublicUser | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findActiveById(id: number): Promise<PublicUser | null>;
  listActive(): Promise<PublicUser[]>;
}
