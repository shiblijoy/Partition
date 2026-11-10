"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { fileClass, inputClass, labelClass, textareaClass } from "@/components/ui";
import { postNotice } from "./actions";

const KINDS: Array<[string, string]> = [
  ["MEETING", "Meeting"],
  ["REMINDER", "Reminder"],
  ["DECISION", "Decision"],
  ["GENERAL", "Notice"],
];
const seg = (on: boolean) =>
  `flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-lg px-2 text-[13px] ${on ? "bg-white font-bold text-ink shadow-sm" : "font-semibold text-muted"}`;

export function NoticeForm({ proposals }: { proposals: Array<{ id: string; name: string }> }) {
  const [kind, setKind] = useState("MEETING");
  return (
    <ActionForm action={postNotice} submitLabel="Post to all members">
      <div className="flex gap-1 rounded-xl bg-line p-1">
        {KINDS.map(([k, l]) => (
          <label key={k} className={seg(kind === k)}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
            {l}
          </label>
        ))}
      </div>
      <div>
        <label htmlFor="n-title" className={labelClass}>Title</label>
        <input id="n-title" name="title" required placeholder={kind === "MEETING" ? "Monthly meeting · October" : ""} className={inputClass} />
      </div>
      <div>
        <label htmlFor="n-body" className={labelClass}>Message</label>
        <textarea id="n-body" name="body" required rows={4} placeholder={kind === "MEETING" ? "Agenda: vote result, last month's accounts, new member requests." : ""} className={textareaClass} />
      </div>
      {kind === "MEETING" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="n-when" className={labelClass}>Date and time</label>
            <input id="n-when" name="eventAt" type="datetime-local" required className={inputClass} />
          </div>
          <div>
            <label htmlFor="n-place" className={labelClass}>Place</label>
            <input id="n-place" name="place" className={inputClass} />
          </div>
        </div>
      )}
      {proposals.length > 0 && (
        <div>
          <label htmlFor="n-inv" className={labelClass}>About a proposal or vote (optional)</label>
          <select id="n-inv" name="investmentId" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {proposals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="n-file" className={labelClass}>Attach file (agenda, photo, PDF)</label>
        <input id="n-file" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input type="checkbox" name="whatsapp" defaultChecked className="h-5 w-5 accent-brand" />
        Also share on WhatsApp
      </label>
    </ActionForm>
  );
}
