/** Strips spaces/dashes so "017-0000 0000" and "01700000000" match. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}
