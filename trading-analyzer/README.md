# Trading Analyzer

A web app that reads a price chart and the latest news for any stock, crypto, forex pair or index, then gives you:

- **Up / down probability** for a horizon you choose (e.g. the next 5 trading days)
- **Five scenarios with a probability each**: strong rally, moderate rise, sideways, moderate decline and sharp drop, with the price range for each
- **A BUY / SELL / HOLD suggestion** with entry, stop-loss, two targets, reward:risk and a **risk-of-loss %**
- **A detailed explanation** of every indicator and of why the verdict came out the way it did
- **News sentiment**: each headline scored, plus an AI summary with catalysts and risks when an Anthropic API key is set
- **A backtest** showing how often the model was right on that same symbol, so you know how far to trust it

> **Not financial advice.** No method can predict every market move. The probabilities are estimates
> from how the chart behaved in similar past setups. Markets change, and patterns that worked before can stop working.

## How the numbers are made

1. **Prices** come from Yahoo Finance (no key needed): 15-minute, hourly, daily or weekly bars.
2. **Technical signals**: 50/200 moving averages, EMA 20/50 slope, ADX/DMI, RSI, MACD, stochastic,
   10-bar rate of change, Bollinger bands, on-balance volume, support/resistance from swing pivots and
   candlestick patterns (engulfing, hammer, shooting star, morning/evening star, soldiers/crows, doji).
   Each one votes from −1 (bearish) to +1 (bullish), and the votes are combined into one weighted **technical score**.
3. **Calibration (the probability)**: the same score is computed for every past bar of the symbol and
   compared with what the price really did over the horizon. The up-probability is the share of
   the most similar past setups (nearest scores) that went up. When there are few samples, it is pulled
   toward the overall base rate.
4. **News** from Yahoo Finance and Google News RSS is scored by finance keywords, or by Claude when
   `ANTHROPIC_API_KEY` is set. Recent headlines count more. News can move the up-probability by
   about 7 points at most, so a single headline can't override the chart.
5. **Risk of loss**: the suggested trade (stop beyond the nearest support/resistance, target at about
   2× the risk or at the next level) is replayed bar by bar on every similar past setup. Risk of loss is
   how often the stop was hit before the target.
6. **Verdict**: BUY or SELL appears only when the odds lean at least 4 points one way, the replayed trade
   has positive expectancy and the model has some proven accuracy on this symbol. Otherwise the verdict is HOLD.

## Run it

```bash
cd trading-analyzer
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY for AI news analysis
npm run dev                  # http://localhost:3000
```

For production, run `npm run build && npm start`. To run the tests, use `npm test`.

Symbols use Yahoo's format: `AAPL`, `TSLA`, `BTC-USD`, `ETH-USD`, `EURUSD=X`, `^GSPC`, `RELIANCE.NS`.
Type `DEMO` to get a synthetic chart. If Yahoo can't be reached, the app falls back to synthetic data
and shows a warning banner; don't trade on that output.

## Code map

| File | What it does |
| --- | --- |
| `src/lib/indicators.ts` | SMA, EMA, RSI, MACD, Bollinger, ATR, stochastic, ADX, OBV, pivots, candle patterns |
| `src/lib/signals.ts` | Turns indicators into explained votes and the technical score |
| `src/lib/forecast.ts` | Backtest, scenario probabilities, stop/target replay, verdict |
| `src/lib/news.ts`, `sentiment.ts` | Headline fetching, keyword sentiment, optional Claude analysis |
| `src/lib/market.ts` | Yahoo Finance prices and the synthetic demo series |
| `src/app/api/analyze/route.ts` | `GET /api/analyze?symbol=AAPL&interval=1d&horizon=5` |
| `src/app/page.tsx`, `src/components/PriceChart.tsx` | The UI and the SVG chart |
