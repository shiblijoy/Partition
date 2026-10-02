import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guard";

export default async function Home() {
  const session = await requireSession();
  redirect(session.role === "ADMIN" ? "/admin" : "/member");
}
