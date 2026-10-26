import type { Backtest, Scenario, Verdict } from "./types";
import { type Context, scoreOf, signalsAt, warmup } from "./signals";

type Sample = { i: number; score: number; ret: number };

/**
 * Walk through history, score every bar with the same technical model, and
 * record what price actually did over the next `h` bars. This is what turns
 * the score into a probability: "when the chart looked like this before,
 * how often did it go up?"
 */
export function historicalSamples(ctx: Context, h: number): Sample[] {
  const out: Sample[] = [];
  const start = warmup(ctx);
  for (let i = start; i < ctx.closes.length - h; i++) {
    out.push({ i, score: scoreOf(signalsAt(ctx, i)), ret: ctx.closes[i + h] / ctx.closes[i] - 1 });
  }
  return out;
}

/** Samples whose score is nearest the current one (k-nearest neighbours in score). */
function neighbours(samples: Sample[], score: number): Sample[] {
  const k = Math.min(samples.length, Math.max(40, Math.round(samples.length * 0.2)));
  return [...samples].sort((a, b) => Math.abs(a.score - score) - Math.abs(b.score - score)).slice(0, k);
}

const PRIOR = 20; // pseudo-samples pulling small-sample estimates toward the base rate

export function backtest(samples: Sample[], score: number): Backtest & { near: Sample[] } {
  const n = samples.length;
  const ups = samples.filter((s) => s.ret > 0).length;
  const baseRateUp = n ? ups / n : 0.5;
  const near = neighbours(samples, score);
  const nearUps = near.filter((s) => s.ret > 0).length;
  const conditionalUp = (nearUps + baseRateUp * PRIOR) / (near.length + PRIOR);

  const decisive = samples.filter((s) => Math.abs(s.score) > 0.1 && s.ret !== 0);
  const hits = decisive.filter((s) => Math.sign(s.score) === Math.sign(s.ret)).length;
  const hitRate = decisive.length ? hits / decisive.length : 0.5;
  const avgMovePct = n ? (samples.reduce((a, s) => a + Math.abs(s.ret), 0) / n) * 100 : 0;

  const edges = [-1, -0.4, -0.2, -0.05, 0.05, 0.2, 0.4, 1];
  const bins = edges.slice(0, -1).map((from, j) => {
    const to = edges[j + 1];
    const inBin = samples.filter((s) => s.score >= from && (j === edges.length - 2 ? s.score <= to : s.score < to));
    return { from, to, samples: inBin.length, upRate: inBin.length ? inBin.filter((s) => s.ret > 0).length / inBin.length : 0 };
  });
  return { samples: n, similarSamples: near.length, baseRateUp, conditionalUp, hitRate, avgMovePct, bins, near };
}

/** Odds-ratio tilt of a probability; keeps it inside (0, 1). */
export function tilt(p: number, t: number): number {
  const up = p * (1 + t);
  const down = (1 - p) * (1 - t);
  return up / (up + down);
}

export function scenarios(near: Sample[], all: Sample[], price: number, newsTilt: number, horizonLabel: string): Scenario[] {
  const rets = all.map((s) => s.ret);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1)) || 0.02;
  const small = 0.35 * sd;
  const big = 1.25 * sd;
  const defs = [
    { key: "strong-up", label: "Strong rally", lo: big, hi: Infinity, dir: 1 },
    { key: "up", label: "Moderate rise", lo: small, hi: big, dir: 1 },
    { key: "flat", label: "Sideways / range", lo: -small, hi: small, dir: 0 },
    { key: "down", label: "Moderate decline", lo: -big, hi: -small, dir: -1 },
    { key: "strong-down", label: "Sharp drop", lo: -Infinity, hi: -big, dir: -1 },
  ];
  const tot = near.length + 5; // +1 Laplace smoothing per bucket
  let ps = defs.map((d) => (near.filter((s) => s.ret >= d.lo && s.ret < d.hi).length + 1) / tot);
  ps = ps.map((p, j) => p * (1 + newsTilt * defs[j].dir));
  const sum = ps.reduce((a, b) => a + b, 0);
  ps = ps.map((p) => p / sum);

  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  const cap = 2.5 * sd;
  return defs.map((d, j) => {
    const lo = Math.max(d.lo, -cap);
    const hi = Math.min(d.hi, cap);
    const range = d.hi === Infinity ? `more than ${pct(d.lo)}` : d.lo === -Infinity ? `worse than ${pct(d.hi)}` : `${pct(d.lo)} to ${pct(d.hi)}`;
    const count = near.filter((s) => s.ret >= d.lo && s.ret < d.hi).length;
    return {
      key: d.key,
      label: d.label,
      probability: ps[j],
      range,
      priceFrom: price * (1 + lo),
      priceTo: price * (1 + hi),
      explanation: `In ${count} of the ${near.length} most similar historical setups, price moved ${range} over the next ${horizonLabel}.`,
    };
  });
}

/**
 * Replay the trade on each similar historical setup: walk forward bar by bar
 * and see whether the stop or the target was touched first.
 */
function stopFirstRate(ctx: Context, near: Sample[], dir: 1 | -1, stopAtr: number, targetAtr: number, maxBars: number): number {
  let losses = 0;
  let total = 0;
  for (const s of near) {
    const a = ctx.atr[s.i];
    if (a == null) continue;
    const entry = ctx.closes[s.i];
    const stop = entry - dir * stopAtr * a;
    const target = entry + dir * targetAtr * a;
    let outcome: "win" | "loss" | null = null;
    for (let j = s.i + 1; j <= Math.min(ctx.candles.length - 1, s.i + maxBars); j++) {
      const c = ctx.candles[j];
      const hitStop = dir > 0 ? c.low <= stop : c.high >= stop;
      const hitTarget = dir > 0 ? c.high >= target : c.low <= target;
      if (hitStop) { outcome = "loss"; break; } // same-bar ties count as losses (conservative)
      if (hitTarget) { outcome = "win"; break; }
    }
    if (outcome == null) {
      const end = ctx.closes[Math.min(ctx.closes.length - 1, s.i + maxBars)];
      outcome = (end - entry) * dir > 0 ? "win" : "loss";
    }
    total++;
    if (outcome === "loss") losses++;
  }
  return total ? (losses + 0.5 * 4) / (total + 4) : 0.5;
}

export function verdict(args: {
  ctx: Context;
  near: Sample[];
  bt: Backtest;
  pUp: number;
  technicalScore: number;
  newsScore: number;
  newsCount: number;
  support: number[];
  resistance: number[];
  horizonBars: number;
  agreement: number;
}): Verdict {
  const { ctx, near, bt, pUp, technicalScore, newsScore, newsCount, support, resistance, horizonBars, agreement } = args;
  const i = ctx.closes.length - 1;
  const price = ctx.closes[i];
  const a = ctx.atr[i] ?? price * 0.02;
  const edge = pUp - 0.5;
  const dir: 1 | -1 = edge >= 0 ? 1 : -1;

  // Stop just beyond the nearest opposing level if it is a sensible distance away, else 1.5 ATR.
  const opp = dir > 0 ? support[0] : resistance[0];
  let stopDist = 1.5 * a;
  if (opp != null) {
    const d = Math.abs(price - opp) + 0.25 * a;
    if (d >= 0.8 * a && d <= 3 * a) stopDist = d;
  }
  const lvl = dir > 0 ? resistance[0] : support[0];
  let targetDist = 2 * stopDist;
  if (lvl != null) {
    const d = Math.abs(lvl - price);
    if (d >= 1.2 * stopDist && d < targetDist) targetDist = d;
  }
  const stop = price - dir * stopDist;
  const target = price + dir * targetDist;
  const target2 = price + dir * targetDist * 1.75;
  const rewardRisk = targetDist / stopDist;
  const riskOfLoss = stopFirstRate(ctx, near, dir, stopDist / a, targetDist / a, horizonBars * 3);
  const expectancy = (1 - riskOfLoss) * rewardRisk - riskOfLoss; // in units of risk

  // Confidence: how far the backtest beats a coin flip, how many similar cases exist, and how much indicators agree.
  const skill = Math.max(0, (bt.hitRate - 0.5) / 0.15);
  const sampleFactor = Math.min(1, bt.similarSamples / 80);
  const confidence = Math.max(0, Math.min(1, 0.45 * Math.min(1, skill) + 0.25 * sampleFactor + 0.3 * agreement));

  let action: Verdict["action"] = "HOLD";
  if (Math.abs(edge) >= 0.04 && expectancy > 0.05 && confidence >= 0.2) action = dir > 0 ? "BUY" : "SELL";
  const mag = Math.abs(edge);
  const strength: Verdict["strength"] = action === "HOLD" ? "Weak" : mag >= 0.12 && confidence >= 0.5 && bt.hitRate >= 0.55 ? "Strong" : mag >= 0.07 ? "Moderate" : "Weak";

  const atrPct = (a / price) * 100;
  const riskLevel: Verdict["riskLevel"] =
    riskOfLoss > 0.6 || atrPct > 6 ? "Very high" : riskOfLoss > 0.5 || atrPct > 3.5 ? "High" : riskOfLoss > 0.4 ? "Medium" : "Low";

  const reasons: string[] = [];
  const warnings: string[] = [];
  reasons.push(
    `The technical score is ${technicalScore >= 0 ? "+" : ""}${technicalScore.toFixed(2)} (−1 = all bearish, +1 = all bullish). In the ${bt.similarSamples} most similar past setups price rose ${(bt.conditionalUp * 100).toFixed(0)}% of the time, versus ${(bt.baseRateUp * 100).toFixed(0)}% on an average day.`,
  );
  if (newsCount > 0)
    reasons.push(
      `News sentiment is ${newsScore > 0.15 ? "positive" : newsScore < -0.15 ? "negative" : "mixed / neutral"} (${newsScore >= 0 ? "+" : ""}${newsScore.toFixed(2)}), which ${Math.abs(newsScore) < 0.05 ? "barely changes" : newsScore > 0 ? "nudges up" : "nudges down"} the odds.`,
    );
  reasons.push(
    `A ${dir > 0 ? "long" : "short"} with stop ${stop.toFixed(2)} and target ${target.toFixed(2)} risks 1 to make ${rewardRisk.toFixed(2)}. Replaying it on similar past setups, the stop was hit first ${(riskOfLoss * 100).toFixed(0)}% of the time, an expectancy of ${expectancy >= 0 ? "+" : ""}${expectancy.toFixed(2)}R per trade.`,
  );
  if (action === "HOLD") {
    if (Math.abs(edge) < 0.04) reasons.push("The up/down odds are too close to 50/50 to justify a trade.");
    else if (expectancy <= 0.05) reasons.push("The direction leans one way, but after accounting for where the stop must go, the expected payoff isn't positive.");
    else reasons.push("The model's past accuracy on this chart is too low to trust the lean.");
  }
  if (bt.hitRate < 0.53) warnings.push(`On this symbol's history the technical model was right only ${(bt.hitRate * 100).toFixed(0)}% of the time — barely better than a coin flip. Treat the signal as weak.`);
  if (bt.samples < 150) warnings.push(`Only ${bt.samples} historical samples were available; probabilities are rough.`);
  if (atrPct > 4) warnings.push(`Volatility is high: an average bar moves ${atrPct.toFixed(1)}%. Size positions smaller.`);
  if (agreement < 0.35) warnings.push("Indicators disagree with each other — a sign of a choppy or transitioning market.");
  if (dir < 0 && action === "SELL") warnings.push("Selling short carries theoretically unlimited loss; if you hold the asset, a SELL means reduce or exit rather than short.");

  return {
    action,
    strength,
    probabilityUp: pUp,
    probabilityDown: 1 - pUp,
    confidence,
    entry: price,
    stop,
    target,
    target2,
    rewardRisk,
    riskOfLoss,
    riskLevel,
    expectedMovePct: bt.avgMovePct,
    reasons,
    warnings,
  };
}
