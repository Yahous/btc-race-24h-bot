// Breakout bot for "Race a BTC trading bot live for 24 hours" (btc-race-24h-20261118-1444).
//
// Strategy (long only, one asset CBBTC/USDC, 1-minute bars):
//   - Entry: the close breaks above the highest high of the previous 90 bars.
//     A 90-minute high is a real regime break on this market, not 1-minute noise:
//     on the dev window the fast EMA-cross baseline whipsawed itself into
//     80 trades and -148 USDC, while this breakout fired only twice.
//   - Exit, whole position: a take-profit at +2.00% over the entry close, a
//     trailing stop 0.80% below the highest close since entry, or a hard stop
//     at -1.00% under the entry close. Whichever comes first.
//   - Size: the whole cash balance on entry (one open position max, 100% of
//     equity). A full round trip costs ~26-32 bps, so entries are rare and
//     only on a genuine breakout; the exits bank a move that dwarfs the cost.
//   - Deterministic: no randomness, no wall clock, no environment. All state
//     comes from the bars the harness sends.
//
// The bot speaks agent-fun/bars-replay/v1 through the kit's shim in
// vendor/makefun-bars.ts (a byte-identical copy of sdk/makefun-bars.ts).

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Lookback for the breakout high, in bars (minutes). */
const BREAKOUT_BARS = 90;
/** Take profit: exit once the close is this far above the entry close. */
const TAKE_PROFIT_BPS = 200;
/** Trailing stop: exit once the close falls this far below the peak close since entry. */
const TRAIL_BPS = 80;
/** Hard stop: exit once the close falls this far below the entry close. */
const STOP_BPS = 100;
/** Slippage cap on every order, measured from the latest close. */
const MAX_SLIPPAGE_BPS = 150;

/** Closes and highs seen so far, in bar order. */
const closes: bigint[] = [];
const highs: bigint[] = [];

/** State of the single open position, tracked from our own decisions. */
let entryClose: bigint | null = null;
let peakClose: bigint | null = null;

/** True when a < b, cross-multiplied in bigints (no floats anywhere). */
function below(a: bigint, b: bigint, bps: number): boolean {
  return a * 10_000n < b * BigInt(10_000 - bps);
}
function above(a: bigint, b: bigint, bps: number): boolean {
  return a * 10_000n > b * BigInt(10_000 + bps);
}

await runBars({
  onBatch(state: BarsState, batch) {
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    closes.push(BigInt(bar.c));
    highs.push(BigInt(bar.h));
    if (state.warmingUp) return [];

    const close = BigInt(bar.c);
    const held = state.positions.get(SYMBOL);
    const orders: (BuyInput | SellInput)[] = [];

    if (held !== undefined) {
      // We hold: update the peak and check the three exits.
      if (entryClose === null) entryClose = close;
      if (peakClose === null || close > peakClose) peakClose = close;
      const takeProfit = above(close, entryClose, TAKE_PROFIT_BPS);
      const trailed = peakClose !== null && below(close, peakClose, TRAIL_BPS);
      const stopped = below(close, entryClose, STOP_BPS);
      if (takeProfit || trailed || stopped) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        entryClose = null;
        peakClose = null;
      }
      return orders;
    }

    // Flat: enter only on a close above the highest high of the last 90 bars.
    // The 90 bars are the ones *before* this bar: this bar's own high is
    // always at least its close, so including it could never trigger.
    entryClose = null;
    peakClose = null;
    if (highs.length <= BREAKOUT_BARS) return [];
    let high = 0n;
    for (let i = highs.length - 1 - BREAKOUT_BARS; i < highs.length - 1; i++) {
      if (highs[i]! > high) high = highs[i]!;
    }
    if (close <= high) return [];
    const { caps, fees } = state.hello;
    const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / 10_000n;
    let slice = state.cash < byWeight ? state.cash : byWeight;
    if (slice < BigInt(fees.min_notional_quote_units)) return [];
    orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: slice, max_slippage_bps: MAX_SLIPPAGE_BPS });
    entryClose = close;
    peakClose = close;
    return orders;
  },
});
