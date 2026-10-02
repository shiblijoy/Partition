"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";

  if (!identifier || !password) {
    return { error: "Enter your mobile number and password." };
  }

  const user = identifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.user.findUnique({ where: { phone: normalizePhone(identifier) } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong mobile number or password." };
  }
  if (!user.active) {
    return { error: "This account is no longer active. Please contact the admin." };
  }

  await createSession({ userId: user.id, name: user.name, role: user.role }, remember);
  if (user.mustChangePassword) redirect("/password");
  redirect(user.role === "ADMIN" ? "/admin" : "/member");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
