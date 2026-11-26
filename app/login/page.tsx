import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ cadastro?: string | string[] }>;
}) {
  const session = await getCurrentSession();
  if (session) {
    redirect("/");
  }

  const { cadastro } = await searchParams;
  return <LoginForm registrationComplete={cadastro === "sucesso"} />;
}
