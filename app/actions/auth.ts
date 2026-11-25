"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AuthService, AuthenticationError } from "@/lib/services/auth";
import { UserRepository } from "@/lib/repositories/users";
import { CartAndSessionRepository } from "@/lib/repositories/cart-session";

const SESSION_COOKIE_NAME = "polyglot_session";
const SESSION_MAX_AGE_SECONDS = 7200; // 2 horas (mesmo TTL do Redis)

// Validação dos dados do formulário com Zod
const loginSchema = z.object({
  email: z.string().email("Por favor, insira um e-mail válido."),
  password: z.string().min(1, "A senha é obrigatória."),
});

export type LoginActionResult = {
  success: boolean;
  error?: string;
};

function getAuthService(): AuthService {
  return new AuthService(
    new UserRepository(),
    new CartAndSessionRepository(),
  );
}

/**
 * Server Action para realizar login por e-mail e senha.
 */
export async function loginAction(
  prevState: LoginActionResult | null,
  formData: FormData,
): Promise<LoginActionResult> {
  const rawEmail = formData.get("email");
  const rawPassword = formData.get("password");

  // 1. Validar inputs com Zod
  const validation = loginSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
  });

  if (!validation.success) {
    const firstError = validation.error.issues[0]?.message;
    return {
      success: false,
      error: firstError ?? "Dados inválidos.",
    };
  }

  const { email, password } = validation.data;
  const authService = getAuthService();

  try {
    // 2. Chama o serviço que valida o hash scrypt no Postgres e cria a sessão no Redis
    const sessionToken = await authService.login(email, password);

    // 3. Grava o cookie HttpOnly seguro no navegador
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production",
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { success: false, error: "E-mail ou senha incorretos." };
    }
    console.error("Erro inesperado no login:", error);
    return {
      success: false,
      error: "Ocorreu um erro ao tentar entrar. Tente novamente mais tarde.",
    };
  }

  // 4. Redireciona o usuário para a página inicial (vitrine)
  redirect("/");
}

/**
 * Server Action para deslogar (logout).
 */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    const authService = getAuthService();
    await authService.logout(token);
    cookieStore.delete(SESSION_COOKIE_NAME);
  }

  redirect("/login");
}