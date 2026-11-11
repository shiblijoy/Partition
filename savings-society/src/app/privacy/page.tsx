import Link from "next/link";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Privacy policy · Dreamhive" };

/** NFR-LEG-03: a public privacy policy, linked from the app and the store listing. */
export default async function PrivacyPage() {
  const bn = (await cookies()).get("lang")?.value === "bn"; // read first: the page renders per request
  const settings = await getSettings();
  const s = settings.societyName;
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 leading-relaxed">
      <p className="text-[13px] font-bold"><Link href="/login">← {bn ? "লগইন" : "Log in"}</Link></p>
      <h1 className="mt-2 text-3xl font-extrabold">{bn ? "গোপনীয়তা নীতি" : "Privacy policy"}</h1>
      <p className="mt-1 text-sm text-muted">{s} · {bn ? "সর্বশেষ হালনাগাদ" : "Last updated"} 10 Nov 2026</p>
      {bn && <p className="mt-4 rounded-xl bg-paper p-3 text-sm">নিচের নীতিটি ইংরেজিতে। সংক্ষেপে: আপনার তথ্য শুধু সমিতির হিসাব রাখার জন্য ব্যবহার হয়, কারও কাছে বিক্রি বা শেয়ার করা হয় না, এবং আপনার এনআইডি, ঠিকানা ও নমিনির তথ্য এনক্রিপ্ট করে রাখা হয়।</p>}
      <div className="mt-6 flex flex-col gap-5 text-[15px] [&_h2]:text-lg [&_h2]:font-extrabold [&_ul]:list-disc [&_ul]:pl-5">
        <section>
          <h2>Who we are</h2>
          <p>{s} is a closed savings society. This app is run by the society&apos;s committee for its members. There is no public sign-up: every account is created by an admin.</p>
        </section>
        <section>
          <h2>What we keep, and why</h2>
          <ul>
            <li><strong>Your account:</strong> name, mobile number (your login), member number, and a salted hash of your password (never the password itself).</li>
            <li><strong>Your profile:</strong> NID number, date of birth, address and your nominee&apos;s name, relation, mobile and NID — to identify you and to pay your nominee if something happens to you. These are encrypted in the database.</li>
            <li><strong>Your money records:</strong> deposits, payment proofs (screenshots or photos), receipts, withdrawals, votes and your share of the society&apos;s costs and profits (the profit figures are shown to admins and the auditor only).</li>
            <li><strong>Security records:</strong> when you log in, from which device, and an audit log of changes the admins make.</li>
            <li><strong>Profile photo:</strong> if you add one, it&apos;s seen by you and the admins only.</li>
            <li><strong>Notifications:</strong> notifications sent to you (notices, reminders, approvals) are logged with their delivery status.</li>
          </ul>
        </section>
        <section>
          <h2>Who can see it</h2>
          <p>You can see your own records. The society&apos;s admins can see every member&apos;s records to run the society; an auditor appointed by the society can read them but not change them. Other members never see your payments, proofs, balance or personal details. Every member can see the society&apos;s deposits, costs and investments, and vote counts, but not who voted which way.</p>
        </section>
        <section>
          <h2>Who we share it with</h2>
          <p>We don&apos;t sell or share your data. Push notifications go through your phone&apos;s notification service (Google or Apple) and carry no amounts or personal data beyond your first name and a notice&apos;s title.</p>
        </section>
        <section>
          <h2>How long we keep it</h2>
          <ul>
            <li>Financial records, receipts and the audit log: at least 7 years, as the society&apos;s accounts require.</li>
            <li>Payment proofs: as long as the payment they belong to.</li>
            <li>Expired login sessions and codes: deleted after 30 days.</li>
          </ul>
        </section>
        <section>
          <h2>Deleting your account</h2>
          <p>You can ask to delete your account from <em>My profile → Delete my account</em>. Because membership holds money, deleting your account means leaving the society: you receive your settlement like a full withdrawal. After you confirm the payout, your NID, date of birth, address, email and nominee details are erased. Your payment records and receipts are kept for 7 years, without those details, because the society&apos;s accounts must stay complete.</p>
        </section>
        <section>
          <h2>Your rights</h2>
          <p>You can see your records in the app at any time, download your receipts and yearly statement, and ask the admin to correct anything wrong. Changes to your name or mobile number are made by the admin.</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>Questions about your data: contact the society&apos;s admin through the app (<em>My profile → Name or mobile number wrong?</em>) or at the society&apos;s meeting.</p>
        </section>
      </div>
    </main>
  );
}
