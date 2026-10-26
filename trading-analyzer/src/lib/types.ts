export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Interval = "15m" | "1h" | "1d" | "1wk";

export type MarketData = {
  symbol: string;
  name: string;
  currency: string;
  interval: Interval;
  candles: Candle[];
  source: "yahoo" | "demo";
};

/** One technical signal's vote: -1 (strongly bearish) .. +1 (strongly bullish). */
export type Signal = {
  key: string;
  group: "trend" | "momentum" | "volatility" | "volume" | "structure" | "pattern";
  name: string;
  vote: number;
  weight: number;
  value: string;
  explanation: string;
};

export type Headline = {
  title: string;
  link: string;
  source: string;
  published: number | null; // unix ms
  sentiment: number; // -1..1
  matched: string[];
  impact?: string;
};

export type NewsAnalysis = {
  headlines: Headline[];
  score: number; // -1..1, recency-weighted
  label: "Bullish" | "Bearish" | "Neutral" | "No news";
  method: "claude" | "lexicon" | "none";
  summary: string;
  catalysts: string[];
  risks: string[];
  error?: string;
};

export type Scenario = {
  key: string;
  label: string;
  probability: number; // 0..1
  range: string;
  priceFrom: number;
  priceTo: number;
  explanation: string;
};

export type Verdict = {
  action: "BUY" | "SELL" | "HOLD";
  strength: "Strong" | "Moderate" | "Weak";
  probabilityUp: number;
  probabilityDown: number;
  confidence: number; // 0..1, how much evidence backs the edge
  entry: number;
  stop: number;
  target: number;
  target2: number;
  rewardRisk: number;
  riskOfLoss: number; // P(stop hit before target), 0..1
  riskLevel: "Low" | "Medium" | "High" | "Very high";
  expectedMovePct: number;
  reasons: string[];
  warnings: string[];
};

export type Backtest = {
  samples: number;
  similarSamples: number;
  baseRateUp: number;
  conditionalUp: number;
  hitRate: number; // accuracy of the composite score's direction over history
  avgMovePct: number;
  bins: { from: number; to: number; samples: number; upRate: number }[];
};

export type Analysis = {
  market: Omit<MarketData, "candles">;
  generatedAt: number;
  horizonBars: number;
  horizonLabel: string;
  lastPrice: number;
  changePct: number;
  candles: Candle[];
  overlays: {
    sma20: (number | null)[];
    sma50: (number | null)[];
    sma200: (number | null)[];
    bbUpper: (number | null)[];
    bbLower: (number | null)[];
    rsi: (number | null)[];
    macd: (number | null)[];
    macdSignal: (number | null)[];
    macdHist: (number | null)[];
  };
  levels: { support: number[]; resistance: number[] };
  signals: Signal[];
  technicalScore: number; // -1..1
  news: NewsAnalysis;
  combinedScore: number;
  backtest: Backtest;
  scenarios: Scenario[];
  verdict: Verdict;
  notes: string[];
};
