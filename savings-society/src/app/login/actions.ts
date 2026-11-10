"use server";

import { createHash, randomInt } from "crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { clearPendingLogin, createSession, destroySession, getPendingLogin, setPendingLogin } from "@/lib/session";
import { normalizePhone } from "@/lib/phone";
import { accessFor } from "@/lib/auth-guard";
import { audit } from "@/lib/audit";
import { adminIds, queueForAll } from "@/lib/notify";
import { deliver } from "@/lib/deliver";
import { sendTemplate, whatsappConfigured } from "@/lib/messaging";

export type LoginState = { error?: string };

const MAX_ATTEMPTS = 5; // FR-AUTH-08
const LOCK_MINUTES = 15;

function codeHash(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}:${process.env.AUTH_SECRET}`).digest("hex");
}

async function home(user: { role: string; mustChangePassword: boolean }) {
  if (user.mustChangePassword) redirect("/password");
  redirect(user.role === "MEMBER" ? "/member" : "/admin");
}

/** Sends a 6-digit admin login code on WhatsApp (NFR-SEC-05: at most 3 sends per 15 minutes). */
async function sendLoginCode(user: { id: string; contactPhone: string | null }): Promise<string | null> {
  const recent = await prisma.loginCode.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (recent >= 3) return "Too many codes sent. Wait 15 minutes and try again.";
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.loginCode.create({ data: { userId: user.id, codeHash: codeHash(user.id, code), expiresAt: new Date(Date.now() + 5 * 60_000) } });
  const channel = await sendTemplate(user.contactPhone!, "login_code", [code], user.id);
  return channel ? null : "The login code couldn't be sent. Try again in a minute.";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  if (!identifier || !password) return { error: "Enter your mobile number and password." };

  const user = identifier.includes("@")
    ? await prisma.user.findUnique({ where: { email: identifier.toLowerCase() } })
    : await prisma.user.findUnique({ where: { phone: normalizePhone(identifier) } });
  if (!user) return { error: "Wrong mobile number or password." };

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    return { error: `Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or ask the admin.` };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    const lock = failed >= MAX_ATTEMPTS;
    await prisma.user.update({ where: { id: user.id }, data: lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed } });
    await audit(user.id, lock ? "login.locked" : "login.failed", lock ? `${user.name}'s account was locked for ${LOCK_MINUTES} minutes after ${MAX_ATTEMPTS} wrong passwords` : `Wrong password for ${user.name}`);
    if (lock) {
      await queueForAll(prisma, await adminIds(), { kind: "security", title: "Account locked", body: `${user.name}'s account was locked after ${MAX_ATTEMPTS} wrong passwords.`, url: user.role === "MEMBER" ? `/admin/members/${user.id}` : "/admin/settings" });
      await deliver();
      return { error: `Too many wrong passwords. The account is locked for ${LOCK_MINUTES} minutes.` };
    }
    return { error: `Wrong mobile number or password. ${MAX_ATTEMPTS - failed} attempt${MAX_ATTEMPTS - failed === 1 ? "" : "s"} left.` };
  }

  const access = accessFor(user);
  if (access === "none") return { error: "This account is no longer active. Please contact the admin." };
  // The language picked on the login page becomes the member's language.
  const lang = (await cookies()).get("lang")?.value;
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, ...(user.role === "MEMBER" && (lang === "en" || lang === "bn") ? { language: lang } : {}) } });

  // FR-AUTH-07: admins confirm with a 6-digit code on WhatsApp.
  if (user.role === "ADMIN" && whatsappConfigured() && user.contactPhone) {
    const error = await sendLoginCode(user);
    if (error) return { error };
    await setPendingLogin(user.id, remember);
    redirect("/login/code");
  }

  await createSession({ id: user.id, name: user.name, role: user.role }, remember);
  await audit(user.id, "login", `${user.name} logged in`);
  await home(user);
  return {};
}

export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login");
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } });
  const row = await prisma.loginCode.findFirst({ where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!row) return { error: "The code has expired. Go back and log in again." };
  if (row.attempts >= 5) return { error: "Too many wrong codes. Log in again for a new one." };
  if (row.codeHash !== codeHash(user.id, code)) {
    await prisma.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { error: "That code isn't right." };
  }
  await prisma.loginCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  await clearPendingLogin();
  await createSession({ id: user.id, name: user.name, role: user.role }, pending.remember);
  await audit(user.id, "login", `${user.name} logged in (with WhatsApp code)`);
  await home(user);
  return {};
}

export async function resendLoginCode(): Promise<LoginState> {
  const pending = await getPendingLogin();
  if (!pending) redirect("/login");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: pending.userId } });
  const error = await sendLoginCode(user);
  return error ? { error } : {};
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

/** The language chosen on the login page (applied to the member's account when they log in). */
export async function chooseLanguage(lang: string): Promise<void> {
  (await cookies()).set("lang", lang === "bn" ? "bn" : "en", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
