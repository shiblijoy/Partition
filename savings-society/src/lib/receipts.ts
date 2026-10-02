import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I to avoid misreading

/** A short code printed on a receipt, e.g. "7F3K-Q9", that anyone in the app can check. */
export function newVerifyCode(): string {
  const bytes = randomBytes(6);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function yymm(date: Date): string {
  return `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Next deposit receipt number for the month, e.g. "DH-2610-007". */
export async function nextDepositReceiptNo(date = new Date()): Promise<string> {
  const prefix = `DH-${yymm(date)}-`;
  const count = await prisma.payment.count({ where: { receiptNo: { startsWith: prefix } } });
  return prefix + String(count + 1).padStart(3, "0");
}

/** Next payout receipt number for the month, e.g. "WD-2610-001". */
export async function nextPayoutReceiptNo(date = new Date()): Promise<string> {
  const prefix = `WD-${yymm(date)}-`;
  const count = await prisma.withdrawal.count({ where: { receiptNo: { startsWith: prefix } } });
  return prefix + String(count + 1).padStart(3, "0");
}
