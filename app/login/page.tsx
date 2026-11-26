import { redirect } from "next/navigation";
import { getCurrentSession } from "../actions/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect("/");
  }

  return <LoginForm />;
}
