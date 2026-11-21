export interface Protocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[]; }
export interface Row {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  age_days: number | null; watchlist: boolean; implied_value_usd: number; risk_adjusted_value_usd: number;
  score: number; conviction: number; momentum_tier: string; comparable_count: number;
  farm_cost_usd: number; farm_hours: number; value_per_farmed_usd: number; value_per_farm_hour_usd: number;
  category_heat_band: string; stability_band: string; stability_factor: number; concentration_label: string;
  winsorized: boolean;
  model: { category_multiple: number; momentum_multiplier: number; maturity_multiplier: number;
    breadth_multiplier: number; category_heat_multiplier: number; stability_multiplier: number;
    chain_concentration_penalty: number; effective_chain_count: number; };
  farm_steps: string[];
}

export class SnapshotError extends Error { constructor(message: string) { super(message); this.name = 'SnapshotError'; } }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function parseSnapshot(raw: string | unknown): Snapshot {
  let input: any;
  try { input = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { throw new SnapshotError('snapshot is not valid JSON'); }
  const reject = (reason: string): never => { throw new SnapshotError(`invalid snapshot: ${reason}`); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) reject('expected object');
  if (typeof input.as_of !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(input.as_of) || typeof input.source !== 'string' || !finite(input.floor_usd) || !Array.isArray(input.protocols) || !Array.isArray(input.watchlist)) reject('invalid top-level fields');
  const keys = ['slug','name','category','chains','tvl_usd','change_7d','mcap_usd','listed_at','gecko_id','symbol'].sort().join(',');
  const seen = new Set<string>();
  for (const p of input.protocols) {
    if (!p || typeof p !== 'object' || Object.keys(p).sort().join(',') !== keys) reject('protocol fields do not match schema');
    if (typeof p.slug !== 'string' || !p.slug || seen.has(p.slug) || typeof p.name !== 'string' || !(p.category === null || typeof p.category === 'string') || !Array.isArray(p.chains) || !p.chains.every((c: any) => typeof c === 'string') || !finite(p.tvl_usd) || !(p.change_7d === null || finite(p.change_7d)) || !(p.mcap_usd === null || finite(p.mcap_usd)) || !(p.listed_at === null || typeof p.listed_at === 'string') || !(p.gecko_id === null || typeof p.gecko_id === 'string') || !(p.symbol === null || typeof p.symbol === 'string')) reject(`invalid protocol ${String(p.slug)}`);
    seen.add(p.slug);
  }
  if (!input.watchlist.every((slug: any) => typeof slug === 'string' && seen.has(slug))) reject('invalid watchlist');
  return input as Snapshot;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return n ? n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : 0;
};
const preferredChains = ['Base','Arbitrum','Solana','Binance','Polygon','Avalanche','Optimism','Ethereum'];
const exchangeName = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const excludedCategories = new Set(['Bridge','Canonical Bridge','Liquid Staking','Liquid Restaking','Restaked BTC','CEX']);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const ageInDays = (date: string | null, snapshot: string): number | null => date === null ? null : Math.floor((Date.parse(snapshot + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000);
function primaryChain(protocol: Protocol) { for (const chain of preferredChains) if (protocol.chains.includes(chain)) return chain; return protocol.chains[0] ?? 'the protocol’s supported chain'; }
const transactionCost = (chain: string) => chain === 'Ethereum' ? 'roughly $8 to $15' : 'cents to about $1';

function makeFarmPlan(protocol: Protocol, age: number | null): string[] {
  const chain = primaryChain(protocol), gas = transactionCost(chain);
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
  const weekly = /lending|cdp/.test(category) ? 'make a small deposit or borrow' : /dex|yield|aggregator|basis/.test(category) ? 'make a small swap' : /governance/.test(category) ? 'cast a vote' : 'make a qualifying deposit';
  const secondChain = protocol.chains.find(candidate => candidate !== chain) ?? chain;
  const secondGas = transactionCost(secondChain);
  const second = protocol.chains.length >= 3 ? `Open a smaller $${Math.floor(capital / 2)} position on ${secondChain}.` : `Add a smaller top-up on ${chain} and check the protocol’s own points or rewards page for a season or campaign to join.`;
  const days = age !== null && age < 180 ? 60 : age !== null && age < 365 ? 45 : 30;
  return [
    `Set up a fresh wallet holding only farm funds, keep its seed phrase offline, and fund it on ${chain}. Cost: ${gas} for one transaction. Time: 20 minutes once.`,
    `On ${chain}, ${action} with $${capital} in farm capital using the protocol’s own interface. Cost: ${gas} for one transaction. Time: 20 minutes once.`,
    `On ${chain}, ${weekly} once each week to leave a qualifying on-chain record. Cost: ${gas} weekly. Time: 10 minutes a week.`,
    second + ` Cost: ${protocol.chains.length >= 3 ? secondGas : gas} for one transaction. Time: 15 minutes once.`,
    `Hold the position for ${days} days so your activity spans more than one snapshot; review it weekly. Cost: $0 while holding. Time: 5 minutes a week.`,
    `Claim only from the link on the protocol’s own points or rewards page, never pay to claim, then record the wallet, dates and transactions in a farm log. Cost: ${gas} only if a free claim transaction is available. Time: 10 minutes once.`
  ];
}

function shrunkMultiple(samples: number[], global: number) {
  const count = samples.length;
  if (!count) return { multiple: global, count: 0 };
  const trust = count / (count + 3);
  return { multiple: clamp(global + (median(samples) - global) * trust, .02, 1.5), count };
}
function momentum(change: number | null) {
  if (change === null) return { factor: 1, tier: 'Unreported' };
  if (change >= 0) return { factor: 1 + .55 * (1 - Math.exp(-change / 32)), tier: change >= 20 ? 'Surging' : change >= 5 ? 'Building' : 'Steady' };
  return { factor: Math.max(.65, 1 - .28 * (1 - Math.exp(change / 45))), tier: change <= -20 ? 'Fading' : 'Cooling' };
}
function heatBand(change: number | null) {
  if (change === null) return { factor: 1, band: 'Unrated' };
  return change >= 12 ? { factor: 1.06, band: 'Hot' } : change >= 3 ? { factor: 1.03, band: 'Warming' } : change <= -12 ? { factor: .94, band: 'Cold' } : change <= -3 ? { factor: .97, band: 'Cooling' } : { factor: 1, band: 'Neutral' };
}
function stability(change: number | null) {
  if (change === null) return { factor: .92, band: 'Unobserved' };
  const magnitude = Math.abs(change);
  if (magnitude < 10) return { factor: 1, band: 'Calm' };
  if (magnitude < 25) return { factor: .94, band: 'Choppy' };
  if (magnitude < 50) return { factor: .84, band: 'Volatile' };
  return { factor: .70, band: 'Turbulent' };
}
function categoryData(snapshot: Snapshot) {
  const live = snapshot.protocols.filter(p => p.mcap_usd !== null && p.tvl_usd > 0);
  const global = median(live.map(p => p.mcap_usd! / p.tvl_usd));
  const groups = new Map<string, number[]>(), changes = new Map<string, number[]>();
  for (const protocol of snapshot.protocols) { const key = protocol.category ?? ''; if (!groups.has(key)) groups.set(key, []); if (!changes.has(key)) changes.set(key, []); }
  for (const protocol of live) {
    const key = protocol.category ?? '';
    groups.get(key)!.push(protocol.mcap_usd! / protocol.tvl_usd);
    if (protocol.change_7d !== null) changes.get(key)!.push(protocol.change_7d);
  }
  const categories = [...groups].map(([category, samples]) => {
    const heat = heatBand(median(changes.get(category) ?? []));
    return { category, live_count: samples.length, multiple: +shrunkMultiple(samples, global).multiple.toFixed(4), heat_band: heat.band, heat_multiplier: heat.factor, median_change_7d: median(changes.get(category) ?? []) };
  }).sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  return { global, groups, changes, categories };
}
function farmCost(protocol: Protocol, steps: string[]) {
  const chain = primaryChain(protocol), perTx = chain === 'Ethereum' ? 11.5 : .5;
  let transactions = 0, weekly = 0, fixed = 0;
  for (const step of steps) {
    const match = step.match(/Cost: ([^.]+)\./); if (!match) continue;
    const cost = match[1];
    if (cost.includes('weekly')) weekly += perTx;
    else if (cost.includes('only if')) transactions += perTx * .5;
    else if (cost.startsWith('$')) fixed += Number(cost.slice(1));
    else transactions += perTx;
  }
  return Math.max(1, +(transactions + weekly * 4 + fixed).toFixed(2));
}
function farmHours(steps: string[]) {
  let minutes = 0;
  for (const step of steps) {
    const once = step.match(/Time: (\d+) minutes once\./), weekly = step.match(/Time: (\d+) minutes a week\./);
    if (once) minutes += Number(once[1]);
    else if (weekly) minutes += Number(weekly[1]) * 4;
  }
  return +(minutes / 60).toFixed(2);
}
function chainQuality(chains: string[]) {
  const distinct = [...new Set(chains)];
  const count = distinct.length;
  const occurrences = distinct.map(chain => chains.filter(candidate => candidate === chain).length);
  const topShare = chains.length ? Math.max(...occurrences) / chains.length : 1;
  const penalty = 1 - topShare;
  const effectiveCount = count * (1 - .55 * topShare);
  const factor = 1 + .12 * Math.log1p(Math.max(0, effectiveCount - 1));
  const label = count <= 1 ? 'Single-chain' : topShare >= .6 ? 'Concentrated' : count >= 4 ? 'Distributed' : 'Balanced';
  return { count, topShare, penalty, effectiveCount, factor, label };
}

export function buildBoard(snapshot: Snapshot): Row[] {
  const { global, groups, changes } = categoryData(snapshot), watchlist = new Set(snapshot.watchlist);
  const members = snapshot.protocols.filter(protocol => {
    if (watchlist.has(protocol.slug)) return true;
    if (protocol.gecko_id !== null || protocol.symbol !== null) return false;
    if (excludedCategories.has(protocol.category ?? '') || /\b(wrapped|staked|staking)\b/i.test(protocol.name) || exchangeName.test(protocol.name) || /\s(?:[Vv]\d+(?:\.\d+)?|\d+\.\d+)$/.test(protocol.name)) return false;
    return true;
  });
  const candidates = members.map(protocol => {
    const age = ageInDays(protocol.listed_at, snapshot.as_of), key = protocol.category ?? '';
    const category = shrunkMultiple(groups.get(key) ?? [], global);
    const peerMoves = snapshot.protocols.filter(p => (p.category ?? '') === key && p.change_7d !== null).map(p => Math.abs(p.change_7d!));
    const limit = Math.max(5, 3 * median(peerMoves)), original = protocol.change_7d;
    const adjusted = original === null ? null : clamp(original, -limit, limit);
    const clipped = original !== null && adjusted !== original;
    const trend = momentum(adjusted), heat = heatBand(median(changes.get(key) ?? [])), stable = stability(adjusted);
    const maturity = .75 + .5 * Math.min(age ?? 365, 1460) / 1460, chain = chainQuality(protocol.chains);
    const value = Math.max(1, Math.round(protocol.tvl_usd * category.multiple * trend.factor * maturity * chain.factor * heat.factor));
    const riskValue = Math.max(1, Math.round(value * stable.factor));
    const depth = 30 * (1 - Math.exp(-category.count / 4));
    const chainPenalty = chain.label === 'Single-chain' ? 4 : chain.label === 'Concentrated' ? 3 : 0;
    const stabilityPenalty = stable.band === 'Calm' ? 0 : stable.band === 'Choppy' ? 2 : stable.band === 'Volatile' ? 5 : stable.band === 'Turbulent' ? 8 : 3;
    const conviction = Math.round(clamp((original === null ? 0 : 25) + (protocol.listed_at === null ? 0 : 20) + Math.min(chain.count, 5) * 5 + depth - (clipped ? 5 : 0) - stabilityPenalty - chainPenalty, 0, 100));
    const steps = makeFarmPlan(protocol, age), cost = farmCost(protocol, steps), hours = farmHours(steps);
    return { protocol, age, category, trend, heat, stable, maturity, chain, value, riskValue, conviction, clipped, steps, cost, hours };
  });
  candidates.sort((a, b) => b.value - a.value || (a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0));
  return candidates.map((item, index) => ({
    rank: index + 1, slug: item.protocol.slug, name: item.protocol.name, category: item.protocol.category,
    chains: item.protocol.chains, tvl_usd: item.protocol.tvl_usd, change_7d: item.protocol.change_7d,
    mcap_usd: item.protocol.mcap_usd, listed_at: item.protocol.listed_at, age_days: item.age,
    watchlist: watchlist.has(item.protocol.slug), implied_value_usd: item.value, risk_adjusted_value_usd: item.riskValue,
    score: item.conviction, conviction: item.conviction, momentum_tier: item.trend.tier,
    comparable_count: item.category.count, farm_cost_usd: item.cost, farm_hours: item.hours,
    value_per_farmed_usd: +(item.value / item.cost).toFixed(2), value_per_farm_hour_usd: +(item.value / item.hours).toFixed(2),
    category_heat_band: item.heat.band, stability_band: item.stable.band, stability_factor: item.stable.factor,
    concentration_label: item.chain.label, winsorized: item.clipped,
    model: { category_multiple: +item.category.multiple.toFixed(4), momentum_multiplier: +item.trend.factor.toFixed(4), maturity_multiplier: +item.maturity.toFixed(4), breadth_multiplier: +item.chain.factor.toFixed(4), category_heat_multiplier: item.heat.factor, stability_multiplier: item.stable.factor, chain_concentration_penalty: +item.chain.penalty.toFixed(4), effective_chain_count: +item.chain.effectiveCount.toFixed(3) },
    farm_steps: item.steps
  }));
}
export function buildLiveRows(snapshot: Snapshot) { return snapshot.protocols.filter(p => p.mcap_usd !== null).sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).slice(0, 24); }
export function boardIssue(snapshot: Snapshot, rows: Row[]): string | null {
  const fail = (message: string) => message;
  if (rows.length < 100 || rows.length > 4000) return fail(`board row count ${rows.length} is outside 100..4000`);
  const slugs = new Set(rows.map(row => row.slug));
  for (const slug of snapshot.watchlist) if (!slugs.has(slug)) return fail(`watchlist slug missing: ${slug}`);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.rank !== index + 1) return fail('ranks are not exactly 1..N');
    if (index && rows[index - 1].implied_value_usd < row.implied_value_usd) return fail('implied values rise as rank ascends');
    if (!snapshot.protocols.some(p => p.slug === row.slug)) return fail(`unknown protocol slug: ${row.slug}`);
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) return fail(`invalid implied value for ${row.slug}`);
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12 || row.farm_steps.some(step => typeof step !== 'string' || step.trim().length < 20 || step.trim().length > 600)) return fail(`invalid farm steps for ${row.slug}`);
  }
  if (rows.every(row => row.implied_value_usd === rows[0].implied_value_usd)) return fail('all implied values are identical');
  return null;
}
export function dataScript(snapshot: Snapshot, rows: Row[]) {
  const live = buildLiveRows(snapshot), { global, categories } = categoryData(snapshot);
  const compact = rows.map(row => ({
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, age_days: row.age_days, listed_at: row.listed_at,
    watchlist: row.watchlist, implied_value_usd: row.implied_value_usd, risk_adjusted_value_usd: row.risk_adjusted_value_usd,
    score: row.score, conviction: row.conviction, momentum_tier: row.momentum_tier, comparable_count: row.comparable_count,
    farm_cost_usd: row.farm_cost_usd, farm_hours: row.farm_hours, value_per_farmed_usd: row.value_per_farmed_usd,
    value_per_farm_hour_usd: row.value_per_farm_hour_usd, category_heat_band: row.category_heat_band,
    stability_band: row.stability_band, stability_factor: row.stability_factor, concentration_label: row.concentration_label,
    winsorized: row.winsorized, ...row.model, farm_steps: row.farm_steps
  }));
  const dataset = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd, model_version: 'token-radar-v4',
    model_constants: {
      category_prior_strength: 3, winsor_band_mad_multiple: 3, winsor_minimum_band: 5,
      momentum_positive_scale: 32, momentum_positive_cap: .55, momentum_negative_scale: 45,
      momentum_negative_penalty: .28, momentum_floor: .65, maturity_floor: .75, maturity_range: .5,
      maturity_days: 1460, chain_effective_count_discount: .55, chain_log_weight: .12,
      stability_bands: { calm_below_abs_change: 10, choppy_below: 25, volatile_below: 50, factors: [1, .94, .84, .70] },
      heat_bands: { hot: 12, warming: 3, cooling: -3, cold: -12 },
      heat_factors: { hot: 1.06, warming: 1.03, neutral: 1, cooling: .97, cold: .94 },
      conviction_weights: { change_7d: 25, listed_at: 20, chains: 25, comparables: 30, winsorized_penalty: 5, stability_penalties: { calm: 0, choppy: 2, volatile: 5, turbulent: 8, unobserved: 3 }, chain_label_penalties: { single_chain: 4, concentrated: 3, balanced: 0, distributed: 0 } }
    },
    category_multiples: categories, watchlist_size: snapshot.watchlist.length, board_size: rows.length,
    early_size: rows.filter(row => !row.watchlist).length, live_size: live.length, rows: compact, live_rows: live
  };
  return `window.RADAR = ${JSON.stringify(dataset)};\n`;
}
