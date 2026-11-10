import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * NID numbers, addresses, dates of birth and nominee details are encrypted at
 * rest (NFR-LEG-02) with AES-256-GCM. The key is DATA_KEY (32 bytes, base64),
 * or one derived from AUTH_SECRET when DATA_KEY isn't set.
 */
const PREFIX = "enc:v1:";

function key(): Buffer {
  const raw = process.env.DATA_KEY;
  if (raw) {
    const k = Buffer.from(raw, "base64");
    if (k.length !== 32) throw new Error("DATA_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
    return k;
  }
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Set DATA_KEY (or AUTH_SECRET) to encrypt personal details");
  return createHash("sha256").update(`dreamhive-pii:${secret}`).digest();
}

export function encrypt(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  if (value.startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function decrypt(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(PREFIX)) return value; // stored before encryption was added
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export const PII_FIELDS = ["nid", "dateOfBirth", "address", "nomineeName", "nomineeRelation", "nomineePhone", "nomineeNid"] as const;
export type PiiField = (typeof PII_FIELDS)[number];

/** Encrypts the personal-detail fields present in a write. */
export function encryptPii<T extends Partial<Record<PiiField, string | null | undefined>>>(data: T): T {
  const out = { ...data };
  for (const f of PII_FIELDS) if (f in out) (out as Record<string, unknown>)[f] = encrypt(out[f] as string | null);
  return out;
}

/** A user with personal details readable. Safe to call twice. */
export function pii<T extends Partial<Record<PiiField, string | null>>>(user: T): T {
  const out = { ...user };
  for (const f of PII_FIELDS) if (f in out) (out as Record<string, unknown>)[f] = decrypt(out[f] as string | null);
  return out;
}
