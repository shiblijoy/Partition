"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { inputClass, labelClass, primaryButton } from "@/components/ui";
import { requestWithdrawal } from "./actions";
import { useT } from "@/components/I18n";

const option = (on: boolean) =>
  `flex cursor-pointer flex-col items-start gap-0.5 rounded-xl bg-white px-3.5 py-3 text-left text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
    on ? "border-2 border-brand" : "border border-field"
  }`;

export function WithdrawForm({ currency }: { currency: string }) {
  const t = useT();
  const [kind, setKind] = useState<"FULL" | "PARTIAL">("FULL");
  return (
    <ActionForm action={requestWithdrawal} submitLabel={t("Send request to admin")} buttonClass={`h-13 w-full ${primaryButton}`} resetOnSuccess={false}>
      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>{t("What do you want?")}</legend>
        <label className={option(kind === "FULL")}>
          <input type="radio" name="kind" value="FULL" checked={kind === "FULL"} onChange={() => setKind("FULL")} className="sr-only" />
          <span className="font-bold">{t("Leave the society")}</span>
          <span className="text-xs text-muted">{t("Get your full settlement, membership ends")}</span>
        </label>
        <label className={option(kind === "PARTIAL")}>
          <input type="radio" name="kind" value="PARTIAL" checked={kind === "PARTIAL"} onChange={() => setKind("PARTIAL")} className="sr-only" />
          <span className="font-bold">{t("Take out part of my savings")}</span>
          <span className="text-xs text-muted">{t("Stay a member, if the society's rules allow")}</span>
        </label>
      </fieldset>
      {kind === "PARTIAL" && (
        <div>
          <label htmlFor="amount" className={labelClass}>{t("Amount")} ({currency})</label>
          <input id="amount" name="amount" type="number" inputMode="numeric" min="1" required className={inputClass} />
        </div>
      )}
      <div>
        <label htmlFor="payTo" className={labelClass}>{t("Your bank account (bank, account name and number)")}</label>
        <input id="payTo" name="payTo" required placeholder={t("e.g. [Bank], [Your name], A/C [number]")} className={inputClass} />
      </div>
      <div>
        <label htmlFor="reason" className={labelClass}>{t("Reason (optional)")}</label>
        <input id="reason" name="reason" placeholder={t("Helps the admin plan")} className={inputClass} />
      </div>
    </ActionForm>
  );
}
