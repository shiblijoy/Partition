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

// Bangla numbers 0–99 are irregular words, so they're listed in full.
const BN_0_99 = [
  "শূন্য", "এক", "দুই", "তিন", "চার", "পাঁচ", "ছয়", "সাত", "আট", "নয়",
  "দশ", "এগারো", "বারো", "তেরো", "চৌদ্দ", "পনেরো", "ষোলো", "সতেরো", "আঠারো", "উনিশ",
  "বিশ", "একুশ", "বাইশ", "তেইশ", "চব্বিশ", "পঁচিশ", "ছাব্বিশ", "সাতাশ", "আটাশ", "ঊনত্রিশ",
  "ত্রিশ", "একত্রিশ", "বত্রিশ", "তেত্রিশ", "চৌত্রিশ", "পঁয়ত্রিশ", "ছত্রিশ", "সাঁইত্রিশ", "আটত্রিশ", "ঊনচল্লিশ",
  "চল্লিশ", "একচল্লিশ", "বিয়াল্লিশ", "তেতাল্লিশ", "চুয়াল্লিশ", "পঁয়তাল্লিশ", "ছেচল্লিশ", "সাতচল্লিশ", "আটচল্লিশ", "ঊনপঞ্চাশ",
  "পঞ্চাশ", "একান্ন", "বাহান্ন", "তিপ্পান্ন", "চুয়ান্ন", "পঞ্চান্ন", "ছাপ্পান্ন", "সাতান্ন", "আটান্ন", "ঊনষাট",
  "ষাট", "একষট্টি", "বাষট্টি", "তেষট্টি", "চৌষট্টি", "পঁয়ষট্টি", "ছেষট্টি", "সাতষট্টি", "আটষট্টি", "ঊনসত্তর",
  "সত্তর", "একাত্তর", "বাহাত্তর", "তিয়াত্তর", "চুয়াত্তর", "পঁচাত্তর", "ছিয়াত্তর", "সাতাত্তর", "আটাত্তর", "ঊনআশি",
  "আশি", "একাশি", "বিরাশি", "তিরাশি", "চুরাশি", "পঁচাশি", "ছিয়াশি", "সাতাশি", "আটাশি", "ঊননব্বই",
  "নব্বই", "একানব্বই", "বিরানব্বই", "তিরানব্বই", "চুরানব্বই", "পঁচানব্বই", "ছিয়ানব্বই", "সাতানব্বই", "আটানব্বই", "নিরানব্বই",
];

/** Amount in words in Bangla, with লক্ষ / কোটি: "বিরানব্বই হাজার একশত ছয় টাকা মাত্র". */
export function takaInWordsBn(amount: number): string {
  let n = Math.round(Math.abs(amount));
  if (n === 0) return "শূন্য টাকা মাত্র";
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (crore) parts.push(`${crore < 100 ? BN_0_99[crore] : takaInWordsBn(crore).replace(" টাকা মাত্র", "")} কোটি`);
  if (lakh) parts.push(`${BN_0_99[lakh]} লক্ষ`);
  if (thousand) parts.push(`${BN_0_99[thousand]} হাজার`);
  if (hundred) parts.push(`${BN_0_99[hundred]}শত`);
  if (rest) parts.push(BN_0_99[rest]);
  return `${parts.join(" ")} টাকা মাত্র`;
}

export function inWords(amount: number, lang: string): string {
  return lang === "bn" ? takaInWordsBn(amount) : takaInWords(amount);
}
