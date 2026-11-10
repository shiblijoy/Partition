/** An error whose message is meant for the person using the app (shown in the form). */
export class ServiceError extends Error {}

export function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
