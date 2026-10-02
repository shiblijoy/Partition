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

  if (!identifier || !password) {
    return { error: "Enter your phone (or email) and password." };
  }

  const user = identifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.user.findUnique({ where: { phone: normalizePhone(identifier) } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Wrong phone/email or password." };
  }
  if (!user.active) {
    return { error: "Your account is inactive. Please contact the admin." };
  }

  await createSession({ userId: user.id, name: user.name, role: user.role });
  redirect(user.role === "ADMIN" ? "/admin" : "/member");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

