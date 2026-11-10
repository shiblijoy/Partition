import { randomBytes } from "crypto";
import QRCode from "qrcode";
import type { ReceiptKind } from "@prisma/client";
import type { Db } from "@/lib/books";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I to avoid misreading

/** A short code printed on a receipt, e.g. "7F3K-Q9", that anyone can check. */
export function newVerifyCode(): string {
  const bytes = randomBytes(6);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function yymm(date: Date): string {
  return `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** FR-RCP-06: SS-YYMM-NNN for deposits, WD-YYMM-NNN for payouts, sequential within the month. */
export async function nextReceiptNo(db: Db, kind: ReceiptKind, date = new Date()): Promise<string> {
  const prefix = `${kind === "DEPOSIT" ? "SS" : "WD"}-${yymm(date)}-`;
  const last = await db.receipt.findFirst({ where: { receiptNo: { startsWith: prefix } }, orderBy: { receiptNo: "desc" } });
  const n = last ? Number(last.receiptNo.slice(prefix.length)) + 1 : 1;
  return prefix + String(n).padStart(3, "0");
}

export async function issueReceipt(
  db: Db,
  r: { kind: ReceiptKind; memberId: string; amount: number; paymentId?: string; withdrawalId?: string; issuedBy?: string | null; date?: Date }
) {
  const issuedAt = r.date ?? new Date();
  return db.receipt.create({
    data: {
      kind: r.kind,
      receiptNo: await nextReceiptNo(db, r.kind, issuedAt),
      memberId: r.memberId,
      amount: r.amount,
      paymentId: r.paymentId ?? null,
      withdrawalId: r.withdrawalId ?? null,
      verifyCode: newVerifyCode(),
      issuedBy: r.issuedBy ?? null,
      issuedAt,
    },
  });
}

/** The public address a receipt's QR code opens. */
export function verifyUrl(code: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return `${base}/verify?code=${encodeURIComponent(code)}`;
}

/** QR code (SVG markup) that opens the verify page for a receipt. */
export async function receiptQrSvg(code: string): Promise<string> {
  return QRCode.toString(verifyUrl(code), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#14231c", light: "#ffffff" } });
}
