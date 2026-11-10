import { cookies } from "next/headers";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const lang = (await cookies()).get("lang")?.value === "bn" ? "bn" : "en";
  return <LoginForm initialLang={lang} />;
}
