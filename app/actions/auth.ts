"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthenticationError } from "@/lib/services/auth";
import { toActionFailure } from "@/lib/action-errors";
import { loginSchema } from "@/lib/action-schemas";
import type { ActionFailure } from "@/lib/action-result";
import { getAuthService } from "@/lib/services/factories";
import { getSessionCookieOptions } from "@/lib/session-cookie";

const SESSION_COOKIE_NAME = "polyglot_session";

export type LoginActionResult = {
  success: boolean;
  error?: string;
};

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
    cookieStore.set(
      SESSION_COOKIE_NAME,
      sessionToken,
      getSessionCookieOptions(process.env.NODE_ENV === "production"),
    );
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { success: false, error: "E-mail ou senha incorretos." };
    }
    return toActionFailure(
      error,
      "Erro inesperado no login:",
      "Ocorreu um erro ao tentar entrar. Tente novamente mais tarde.",
    );
  }

  // 4. Redireciona o usuário para a página inicial (vitrine)
  redirect("/");
}

/**
 * Server Action para deslogar (logout).
 */
export async function logoutAction(): Promise<ActionFailure | void> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (token) {
      await getAuthService().logout(token);
      cookieStore.delete(SESSION_COOKIE_NAME);
    }
  } catch (error) {
    return toActionFailure(
      error,
      "Erro inesperado no logout:",
      "Não foi possível encerrar sua sessão. Tente novamente.",
    );
  }

  redirect("/login");
}