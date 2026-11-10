import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "society_session";
const CODE_COOKIE = "society_login_code";
const MEMBER_TTL = 60 * 60 * 24 * 30; // FR-AUTH-10: members stay logged in for 30 days ("keep me logged in")
const MEMBER_SHORT_TTL = 60 * 60 * 12; // unticked: a browser-session cookie, at most 12 hours
const ADMIN_TTL = 60 * 60 * 8; // admin and auditor sessions expire after 8 hours

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET environment variable is not set");
  return new TextEncoder().encode(secret);
}

export type Role = "ADMIN" | "MEMBER" | "AUDITOR";
export type SessionPayload = { userId: string; name: string; role: Role; sid?: string; issuedAt?: number };

async function device(): Promise<{ device: string | null; ip: string | null }> {
  try {
    const h = await headers();
    return { device: h.get("user-agent")?.slice(0, 200) ?? null, ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null };
  } catch {
    return { device: null, ip: null };
  }
}

/** Starts a session: a Session row (so it can be revoked) and a signed cookie that names it. */
export async function createSession(user: { id: string; name: string; role: Role }, remember = true): Promise<void> {
  const staff = user.role !== "MEMBER";
  const ttl = staff ? ADMIN_TTL : remember ? MEMBER_TTL : MEMBER_SHORT_TTL;
  const row = await prisma.session.create({ data: { userId: user.id, ...(await device()), expiresAt: new Date(Date.now() + ttl * 1000) } });
  const token = await new SignJWT({ userId: user.id, name: user.name, role: user.role, sid: row.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(getSecret());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(staff || remember ? { maxAge: ttl } : {}),
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return { userId: payload.userId as string, name: payload.name as string, role: payload.role as Role, sid: payload.sid as string | undefined, issuedAt: payload.iat };
  } catch {
    return null;
  }
}

/** The session row behind the cookie, if it is still valid. Touches last-seen at most every 5 minutes. */
export async function liveSession(s: SessionPayload) {
  if (!s.sid) return null;
  const row = await prisma.session.findUnique({ where: { id: s.sid } });
  if (!row || row.revokedAt || row.expiresAt < new Date() || row.userId !== s.userId) return null;
  if (Date.now() - row.lastSeenAt.getTime() > 5 * 60_000) await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } });
  return row;
}

export async function destroySession(): Promise<void> {
  const s = await getSession();
  if (s?.sid) await prisma.session.updateMany({ where: { id: s.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** FR-AUTH-06: signs a user out of every device (optionally keeping one). */
export async function revokeSessions(userId: string, exceptSid?: string): Promise<void> {
  await prisma.session.updateMany({ where: { userId, revokedAt: null, ...(exceptSid ? { NOT: { id: exceptSid } } : {}) }, data: { revokedAt: new Date() } });
}

/** Between password and login code (FR-AUTH-07): who is logging in, for 10 minutes. */
export async function setPendingLogin(userId: string, remember: boolean) {
  const token = await new SignJWT({ userId, remember, stage: "code" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("600s").sign(getSecret());
  (await cookies()).set(CODE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/login", maxAge: 600 });
}

export async function getPendingLogin(): Promise<{ userId: string; remember: boolean } | null> {
  const token = (await cookies()).get(CODE_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.stage === "code" ? { userId: payload.userId as string, remember: !!payload.remember } : null;
  } catch {
    return null;
  }
}

export async function clearPendingLogin() {
  (await cookies()).delete({ name: CODE_COOKIE, path: "/login" });
}
