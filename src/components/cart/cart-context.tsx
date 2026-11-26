"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { HydratedCartItem } from "@/lib/types";
import {
  getCartAction,
  updateCartItemAction,
  removeCartItemAction,
} from "../../../app/actions/cart";

type CartContextType = {
  items: HydratedCartItem[];
  isOpen: boolean;
  loading: boolean;
  totalItems: number;
  totalPrice: number;
  openCart: () => void;
  closeCart: () => void;
  addItem: (externalId: number, quantity?: number) => Promise<void>;
  removeItem: (externalId: number) => Promise<void>;
  refreshCart: () => Promise<void>;
};

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<HydratedCartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Carrega o carrinho inicial do Redis
  const refreshCart = useCallback(async () => {
    try {
      setLoading(true);
      const cartItems = await getCartAction();
      setItems(cartItems);
    } catch (error) {
      console.error("Erro ao carregar o carrinho do Redis:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const openCart = () => setIsOpen(true);
  const closeCart = () => setIsOpen(false);

  // Adiciona ou incrementa um item no Redis
  const addItem = async (externalId: number, quantity = 1) => {
    try {
      setLoading(true);
      const updated = await updateCartItemAction(externalId, quantity);
      setItems(updated);
      setIsOpen(true); // Abre a gaveta para o usuário ver o item adicionado
    } catch (error) {
      console.error("Erro ao atualizar item no carrinho:", error);
    } finally {
      setLoading(false);
    }
  };

  // Remove um item do Redis
  const removeItem = async (externalId: number) => {
    try {
      setLoading(true);
      const updated = await removeCartItemAction(externalId);
      setItems(updated);
    } catch (error) {
      console.error("Erro ao remover item do carrinho:", error);
    } finally {
      setLoading(false);
    }
  };

  // Total de unidades (soma das quantidades de cada produto)
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  // Preço total da compra
  const totalPrice = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        items,
        isOpen,
        loading,
        totalItems,
        totalPrice,
        openCart,
        closeCart,
        addItem,
        removeItem,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart deve ser usado dentro de um CartProvider");
  }
  return context;
}