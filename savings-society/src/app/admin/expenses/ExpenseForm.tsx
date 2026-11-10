"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { AccountSelect, type AccountOption } from "@/components/AccountSelect";
import { fileClass, inputClass, labelClass, textareaClass, CATEGORY_LABELS } from "@/components/ui";
import { addExpense } from "./actions";

/** FR-EXP-02: the extra cost per member is shown before the expense is saved. */
export function ExpenseForm({ members, currency, today, accounts }: { members: number; currency: string; today: string; accounts: AccountOption[] }) {
  const [amount, setAmount] = useState("");
  const n = Number(amount);
  const each = members > 0 && n > 0 ? Math.trunc((Math.round(n) * 100) / members) / 100 : 0;
  return (
    <ActionForm action={addExpense} submitLabel="Save expense">
      <div>
        <label htmlFor="date" className={labelClass}>Date</label>
        <input id="date" name="date" type="date" required defaultValue={today} max={today} className={inputClass} />
      </div>
      <div>
        <label htmlFor="category" className={labelClass}>Category</label>
        <select id="category" name="category" defaultValue="MEETING" className={inputClass}>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="amount" className={labelClass}>Amount ({currency})</label>
        <input id="amount" name="amount" type="number" inputMode="numeric" min="1" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
      </div>
      <AccountSelect accounts={accounts} label="Paid from" id="exp-account" />
      <div>
        <label htmlFor="description" className={labelClass}>Description</label>
        <textarea id="description" name="description" rows={2} required placeholder="What was it for?" className={textareaClass} />
      </div>
      <div>
        <label htmlFor="receipt" className={labelClass}>Attach receipt photo</label>
        <input id="receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
      </div>
      <p className="rounded-xl bg-paper p-3 text-[13px] leading-relaxed" aria-live="polite">
        {each > 0 ? (
          <>Adds <strong>{currency} {each.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</strong> to each of the {members} members&apos; cost share (about {currency} {Math.round(each).toLocaleString("en-IN")}; the paisa left over stays in the fund).</>
        ) : (
          <>Each expense is split equally across the {members} members active on its date, and everyone sees it in their app.</>
        )}
      </p>
    </ActionForm>
  );
}
