export type ProductRecord = {
  externalId: number;
  title: string;
  price: number;
  description: string;
  category: string;
  image: string;
  rating: { rate: number; count: number };
};

export type Product = ProductRecord & { stock: number };

export type SuggestedProduct = Pick<
  Product,
  "externalId" | "title" | "price" | "image"
>;

export type CartItem = {
  externalId: number;
  quantity: number;
};

export type HydratedCartItem = CartItem & {
  title: string;
  price: number;
  image: string;
  stock: number;
  available: boolean;
};

export type Session = {
  userId: number;
  name: string;
  email: string;
};

export type PlacedOrderItem = {
  externalId: number;
  title: string;
  unitPrice: number;
  quantity: number;
};

export type OrderItem = PlacedOrderItem & { subtotal: number };

export type Order = {
  id: number;
  totalAmount: number;
  status: string;
  paymentMethod: string;
  deliveryAddress: string;
  createdAt: string;
  items: OrderItem[];
};
