import "server-only";

import { cookies } from "next/headers";
import { toActionFailure } from "./action-errors";
import { getAuthService } from "./services/factories";
import type { Session } from "./types";

const SESSION_COOKIE_NAME = "polyglot_session";

export async function getCurrentSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    return await getAuthService().getSession(token);
  } catch (error) {
    const failure = toActionFailure(
      error,
      "Erro inesperado ao consultar a sessão:",
      "Não foi possível validar sua sessão. Tente novamente.",
    );
    throw new Error(failure.error);
  }
}
