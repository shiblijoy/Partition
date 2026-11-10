"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { submitPayment } from "./actions";
import type { PayState } from "./submit";
import { Icon } from "@/components/icons";
import { inputClass, labelClass, primaryButton } from "@/components/ui";
import { compressImage } from "@/lib/client/compress";
import { queuePayment } from "@/lib/client/offline-queue";
import { useT } from "@/components/I18n";

const initialState: PayState = {};

const chip = (on: boolean) =>
  `flex h-11 cursor-pointer items-center justify-center rounded-xl bg-white px-3 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/40 ${
    on ? "border-2 border-brand font-bold text-ink" : "border border-field font-semibold text-muted"
  }`;

export function PayForm({
  months,
  currency,
  monthlyLabel,
  paymentInfo,
  today,
}: {
  months: Array<{ key: string; label: string; due: boolean; amount: number }>;
  currency: string;
  monthlyLabel: string;
  paymentInfo: string | null;
  today: string;
}) {
  const t = useT();
  const [state, formAction, pending] = useActionState(submitPayment, initialState);
  const [picked, setPicked] = useState<string[]>(months[0] ? [months[0].key] : []);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const totalAmount = months.filter((m) => picked.includes(m.key)).reduce((s, m) => s + m.amount, 0);
  const total = new Intl.NumberFormat("en-IN").format(totalAmount);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  if (savedOffline) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5 text-sm leading-relaxed">
        <p className="text-base font-extrabold">{t("Saved on your phone")}</p>
        <p>{t("You're offline. The payment will be sent to the admin automatically when your internet comes back.")}</p>
      </div>
    );
  }

  if (months.length === 0) {
    return <p className="rounded-2xl border border-line bg-white p-4 text-sm">{t("Every month up to a year ahead is already paid or waiting for approval.")}</p>;
  }

  return (
    <form
      ref={formRef}
      // Submitted by hand rather than with the form's action prop, so the fields (and the chosen
      // photo) stay filled in when the server answers with a warning or an error.
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (!navigator.onLine) {
          await queuePayment(data);
          setSavedOffline(true);
          return;
        }
        startTransition(() => formAction(data));
      }}
      className="flex flex-col gap-4 pb-4"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className={`${labelClass} mb-2`}>{t("Paying for · pick one or more months")}</legend>
        <div className="flex flex-wrap gap-2">
          {months.map((m) => {
            const on = picked.includes(m.key);
            return (
              <label key={m.key} className={chip(on)}>
                <input
                  type="checkbox"
                  name="months"
                  value={m.key}
                  checked={on}
                  onChange={() => setPicked(on ? picked.filter((k) => k !== m.key) : [...picked, m.key].sort())}
                  className="sr-only"
                />
                {m.label}
                {m.due && <span className="ml-1.5 text-xs font-bold text-bad">{t("due")}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3.5">
        <div className="flex flex-col gap-0.5">
          <div className="text-[13px] text-muted">
            {picked.length === 1 ? t("Deposit for 1 month") : t("Deposit for {n} months · one proof", { n: picked.length })}
          </div>
          <div className="text-2xl font-extrabold">{currency} {total}</div>
        </div>
        <div className="text-right text-xs leading-snug text-muted">{t("{amount} a month", { amount: monthlyLabel })}<br />{t("set by admin")}</div>
      </div>

      {paymentInfo && (
        <div className="whitespace-pre-line rounded-2xl border border-line bg-white px-4 py-3 text-[13px] leading-relaxed">
          <p className="font-bold">{t("Where to send money")}</p>
          {paymentInfo}
        </div>
      )}

      <input type="hidden" name="method" value="BANK" />
      <p className="text-[13px] text-muted">{t("The society accepts bank payments only: a bank transfer or a deposit at the branch.")}</p>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div>
          <label htmlFor="reference" className={labelClass}>{t("Bank transaction ID / reference")}</label>
          <input id="reference" name="reference" required autoCapitalize="characters" className={inputClass} />
        </div>
        <div>
          <label htmlFor="paidOn" className={labelClass}>{t("Paid on")}</label>
          <input id="paidOn" name="paidOn" type="date" required defaultValue={today} max={today} className={`${inputClass} w-40`} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className={labelClass}>{t("Proof (bank slip or transfer screenshot)")}</div>
        <div className="flex gap-2.5">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob: preview, not a served image
            <img src={preview} alt={t("Selected proof")} className="h-28 w-[92px] rounded-xl object-cover" />
          )}
          {!preview && fileName && (
            <div className="flex h-28 w-[92px] items-center justify-center rounded-xl bg-line p-1.5 text-center text-[11px] text-muted">{fileName}</div>
          )}
          <label
            htmlFor="proof"
            className="flex h-28 flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#B9B5A7] text-ink has-[:focus-visible]:ring-2"
          >
            <Icon name="camera" size={24} />
            <span className="text-sm font-semibold">{compressing ? t("Preparing photo…") : fileName ? t("Change photo") : t("Add photo")}</span>
            <span className="text-xs text-muted">{t("Camera or gallery · JPEG, PNG or PDF")}</span>
            <input
              ref={fileRef}
              id="proof"
              name="proof"
              type="file"
              required
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              onChange={async (e) => {
                const original = e.target.files?.[0];
                if (!original) return;
                setCompressing(true);
                const file = await compressImage(original);
                setCompressing(false);
                if (file !== original && fileRef.current) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  fileRef.current.files = dt.files; // upload the smaller copy
                }
                setFileName(file.name);
                setPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
        </div>
      </div>

      <div>
        <label htmlFor="note" className={labelClass}>{t("Note for admin (optional)")}</label>
        <input id="note" name="note" placeholder={t("e.g. Paid from my brother's account")} className={inputClass} />
      </div>

      {state.warning && (
        <div className="flex flex-col gap-2 rounded-xl bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">
          <p>{t(state.warning)}</p>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="confirmDuplicate" className="h-5 w-5 accent-brand" />
            {t("The transaction ID is right, send it anyway")}
          </label>
        </div>
      )}
      {state.error && <p className="rounded-xl bg-bad-bg px-4 py-3 text-sm font-semibold text-bad">{t(state.error)}</p>}

      <button type="submit" disabled={pending || compressing || picked.length === 0} className={`h-13 w-full ${primaryButton}`}>
        {pending ? t("Uploading…") : t("Send to admin for approval")}
      </button>
    </form>
  );
}
