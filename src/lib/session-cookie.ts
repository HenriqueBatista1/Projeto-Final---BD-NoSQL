export function getSessionCookieOptions(isProduction: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7200,
    secure: isProduction,
  };
}
