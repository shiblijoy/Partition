import { inputClass, labelClass } from "@/components/ui";

export type AccountOption = { id: string; name: string; type: string; last4: string | null; balance?: number };

export const accountLabel = (a: AccountOption) => `${a.name}${a.last4 ? ` ••${a.last4}` : ""}`;

/** Which society account money moved through (FR-REC-01). */
export function AccountSelect({ accounts, name = "accountId", label = "Account", id, defaultValue, compact = false }: { accounts: AccountOption[]; name?: string; label?: string; id?: string; defaultValue?: string; compact?: boolean }) {
  const fieldId = id ?? `acc-${name}`;
  return (
    <div>
      <label htmlFor={fieldId} className={compact ? "sr-only" : labelClass}>{label}</label>
      <select id={fieldId} name={name} defaultValue={defaultValue ?? accounts.find((a) => a.type === "BANK")?.id ?? accounts[0]?.id} className={compact ? `${inputClass} mt-0 h-10 w-48` : inputClass} required>
        {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
      </select>
    </div>
  );
}
