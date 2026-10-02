/**
 * Personal details a member can propose changes to. Name and mobile number are
 * left out: the mobile number is their login, so only the admin changes those.
 */
export const EDITABLE_FIELDS = [
  ["dateOfBirth", "Date of birth"],
  ["address", "Address"],
  ["nid", "NID"],
  ["nomineeName", "Nominee name"],
  ["nomineeRelation", "Nominee relation"],
  ["nomineePhone", "Nominee mobile"],
  ["nomineeNid", "Nominee NID"],
] as const;

export type EditableField = (typeof EDITABLE_FIELDS)[number][0];
export type DetailChanges = Partial<Record<EditableField, { from: string | null; to: string | null }>>;

export const FIELD_LABELS: Record<EditableField, string> = Object.fromEntries(EDITABLE_FIELDS) as Record<EditableField, string>;

/** Returns an error message, or null if the value is acceptable (empty clears the field). */
export function validateField(field: EditableField, value: string | null): string | null {
  if (!value) return null;
  if ((field === "nid" || field === "nomineeNid") && !/^\d{10}$|^\d{13}$|^\d{17}$/.test(value.replace(/\s/g, ""))) {
    return `${FIELD_LABELS[field]} must be 10, 13 or 17 digits.`;
  }
  if (field === "nomineePhone" && !/^\+?\d{10,14}$/.test(value.replace(/[\s-]/g, ""))) {
    return "Enter the nominee's mobile number.";
  }
  if (value.length > 200) return `${FIELD_LABELS[field]} is too long.`;
  return null;
}

export function parseChanges(json: string | null): DetailChanges {
  if (!json) return {};
  try {
    return JSON.parse(json) as DetailChanges;
  } catch {
    return {};
  }
}
