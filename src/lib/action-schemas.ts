import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Por favor, insira um e-mail válido."),
  password: z.string().min(1, "A senha é obrigatória."),
});

export const registerSchema = z.object({
  name: z
    .string("Informe seu nome.")
    .trim()
    .min(1, "Informe seu nome.")
    .max(150, "O nome deve ter no máximo 150 caracteres."),
  email: z
    .string("Informe seu e-mail.")
    .trim()
    .email("Por favor, insira um e-mail válido.")
    .max(150, "O e-mail deve ter no máximo 150 caracteres."),
  password: z
    .string("Informe uma senha.")
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .max(128, "A senha deve ter no máximo 128 caracteres."),
});

export const suggestProductsSchema = z
  .string()
  .trim()
  .min(2, "Digite pelo menos 2 caracteres para buscar.");

export const updateCartSchema = z.object({
  externalId: z.number().int().positive("ID do produto inválido"),
  quantity: z
    .number()
    .int("A quantidade deve ser um número inteiro")
    .refine((value) => value !== 0, "Quantidade não pode ser zero"),
});

export const removeCartSchema = z.object({
  externalId: z.number().int().positive("ID do produto inválido"),
});

export const checkoutSchema = z.object({
  deliveryAddress: z
    .string()
    .min(5, "O endereço de entrega deve ter pelo menos 5 caracteres."),
  paymentMethod: z.enum(["PIX", "CARTAO_CREDITO"], {
    error: "Selecione uma forma de pagamento válida.",
  }),
});
