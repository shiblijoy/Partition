import { FIELD_LABELS, type DetailChanges, type EditableField } from "@/lib/profile-fields";

/** Old → new for each field in a proposed details edit. */
export function ChangeList({ changes }: { changes: DetailChanges }) {
  const fields = Object.keys(changes) as EditableField[];
  return (
    <dl className="flex flex-col gap-2 text-sm">
      {fields.map((f) => (
        <div key={f} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted">{FIELD_LABELS[f]}</dt>
          <dd className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted line-through">{changes[f]?.from || "empty"}</span>
            <span aria-hidden="true">→</span>
            <span className="sr-only">changes to</span>
            <span className="font-bold">{changes[f]?.to || "empty"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
