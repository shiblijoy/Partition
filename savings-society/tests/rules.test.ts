/**
 * NFR-MNT-01: a test for every rule in section 4 of the specification that can
 * be checked without a database. Run with `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rateFor, sumRates } from "@/lib/rates";
import { memberLedger } from "@/lib/ledger";
import { isEligible, splitPaisa } from "@/lib/books";
import { paisaToTaka } from "@/lib/settings";
import { votesNeeded, tally } from "@/lib/votes";
import { takaInWords, takaInWordsBn } from "@/lib/format";
import { decrypt, encrypt, encryptPii, pii } from "@/lib/crypto";
import { newVerifyCode } from "@/lib/receipts";
import { secondApproval } from "@/lib/services/investments";
import { accessFor } from "@/lib/auth-guard";
import { translate, monthName } from "@/lib/i18n";

process.env.AUTH_SECRET ??= "test-secret";

test("BR-01 / FR-SET-02: each month keeps the amount in force for it", () => {
  const rates = [{ fromMonth: "2026-01", amount: 10000 }, { fromMonth: "2027-01", amount: 12000 }];
  assert.equal(rateFor("2026-06", rates), 10000);
  assert.equal(rateFor("2027-01", rates), 12000);
  assert.equal(rateFor("2025-12", rates), 10000, "months before the first rate use the first rate");
  assert.equal(sumRates(["2026-12", "2027-01"], rates), 22000);
});

test("BR-02 / BR-04: a month is paid only by its own approved payment; Behind when a past month is unpaid", () => {
  const settings = { rates: [{ fromMonth: "2026-01", amount: 10000 }], startMonth: "2026-01" };
  const l = memberLedger({ joinMonth: "2026-01" }, [{ forMonth: "2026-01", amount: 10000 }, { forMonth: "2026-03", amount: 10000 }], settings, { pending: ["2026-04"], asOf: "2026-04" });
  assert.equal(l.statusFor("2026-01"), "paid");
  assert.equal(l.statusFor("2026-02"), "due");
  assert.equal(l.statusFor("2026-04"), "pending");
  assert.equal(l.statusFor("2026-05"), "upcoming");
  assert.equal(l.behind, true);
  assert.equal(l.due, 20000, "February and April are owed");
  assert.equal(l.paidThrough, "2026-01");
  assert.equal(l.monthsPaid, 2);
});

test("BR-03: pending payments never count as deposits", () => {
  const l = memberLedger({ joinMonth: "2026-01" }, [], { rates: [{ fromMonth: "2026-01", amount: 10000 }], startMonth: "2026-01" }, { pending: ["2026-01"], asOf: "2026-01" });
  assert.equal(l.paid, 0);
  assert.equal(l.due, 10000);
});

test("BR-05 / BR-08: shares go to members active on the date; start-fresh members from their first month", () => {
  const base = { joiningRule: "FRESH", caughtUpAt: null, createdAt: new Date("2026-01-01"), exitedAt: null, deceasedOn: null };
  const d = new Date("2026-05-15");
  assert.equal(isEligible({ ...base, joinMonth: "2026-01" }, d), true);
  assert.equal(isEligible({ ...base, joinMonth: "2026-06" }, d), false, "joined later: no share");
  assert.equal(isEligible({ ...base, joinMonth: "2026-01", exitedAt: new Date("2026-05-01") }, d), false, "left before: no share");
  assert.equal(isEligible({ ...base, joinMonth: "2026-01", exitedAt: new Date("2026-06-01") }, d), true, "exiting: still shares");
  const payBack = { ...base, joinMonth: "2026-01", joiningRule: "PAY_BACK", createdAt: new Date("2026-08-01") };
  assert.equal(isEligible(payBack, d), false, "pay-back member not yet caught up: no share of older items");
  assert.equal(isEligible({ ...payBack, caughtUpAt: new Date("2026-09-01") }, d), true, "caught up: a founding member");
});

test("BR-10: shares are kept in paisa, shown rounded; the remainder stays in the fund", () => {
  const each = splitPaisa(-18450 * 100, 24); // §9.1: ৳18,450 across 24 members
  assert.equal(each, -76875);
  assert.equal(paisaToTaka(-each), 769);
  const odd = splitPaisa(1000 * 100, 3);
  assert.equal(odd, 33333);
  assert.equal(100000 - odd * 3, 1, "1 paisa stays in the fund");
});

test("BR-12 / §9.1: ৳2,400 bank interest adds ৳100 to each of 24 members", () => {
  assert.equal(paisaToTaka(splitPaisa(2400 * 100, 24)), 100);
});

test("§4 worked example: ৳90,000 + ৳2,875 − ৳769 = ৳92,106; with land share now ৳98,356", () => {
  const profit = paisaToTaka(splitPaisa(69000 * 100, 24));
  const cost = paisaToTaka(-splitPaisa(-18450 * 100, 24));
  const land = paisaToTaka(splitPaisa(150000 * 100, 24));
  assert.equal(profit, 2875);
  assert.equal(cost, 769);
  assert.equal(90000 + profit - cost, 92106);
  assert.equal(90000 + profit - cost + land, 98356);
});

test("FR-INV-03: vote rules", () => {
  assert.equal(votesNeeded("MAJORITY", 24), 13);
  assert.equal(votesNeeded("TWO_THIRDS", 24), 16);
  assert.equal(votesNeeded("EVERYONE", 24), 24);
  const t = tally([...Array(13)].map(() => ({ choice: "YES" as const })), "MAJORITY", 24);
  assert.equal(t.passed, true);
});

test("NFR-SEC-07: above the limit a second, different admin must confirm", () => {
  const a = { id: "a1", name: "A" };
  assert.equal(secondApproval(null, 1_000_000, null, a), "complete");
  assert.equal(secondApproval(500000, 400000, null, a), "complete");
  assert.equal(secondApproval(500000, 600000, null, a), "first");
  assert.throws(() => secondApproval(500000, 600000, "a1", a));
  assert.equal(secondApproval(500000, 600000, "a2", a), "complete");
});

test("FR-RCP-01: amount in words, English and Bangla", () => {
  assert.equal(takaInWords(92106), "Ninety-two thousand one hundred six taka only");
  assert.equal(takaInWords(150000), "One lakh fifty thousand taka only");
  assert.equal(takaInWordsBn(92106), "বিরানব্বই হাজার একশত ছয় টাকা মাত্র");
  assert.equal(takaInWordsBn(10000), "দশ হাজার টাকা মাত্র");
  assert.equal(takaInWordsBn(1_25_00_000), "এক কোটি পঁচিশ লক্ষ টাকা মাত্র");
});

test("FR-RCP-05: verification codes avoid look-alike characters", () => {
  for (let i = 0; i < 200; i++) assert.match(newVerifyCode(), /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{2}$/);
});

test("NFR-LEG-02: personal details are encrypted at rest and read back", () => {
  const e = encrypt("1990123456789");
  assert.ok(e?.startsWith("enc:v1:"));
  assert.notEqual(e, encrypt("1990123456789"), "random IV: the same value encrypts differently");
  assert.equal(decrypt(e), "1990123456789");
  const user = pii(encryptPii({ nid: "123", nomineeName: "Ayesha", address: null }));
  assert.deepEqual(user, { nid: "123", nomineeName: "Ayesha", address: null });
  assert.equal(decrypt("plain text from before"), "plain text from before");
});

test("FR-MEM-07: a member who left keeps read-only access for 12 months", () => {
  const left = (days: number) => ({ active: true, exit: "LEFT", exitedAt: new Date(Date.now() - days * 86_400_000), role: "MEMBER" });
  assert.equal(accessFor(left(30)), "read");
  assert.equal(accessFor(left(400)), "none");
  assert.equal(accessFor({ active: true, exit: null, exitedAt: null, role: "MEMBER" }), "full");
  assert.equal(accessFor({ active: true, exit: null, exitedAt: null, role: "AUDITOR" }), "read");
  assert.equal(accessFor({ active: false, exit: null, exitedAt: null, role: "MEMBER" }), "none");
});

test("NFR-USE-02: Bangla text with English fallback", () => {
  assert.equal(translate("bn", "Log in"), "লগ ইন");
  assert.equal(translate("bn", "A string nobody translated"), "A string nobody translated");
  assert.equal(translate("en", "Hi, {name}", { name: "Rahim" }), "Hi, Rahim");
  assert.equal(monthName("2026-10", "bn"), "অক্টোবর 2026");
});
