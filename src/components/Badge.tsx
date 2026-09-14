const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-blue-50 text-blue-700",
  FOR_SALE: "bg-emerald-50 text-emerald-700",
  SOLD: "bg-stone-100 text-stone-600",
  DECEASED: "bg-red-50 text-red-700",
  PENDING: "bg-amber-50 text-amber-700",
  CONFIRMED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-stone-100 text-stone-500",
  COMPLETED: "bg-blue-50 text-blue-700",
};

export function Badge({ label }: { label: string }) {
  const style = STATUS_STYLES[label] ?? "bg-stone-100 text-stone-600";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>
      {label.replace("_", " ")}
    </span>
  );
}

export const SPECIES_EMOJI: Record<string, string> = {
  COW: "🐄",
  GOAT: "🐐",
  LAMB: "🐑",
  CHICKEN: "🐔",
  OTHER: "🐾",
};
