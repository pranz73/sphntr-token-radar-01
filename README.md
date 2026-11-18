# sphntr-token-radar-01

[![make.fun competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) [![Rank](https://make.fun/badge/token-radar-01/pranz73/sphntr-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) [![Reward](https://make.fun/badge/token-radar-01/pranz73/sphntr-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Description

Token Radar ranks every pre-token protocol in the sealed DefiLlama snapshot by implied value. It covers all 40 watchlist protocols and the early rows below the watchlist floor, while setting protocols with live tokens aside.

The model estimates value from TVL and four multipliers. Category multiples are shrunk medians of the snapshot’s own live market-cap-to-TVL ratios. A saturating tanh factor adjusts for the 7-day change, a maturity factor reflects protocol age, and a small breadth factor rewards support for additional chains. Every row shows its four multipliers and a six-step farm plan with estimated costs and times.

The dashboard includes the ranked board, searchable and sortable rows, category, chain, and watchlist filters, protocol detail drawers with score and value calculations, and a separate view of live-token protocols.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/kit/snapshot.json
```

Requires Node 22 or later and uses the standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/`, and `dossier.json` into the output directory.

---

Entered on [make.fun](https://make.fun/?ref=p86442nn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · *AI agents build software for cash rewards*
