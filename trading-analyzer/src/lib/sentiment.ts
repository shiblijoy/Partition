// Finance-tuned word lists for headline sentiment. Weights are in -1..1.
const LEXICON: Record<string, number> = {
  // bullish
  beat: 0.7, beats: 0.7, surpass: 0.6, surpasses: 0.6, record: 0.5, soar: 0.8, soars: 0.8, surge: 0.8, surges: 0.8,
  jump: 0.6, jumps: 0.6, rally: 0.6, rallies: 0.6, gain: 0.4, gains: 0.4, rise: 0.4, rises: 0.4, climb: 0.4, climbs: 0.4,
  upgrade: 0.8, upgrades: 0.8, upgraded: 0.8, outperform: 0.6, buy: 0.4, bullish: 0.7, strong: 0.4, growth: 0.4,
  profit: 0.4, profitable: 0.5, raises: 0.5, raised: 0.4, boost: 0.5, boosts: 0.5, expands: 0.4, expansion: 0.4,
  approval: 0.6, approved: 0.6, wins: 0.5, win: 0.4, partnership: 0.4, deal: 0.3, breakthrough: 0.7, optimistic: 0.5,
  dividend: 0.3, buyback: 0.5, rebound: 0.5, rebounds: 0.5, recovers: 0.4, recovery: 0.4, high: 0.2, highs: 0.3,
  tops: 0.4, exceeds: 0.6, accelerates: 0.4, momentum: 0.2, launch: 0.2, launches: 0.2, innovative: 0.3,
  // bearish
  miss: -0.7, misses: -0.7, missed: -0.7, plunge: -0.8, plunges: -0.8, plummet: -0.8, plummets: -0.8, crash: -0.9,
  tumble: -0.7, tumbles: -0.7, drop: -0.5, drops: -0.5, fall: -0.5, falls: -0.5, slide: -0.5, slides: -0.5, sink: -0.6,
  sinks: -0.6, decline: -0.5, declines: -0.5, slump: -0.6, slumps: -0.6, downgrade: -0.8, downgrades: -0.8,
  downgraded: -0.8, underperform: -0.6, sell: -0.4, bearish: -0.7, weak: -0.5, weaker: -0.5, loss: -0.5, losses: -0.5,
  lawsuit: -0.6, sued: -0.6, probe: -0.6, investigation: -0.6, fraud: -0.9, recall: -0.6, layoffs: -0.4, cuts: -0.4,
  cut: -0.4, warns: -0.6, warning: -0.6, risk: -0.3, risks: -0.3, fears: -0.5, fear: -0.5, concern: -0.4, concerns: -0.4,
  delay: -0.4, delays: -0.4, halt: -0.6, halts: -0.6, bankruptcy: -1, default: -0.8, debt: -0.2, fine: -0.4, fined: -0.5,
  tariff: -0.3, tariffs: -0.3, ban: -0.5, slowdown: -0.5, recession: -0.6, volatile: -0.3, lows: -0.3, low: -0.2,
  selloff: -0.7, "sell-off": -0.7, disappointing: -0.6, disappoints: -0.6, lowers: -0.5, lowered: -0.5, resigns: -0.4,
};
const NEGATORS = new Set(["not", "no", "never", "without", "fails", "fail", "failed", "despite"]);

export function headlineSentiment(text: string): { score: number; matched: string[] } {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
  let total = 0;
  const matched: string[] = [];
  words.forEach((w, i) => {
    const v = LEXICON[w];
    if (v === undefined) return;
    const negated = NEGATORS.has(words[i - 1] ?? "") || NEGATORS.has(words[i - 2] ?? "");
    total += negated ? -v * 0.7 : v;
    matched.push(negated ? `not ${w}` : w);
  });
  // squash so several matches saturate toward ±1
  return { score: Math.tanh(total), matched };
}
