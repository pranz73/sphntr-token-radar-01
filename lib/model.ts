export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface Row {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  score: number;
  model: {
    category_multiple: number;
    momentum_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
  };
  farm_steps: string[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function parseSnapshot(raw: string | unknown): Snapshot {
  let input: any;
  try {
    input = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new SnapshotError('snapshot is not valid JSON');
  }

  const reject = (reason: string): never => { throw new SnapshotError(`invalid snapshot: ${reason}`); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('expected object');
  if (typeof input.as_of !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(input.as_of) ||
      typeof input.source !== 'string' || !isFiniteNumber(input.floor_usd) ||
      !Array.isArray(input.protocols) || !Array.isArray(input.watchlist)) reject('invalid top-level fields');

  const schemaKeys = ['slug', 'name', 'category', 'chains', 'tvl_usd', 'change_7d', 'mcap_usd', 'listed_at', 'gecko_id', 'symbol'].sort().join(',');
  const observed = new Set<string>();
  for (const protocol of input.protocols) {
    if (!protocol || typeof protocol !== 'object' || Object.keys(protocol).sort().join(',') !== schemaKeys) reject('protocol fields do not match schema');
    if (typeof protocol.slug !== 'string' || !protocol.slug || observed.has(protocol.slug) ||
        typeof protocol.name !== 'string' || !(protocol.category === null || typeof protocol.category === 'string') ||
        !Array.isArray(protocol.chains) || !protocol.chains.every((chain: any) => typeof chain === 'string') ||
        !isFiniteNumber(protocol.tvl_usd) || !(protocol.change_7d === null || isFiniteNumber(protocol.change_7d)) ||
        !(protocol.mcap_usd === null || isFiniteNumber(protocol.mcap_usd)) ||
        !(protocol.listed_at === null || typeof protocol.listed_at === 'string') ||
        !(protocol.gecko_id === null || typeof protocol.gecko_id === 'string') ||
        !(protocol.symbol === null || typeof protocol.symbol === 'string')) reject(`invalid protocol ${String(protocol.slug)}`);
    observed.add(protocol.slug);
  }
  if (!input.watchlist.every((slug: any) => typeof slug === 'string' && observed.has(slug))) reject('invalid watchlist');
  return input as Snapshot;
}

// Small numeric helpers keep the scoring and category calibration in one place.
const median = (values: number[]) => {
  values.sort((a, b) => a - b);
  const count = values.length;
  return count % 2 ? values[(count - 1) / 2] : (values[count / 2 - 1] + values[count / 2]) / 2;
};

const preferredChains = ['Base', 'Arbitrum', 'Solana', 'Binance', 'Polygon', 'Avalanche', 'Optimism', 'Ethereum'];
const exchangeName = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const excludedCategories = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

const ageInDays = (listedAt: string | null, snapshotDate: string): number | null => listedAt === null
  ? null
  : Math.floor((Date.parse(snapshotDate + 'T00:00:00Z') - Date.parse(listedAt + 'T00:00:00Z')) / 86400000);

function primaryChain(protocol: Protocol) {
  for (const chain of preferredChains) if (protocol.chains.includes(chain)) return chain;
  return protocol.chains[0] ?? 'the protocol’s supported chain';
}

const transactionCost = (chain: string) => chain === 'Ethereum' ? 'roughly $8 to $15' : 'cents to about $1';

function makeFarmPlan(protocol: Protocol, age: number | null): string[] {
  const chain = primaryChain(protocol);
  const gas = transactionCost(chain);
  const capital = protocol.tvl_usd >= 1e9 ? 250 : protocol.tvl_usd >= 1e8 ? 150 : protocol.tvl_usd >= 2e7 ? 75 : 50;
  const category = (protocol.category ?? '').toLowerCase();
  let action = 'make a generic USDC deposit';
  if (/lending|cdp/.test(category)) action = 'supply capital';
  else if (/dex|yield|aggregator/.test(category)) action = 'provide liquidity';
  else if (/curator|allocator|risk curator/.test(category)) action = 'deposit into a vault';
  else if (/derivative|perpetual/.test(category)) action = 'make a margin deposit and one small hedge';
  else if (/rwa/.test(category)) action = 'mint or hold the asset';
  else if (/basis trading/.test(category)) action = 'deposit and trade a small volume';
  else if (/restaking|staking/.test(category)) action = 'stake';
  else if (/payments|chain/.test(category)) action = 'make a real transfer or payment';
  else if (/insurance/.test(category)) action = 'buy cover';

  const weekly = /lending|cdp/.test(category) ? 'make a small deposit or borrow' :
    /dex|yield|aggregator|basis/.test(category) ? 'make a small swap' :
    /governance/.test(category) ? 'cast a vote' : 'make a qualifying deposit';
  const secondChain = protocol.chains.find((candidate) => candidate !== chain) ?? chain;
  const secondGas = transactionCost(secondChain);
  const second = protocol.chains.length >= 3
    ? `Open a smaller $${Math.floor(capital / 2)} position on ${secondChain}.`
    : `Add a smaller top-up on ${chain} and check the protocol’s own points or rewards page for a season or campaign to join.`;
  const days = age !== null && age < 180 ? 60 : age !== null && age < 365 ? 45 : 30;

  // Keep the six output steps stable: costs and actions are part of board.json.
  return [
    `Set up a fresh wallet holding only farm funds, keep its seed phrase offline, and fund it on ${chain}. Cost: ${gas} for one transaction. Time: 20 minutes once.`,
    `On ${chain}, ${action} with $${capital} in farm capital using the protocol’s own interface. Cost: ${gas} for one transaction. Time: 20 minutes once.`,
    `On ${chain}, ${weekly} once each week to leave a qualifying on-chain record. Cost: ${gas} weekly. Time: 10 minutes a week.`,
    second + ` Cost: ${protocol.chains.length >= 3 ? secondGas : gas} for one transaction. Time: 15 minutes once.`,
    `Hold the position for ${days} days so your activity spans more than one snapshot; review it weekly. Cost: $0 while holding. Time: 5 minutes a week.`,
    `Claim only from the link on the protocol’s own points or rewards page, never pay to claim, then record the wallet, dates and transactions in a farm log. Cost: ${gas} only if a free claim transaction is available. Time: 10 minutes once.`
  ];
}

function categoryMultiple(category: string | null, groups: Map<string, number[]>, global: number) {
  const samples = groups.get(category ?? '') ?? [];
  const estimate = samples.length < 2 ? global : (samples.length * median([...samples]) + 4 * global) / (samples.length + 4);
  return Math.max(.02, Math.min(1.5, estimate));
}

export function buildBoard(snapshot: Snapshot): Row[] {
  const liveProtocols = snapshot.protocols.filter((protocol) => protocol.mcap_usd !== null && protocol.tvl_usd > 0);
  const global = median(liveProtocols.map((protocol) => protocol.mcap_usd! / protocol.tvl_usd));
  const categorySamples = new Map<string, number[]>();
  for (const protocol of liveProtocols) {
    const key = protocol.category ?? '';
    if (!categorySamples.has(key)) categorySamples.set(key, []);
    categorySamples.get(key)!.push(protocol.mcap_usd! / protocol.tvl_usd);
  }

  const watchlist = new Set(snapshot.watchlist);
  const members = snapshot.protocols.filter((protocol) => {
    if (watchlist.has(protocol.slug)) return true;
    if (protocol.gecko_id !== null || protocol.symbol !== null) return false;
    if (excludedCategories.has(protocol.category ?? '') || /\b(wrapped|staked|staking)\b/i.test(protocol.name) ||
        exchangeName.test(protocol.name) || /\s(?:[Vv]\d+(?:\.\d+)?|\d+\.\d+)$/.test(protocol.name)) return false;
    return true;
  });

  const candidates = members.map((protocol) => {
    const age = ageInDays(protocol.listed_at, snapshot.as_of);
    const multiple = categoryMultiple(protocol.category, categorySamples, global);
    const momentum = 1 + .45 * Math.tanh((protocol.change_7d ?? 0) / 30);
    const maturity = .75 + .5 * Math.min(age ?? 365, 1460) / 1460;
    const breadth = 1 + .015 * Math.min(Math.max(protocol.chains.length - 1, 0), 20);
    const value = Math.max(1, Math.round(protocol.tvl_usd * multiple * momentum * maturity * breadth));
    const scoreParts = {
      size: 0,
      momentum: (Math.tanh((protocol.change_7d ?? 0) / 30) + 1) / 2,
      maturity: Math.min(age ?? 365, 1460) / 1460,
      breadth: Math.min(Math.max(protocol.chains.length - 1, 0), 20) / 20,
      category: Math.max(0, Math.min(1, multiple / 1.5))
    };
    return { protocol, age, multiple, momentum, maturity, breadth, value, scoreParts };
  });

  const minLogTvl = Math.log10(Math.min(...candidates.map((item) => item.protocol.tvl_usd)));
  const maxLogTvl = Math.log10(Math.max(...candidates.map((item) => item.protocol.tvl_usd)));
  candidates.sort((a, b) => b.value - a.value || (a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0));

  return candidates.map((item, index) => {
    const size = maxLogTvl === minLogTvl ? 1 : (Math.log10(item.protocol.tvl_usd) - minLogTvl) / (maxLogTvl - minLogTvl);
    const score = (.34 * size + .24 * item.scoreParts.momentum + .18 * item.scoreParts.maturity +
      .12 * item.scoreParts.breadth + .12 * item.scoreParts.category) * 100;
    return {
      rank: index + 1,
      slug: item.protocol.slug,
      name: item.protocol.name,
      category: item.protocol.category,
      chains: item.protocol.chains,
      tvl_usd: item.protocol.tvl_usd,
      change_7d: item.protocol.change_7d,
      mcap_usd: item.protocol.mcap_usd,
      listed_at: item.protocol.listed_at,
      age_days: item.age,
      watchlist: watchlist.has(item.protocol.slug),
      implied_value_usd: item.value,
      score: Math.round(score),
      model: {
        category_multiple: +item.multiple.toFixed(4),
        momentum_multiplier: +item.momentum.toFixed(4),
        maturity_multiplier: +item.maturity.toFixed(4),
        breadth_multiplier: +item.breadth.toFixed(4)
      },
      farm_steps: makeFarmPlan(item.protocol, item.age)
    };
  });
}

export function buildLiveRows(snapshot: Snapshot) {
  return snapshot.protocols.filter((protocol) => protocol.mcap_usd !== null)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, 24);
}

export function boardIssue(snapshot: Snapshot, rows: Row[]): string | null {
  const fail = (message: string) => message;
  if (rows.length < 100 || rows.length > 4000) return fail(`board row count ${rows.length} is outside 100..4000`);
  const slugs = new Set(rows.map((row) => row.slug));
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return fail(`watchlist slug missing: ${slug}`);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.rank !== index + 1) return fail('ranks are not exactly 1..N');
    if (index && rows[index - 1].implied_value_usd < row.implied_value_usd) return fail('implied values rise as rank ascends');
    if (!snapshot.protocols.some((protocol) => protocol.slug === row.slug)) return fail(`unknown protocol slug: ${row.slug}`);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) return fail(`invalid implied value for ${row.slug}`);
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12 || row.farm_steps.some((step) => typeof step !== 'string' || step.trim().length < 20 || step.trim().length > 600)) return fail(`invalid farm steps for ${row.slug}`);
  }
  if (rows.every((row) => row.implied_value_usd === rows[0].implied_value_usd)) return fail('all implied values are identical');
  return null;
}

function categorySummary(snapshot: Snapshot, global: number) {
  const groups = new Map<string, { count: number; multiple: number }>();
  const live = snapshot.protocols.filter((protocol) => protocol.mcap_usd !== null && protocol.tvl_usd > 0);
  for (const protocol of live) {
    const key = protocol.category ?? '';
    const current = groups.get(key) ?? { count: 0, multiple: 0 };
    current.count++;
    groups.set(key, current);
  }
  for (const [key, current] of groups) {
    const ratios = snapshot.protocols.filter((protocol) => (protocol.category ?? '') === key && protocol.mcap_usd !== null && protocol.tvl_usd > 0)
      .map((protocol) => protocol.mcap_usd! / protocol.tvl_usd);
    current.multiple = ratios.length < 2 ? global : (ratios.length * median(ratios) + 4 * global) / (ratios.length + 4);
    current.multiple = Math.max(.02, Math.min(1.5, current.multiple));
  }
  return [...groups].map(([category, value]) => ({ category, live_count: value.count, multiple: +value.multiple.toFixed(4) }))
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
}

export function dataScript(snapshot: Snapshot, rows: Row[]) {
  const live = buildLiveRows(snapshot);
  const allRatios = snapshot.protocols.filter((protocol) => protocol.mcap_usd !== null && protocol.tvl_usd > 0)
    .map((protocol) => protocol.mcap_usd! / protocol.tvl_usd).sort((a, b) => a - b);
  const global = median(allRatios);
  const categories = categorySummary(snapshot, global);
  const compactRows = rows.map((row) => ({
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, age_days: row.age_days,
    watchlist: row.watchlist, implied_value_usd: row.implied_value_usd, score: row.score,
    ...row.model, farm_steps: row.farm_steps
  }));
  const dataset = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: 'token-radar-original-1',
    model_constants: {
      global_multiple: global, shrinkage_weight: 4, momentum_weight: .45, momentum_divisor: 30,
      maturity_floor: .75, maturity_range: .5, maturity_days: 1460, breadth_step: .015
    },
    category_multiples: categories,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.filter((row) => !row.watchlist).length,
    live_size: live.length,
    rows: compactRows,
    live_rows: live
  };
  return `window.RADAR = ${JSON.stringify(dataset)};\n`;
}
