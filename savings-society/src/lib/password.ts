import bcrypt from "bcryptjs";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const WORDS = ["honey", "river", "mango", "lotus", "paddy", "sunny", "green", "tiger", "cloud", "jasmine"];

/** An easy-to-type temporary password, e.g. "mango-4821". The member must change it at first login. */
export function temporaryPassword(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${word}-${String(Math.floor(1000 + Math.random() * 9000))}`;
}
