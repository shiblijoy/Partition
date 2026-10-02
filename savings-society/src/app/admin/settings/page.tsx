import { getSettings } from "@/lib/settings";
import { Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { updateSettings } from "./actions";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Settings" />
      <Card title="Society">
        <ActionForm action={updateSettings} submitLabel="Save settings" resetOnSuccess={false}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="societyName" className={labelClass}>Society name</label>
              <input id="societyName" name="societyName" required defaultValue={settings.societyName} className={inputClass} />
            </div>
            <div>
              <label htmlFor="monthlyAmount" className={labelClass}>Monthly deposit per member</label>
              <input id="monthlyAmount" name="monthlyAmount" type="number" min="1" step="any" required defaultValue={settings.monthlyAmount} className={inputClass} />
            </div>
            <div>
              <label htmlFor="currencySymbol" className={labelClass}>Currency symbol</label>
              <input id="currencySymbol" name="currencySymbol" required maxLength={4} defaultValue={settings.currencySymbol} className={inputClass} />
            </div>
            <div>
              <label htmlFor="startMonth" className={labelClass}>Society&apos;s first month</label>
              <input id="startMonth" name="startMonth" type="month" required defaultValue={settings.startMonth} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="paymentInfo" className={labelClass}>Where members should send money</label>
              <textarea
                id="paymentInfo"
                name="paymentInfo"
                rows={4}
                defaultValue={settings.paymentInfo ?? ""}
                placeholder={"bKash (personal): 01XXXXXXXXX\nBank: XYZ Bank, A/C 1234567890, Gulshan branch"}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">Shown to members on the Pay screen.</p>
            </div>
          </div>
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Changing the monthly amount re-calculates every member&apos;s expected total for all months, including past ones.
          </p>
        </ActionForm>
      </Card>
      <Card title="My password">
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
