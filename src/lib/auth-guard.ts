import { redirect } from "next/navigation";
import { getSession, type SessionPayload } from "@/lib/session";

/** Use at the top of any admin server component/page to enforce login. */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
