# sphntr-token-radar-01

[![make.fun competition](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) [![Rank](https://make.fun/badge/token-radar-01/pranz73/sphntr-token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) [![Reward](https://make.fun/badge/token-radar-01/pranz73/sphntr-token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

## Description

Token Radar ranks every pre-token protocol in the sealed DefiLlama snapshot by implied value. It covers all 40 watchlist protocols and the early rows below the watchlist floor, while setting protocols with live tokens aside.

Version 2 estimates value from TVL and four factors. Category multiples are shrunk medians of the snapshot's own live market-cap-to-TVL ratios, with shrinkage that depends on how many live comparables the category has. Momentum is asymmetric: positive 7-day changes earn a steeper saturating reward while negative changes take a shallower penalty with a floor, and each row carries a momentum tier. A maturity factor reflects protocol age, and chain breadth follows diminishing returns on a log scale. A 0–100 conviction score measures how complete the snapshot evidence is for each row. Every row shows its four multipliers and a six-step farm plan with estimated costs and times.

The dashboard includes the ranked board, searchable and sortable rows, category, chain, and watchlist filters, momentum and conviction columns, a category reference strip, protocol detail drawers with score and value calculations, and a separate view of live-token protocols.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/kit/snapshot.json
```

Requires Node 22 or later and uses the standard library only. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/`, and `dossier.json` into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
