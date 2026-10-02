/** "2 Oct 2026" */
export function fmtDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "2 Oct" */
export function fmtDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "2 Oct 2026, 11:42" */
export function fmtDateTime(date: Date): string {
  return `${fmtDate(date)}, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

/** Value for an <input type="date">. */
export function dateInput(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
}

function belowThousand(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} hundred` : "", rest ? belowHundred(rest) : ""].filter(Boolean).join(" ");
}

/** Amount in words with lakh/crore, as written on Bangladeshi receipts: "Ninety-two thousand one hundred six taka only". */
export function takaInWords(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero taka only";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} thousand`);
  if (n) parts.push(belowThousand(n));
  const words = parts.join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1) + " taka only";
}

/** wa.me link that opens WhatsApp with a message ready to send. */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? "88" + digits : digits; // Bangladeshi numbers: 017… → 88017…
  return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`;
}

/** Masks all but the last 4 characters: "•••• •••• 4821". */
export function mask(value: string | null | undefined): string {
  if (!value) return "—";
  return "•••• •••• " + value.slice(-4);
}

/** A date n days from now. */
export function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 86_400_000);
}
