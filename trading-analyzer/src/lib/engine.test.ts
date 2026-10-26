import { test } from "node:test";
import assert from "node:assert/strict";
import { rsi, sma, ema, atr } from "./indicators";
import { demoData } from "./market";
import { analyseMarket } from "./analyze";
import { backtest, tilt, scenarios, verdict } from "./forecast";
import { headlineSentiment } from "./sentiment";

test("sma / ema basics", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  const e = ema([1, 1, 1, 1, 1], 3);
  assert.equal(e[4], 1);
});

test("rsi is 100 on a pure uptrend and within 0..100 otherwise", () => {
  const up = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.equal(rsi(up)[29], 100);
  const zig = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i) * 5);
  for (const v of rsi(zig)) if (v != null) assert.ok(v >= 0 && v <= 100);
});

test("atr is positive", () => {
  const m = demoData("DEMO", "1d");
  const a = atr(m.candles);
  assert.ok(a[a.length - 1]! > 0);
});

test("tilt keeps probabilities in range and moves in the right direction", () => {
  assert.ok(tilt(0.5, 0.1) > 0.5);
  assert.ok(tilt(0.5, -0.1) < 0.5);
  assert.ok(tilt(0.99, 0.9) < 1);
  assert.equal(tilt(0.6, 0), 0.6);
});

test("full analysis on demo data yields coherent probabilities", () => {
  for (const iv of ["15m", "1h", "1d", "1wk"] as const) {
    const m = demoData("DEMO" + iv, iv);
    const r = analyseMarket(m, 5);
    assert.ok(r.technicalScore >= -1 && r.technicalScore <= 1);
    const bt = backtest(r.samples, r.technicalScore);
    assert.ok(bt.conditionalUp > 0 && bt.conditionalUp < 1);
    const sc = scenarios(bt.near, r.samples, m.candles.at(-1)!.close, 0, "5 bars");
    const sum = sc.reduce((a, s) => a + s.probability, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
    const v = verdict({ ctx: r.ctx, near: bt.near, bt, pUp: bt.conditionalUp, technicalScore: r.technicalScore, newsScore: 0, newsCount: 0, support: r.sr.support, resistance: r.sr.resistance, horizonBars: 5, agreement: r.agreement });
    assert.ok(v.riskOfLoss > 0 && v.riskOfLoss < 1);
    if (v.action === "BUY") assert.ok(v.stop < v.entry && v.target > v.entry);
    if (v.action === "SELL") assert.ok(v.stop > v.entry && v.target < v.entry);
    console.log(iv, v.action, v.strength, (v.probabilityUp*100).toFixed(1), "risk", (v.riskOfLoss*100).toFixed(0), "hit", (bt.hitRate*100).toFixed(1), "n", bt.samples);
  }
});

test("headline sentiment", () => {
  assert.ok(headlineSentiment("Apple beats earnings, stock soars to record").score > 0.5);
  assert.ok(headlineSentiment("Tesla shares plunge after analyst downgrade").score < -0.5);
  assert.ok(headlineSentiment("Company did not miss estimates").score > 0);
});

test("parses Yahoo chart JSON and news RSS (stubbed network)", async () => {
  const { fetchYahoo } = await import("./market");
  const { fetchHeadlines } = await import("./news");
  const realFetch = globalThis.fetch;
  const n = 120;
  const ts = Array.from({ length: n }, (_, i) => 1700000000 + i * 86400);
  const px = ts.map((_, i) => 100 + Math.sin(i / 5) * 5);
  globalThis.fetch = (async (url: string) => {
    if (url.includes("finance/chart")) {
      return new Response(JSON.stringify({ chart: { result: [{ meta: { symbol: "AAPL", currency: "USD", longName: "Apple Inc." }, timestamp: ts,
        indicators: { quote: [{ open: px, high: px.map((p) => p + 1), low: px.map((p) => p - 1), close: [...px.slice(0, -1), null], volume: px.map(() => 1000) }] } }], error: null } }));
    }
    const item = (t: string, src: string) => `<item><title><![CDATA[${t}]]></title><link>https://x.test/${encodeURIComponent(t)}</link><pubDate>${new Date().toUTCString()}</pubDate><source url="https://s.test">${src}</source></item>`;
    if (url.includes("yahoo")) return new Response(`<rss><channel>${item("Apple beats earnings estimates", "Yahoo Finance")}</channel></rss>`);
    return new Response(`<rss><channel>${item("Apple shares plunge on probe - Reuters", "Reuters")}${item("Apple beats earnings estimates - CNBC", "CNBC")}</channel></rss>`);
  }) as typeof fetch;
  try {
    const m = await fetchYahoo("AAPL", "1d");
    assert.equal(m.name, "Apple Inc.");
    assert.equal(m.candles.length, n - 1); // null close dropped
    const h = await fetchHeadlines("AAPL", "Apple Inc.");
    assert.equal(h.length, 2); // duplicate across feeds removed
    const plunge = h.find((x) => x.title.includes("plunge"))!;
    assert.equal(plunge.title, "Apple shares plunge on probe"); // " - Reuters" suffix stripped
    assert.ok(plunge.sentiment < 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});
