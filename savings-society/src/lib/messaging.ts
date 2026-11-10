import { prisma } from "@/lib/prisma";

/**
 * WhatsApp Business Platform (Cloud API) with approved templates (§6.2), and an
 * SMS gateway as fallback for numbers without WhatsApp. Both are optional: set
 *   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID  (and WHATSAPP_LANG, default "en")
 *   SMS_GATEWAY_URL  e.g. https://sms.example.com/send?to={to}&text={text}&key=…
 * Without them, messages are logged as SKIPPED and the admin uses the
 * ready-to-send wa.me links the app shows instead.
 */
export type Template = "login_code" | "temp_password" | "payment_due" | "payment_rejected";

const TEMPLATE_TEXT: Record<Template, (p: string[]) => string> = {
  login_code: ([code]) => `${code} is your Dreamhive admin login code. It expires in 5 minutes. Do not share it.`,
  temp_password: ([name, password]) => `Hi ${name}, your Dreamhive temporary password is ${password}. Log in with your mobile number and set your own password.`,
  payment_due: ([name, month, amount]) => `Hi ${name}, your Dreamhive deposit of ${amount} for ${month} is due. Please pay and upload the proof in the app.`,
  payment_rejected: ([name, month, reason]) => `Hi ${name}, your Dreamhive payment for ${month} was not approved: ${reason}. Please submit it again in the app.`,
};

export function whatsappConfigured(): boolean {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

export function smsConfigured(): boolean {
  return !!process.env.SMS_GATEWAY_URL;
}

/** Bangladeshi numbers in international form without "+": 017… → 88017… */
export function intlNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? "88" + digits : digits;
}

async function log(entry: { userId?: string | null; to: string; channel: string; template: string; status: string; providerId?: string | null; error?: string | null }) {
  await prisma.messageLog.create({ data: { userId: entry.userId ?? null, to: entry.to, channel: entry.channel, template: entry.template, status: entry.status, providerId: entry.providerId ?? null, error: entry.error ?? null } });
}

async function sendWhatsapp(to: string, template: Template, params: string[]): Promise<{ ok: boolean; id?: string; error?: string }> {
  const components: unknown[] = [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }];
  // Authentication templates carry the code again on their copy-code button.
  if (template === "login_code") components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: params[0] }] });
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: template, language: { code: process.env.WHATSAPP_LANG || "en" }, components } }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string } };
  return res.ok ? { ok: true, id: body.messages?.[0]?.id } : { ok: false, error: body.error?.message ?? `HTTP ${res.status}` };
}

async function sendSms(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.SMS_GATEWAY_URL!.replace("{to}", encodeURIComponent(to)).replace("{text}", encodeURIComponent(text));
  const res = await fetch(url, { method: process.env.SMS_GATEWAY_METHOD || "GET", signal: AbortSignal.timeout(10_000) });
  return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
}

/**
 * Sends a template message: WhatsApp, retried once, then SMS (§6.2). Every
 * attempt is logged with its status (and the WhatsApp message ID, for cost
 * tracking). Returns the channel that worked, or null.
 */
export async function sendTemplate(phone: string, template: Template, params: string[], userId?: string | null): Promise<"WHATSAPP" | "SMS" | null> {
  const to = intlNumber(phone);
  if (whatsappConfigured()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await sendWhatsapp(to, template, params);
        await log({ userId, to, channel: "WHATSAPP", template, status: r.ok ? "SENT" : "FAILED", providerId: r.id, error: r.error });
        if (r.ok) return "WHATSAPP";
      } catch (err) {
        await log({ userId, to, channel: "WHATSAPP", template, status: "FAILED", error: String(err) });
      }
    }
  }
  if (smsConfigured()) {
    try {
      const r = await sendSms(to, TEMPLATE_TEXT[template](params));
      await log({ userId, to, channel: "SMS", template, status: r.ok ? "SENT" : "FAILED", error: r.error });
      if (r.ok) return "SMS";
    } catch (err) {
      await log({ userId, to, channel: "SMS", template, status: "FAILED", error: String(err) });
    }
  }
  if (!whatsappConfigured() && !smsConfigured()) await log({ userId, to, channel: "WHATSAPP", template, status: "SKIPPED", error: "WhatsApp and SMS are not set up" });
  return null;
}

export function templatePreview(template: Template, params: string[]): string {
  return TEMPLATE_TEXT[template](params);
}
