"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { inputClass, labelClass } from "@/components/ui";
import { addMember } from "./actions";

const seg = (on: boolean) =>
  `flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-[13px] ${on ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-muted"}`;

export function AddMemberForm({ thisMonth, catchUpLabel, startLabel }: { thisMonth: string; catchUpLabel: string; startLabel: string }) {
  const [rule, setRule] = useState<"fresh" | "catchup">("fresh");
  return (
    <ActionForm action={addMember} submitLabel="Add & create temporary password" resetOnSuccess>
      <div>
        <label htmlFor="name" className={labelClass}>Full name</label>
        <input id="name" name="name" required className={inputClass} />
      </div>
      <div>
        <label htmlFor="phone" className={labelClass}>Mobile number (login)</label>
        <input id="phone" name="phone" type="tel" required placeholder="01XXXXXXXXX" className={inputClass} />
      </div>
      <fieldset>
        <legend className={`${labelClass} mb-1.5`}>Joining rule</legend>
        <div className="flex gap-1 rounded-xl bg-line p-1">
          <label className={seg(rule === "fresh")}>
            <input type="radio" name="rule" value="fresh" checked={rule === "fresh"} onChange={() => setRule("fresh")} className="sr-only" />
            Start from first month
          </label>
          <label className={seg(rule === "catchup")}>
            <input type="radio" name="rule" value="catchup" checked={rule === "catchup"} onChange={() => setRule("catchup")} className="sr-only" />
            Pay back all past months ({catchUpLabel})
          </label>
        </div>
      </fieldset>
      {rule === "fresh" ? (
        <div>
          <label htmlFor="joinMonth" className={labelClass}>First month</label>
          <input id="joinMonth" name="joinMonth" type="month" required defaultValue={thisMonth} className={inputClass} />
        </div>
      ) : (
        <p className="text-[13px] text-muted">They owe every month since the society started ({startLabel}), the same as the founding members.</p>
      )}
      <p className="text-xs leading-relaxed text-muted">
        A temporary password is created for you to send on WhatsApp (SMS if the number has no WhatsApp). The member must set their own password at first login.
      </p>
    </ActionForm>
  );
}
