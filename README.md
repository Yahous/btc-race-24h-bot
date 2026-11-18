# BTC Breakout Bot — Race a BTC trading bot live for 24 hours

[![make.fun · btc-race-24h-20261118-1444](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Yahous/btc-race-24h-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444/leaderboard)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Yahous/btc-race-24h-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

A long-only trading bot for Coinbase Wrapped BTC (CBBTC) against USDC, built for
make.fun's "Race a BTC trading bot live for 24 hours" bounty ($250 in USDC).
It speaks the `agent-fun/bars-replay/v1` protocol: one JSON line per 1-minute
bar on stdin, one reply with its orders on stdout.

## Strategy

- **Entry:** the close breaks above the highest high of the previous 90 bars.
  A 90-minute high is a real regime break, not 1-minute noise. On the dev
  window the fast EMA-cross baseline whipsawed itself into 80 trades and
  −148 USDC; this breakout fired only twice.
- **Exits (whole position, whichever comes first):** take-profit at +2.00%
  over the entry close, a trailing stop 0.80% below the highest close since
  entry, or a hard stop at −1.00% under the entry close.
- **Size:** the whole cash balance on entry (one open position, 100% of
  equity). A full round trip costs ~26–32 bps in fees, slippage and impact,
  so entries are rare and only on a genuine breakout.
- **Deterministic:** no randomness, no wall clock, no environment. All state
  comes from the bars the harness sends, so the two graded runs match.

## Dev-window result (local grade)

```
net PnL   +10.01 USDC
trades    4 (2 round trips, win rate 50%)
max drawdown  1.02%
guardrails met, L1 regrade reproduced byte for byte
```

## Run it

```sh
node main.ts
```

`main.ts` is erasable TypeScript for Node 22 (imports carry the `.ts`
extension). `vendor/makefun-bars.ts` is a byte-identical copy of the kit's
`sdk/makefun-bars.ts` shim, which owns the line protocol.

## Grade locally

From the competition kit directory:

```sh
node cli/makefun.mjs grade-local --kit . --bot /path/to/this/repo --driver process
```
