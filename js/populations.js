// Population library. Every quantitative population is a fixed, finite list of
// 10,000 values generated from a fixed seed, so μ and σ are exact properties of
// the data on screen (not of an idealised formula). Samples are drawn with
// replacement, which makes σ/√n hold exactly.
//
// To add a population: add an entry to DEFS with a `make(rng)` that returns an
// array of values (or `counts` for exact discrete populations).

import { RNG } from './rng.js';
import { mean, sd, skewness, median, max, min } from './stats.js';

const N = 10000;

function repeatUntil(gen, ok) {
  let v;
  do v = gen(); while (!ok(v));
  return v;
}

function fromCounts(counts) {
  const out = [];
  for (const [value, count] of counts) for (let i = 0; i < count; i++) out.push(value);
  return out;
}

const DEFS = [
  {
    id: 'heights',
    name: "Adult men's heights",
    units: 'inches',
    shape: 'Normal',
    note: 'Simulated: normal with mean ≈ 69 in and SD ≈ 2.9 in, close to US adult men.',
    axis: [58, 80],
    dp: 2,
    make: (r) => Array.from({ length: N }, () => r.normal(69.1, 2.9)),
  },
  {
    id: 'die',
    name: 'Rolls of a fair die',
    units: 'pips',
    shape: 'Uniform (discrete)',
    note: 'Exactly 1,000 each of 1–6. Watch n = 2 make a triangle.',
    axis: [0.5, 6.5],
    step: 1,
    dp: 2,
    counts: [[1, 1000], [2, 1000], [3, 1000], [4, 1000], [5, 1000], [6, 1000]],
  },
  {
    id: 'wait',
    name: 'Minutes between help-desk calls',
    units: 'minutes',
    shape: 'Right-skewed',
    note: 'Simulated exponential waiting times, mean 5 min.',
    axis: [0, 40],
    dp: 2,
    make: (r) => Array.from({ length: N }, () => repeatUntil(() => r.exponential(5), (v) => v <= 40)),
  },
  {
    id: 'eruptions',
    name: 'Geyser eruption durations',
    units: 'minutes',
    shape: 'Bimodal',
    note: 'Simulated in the style of Old Faithful: short (~2 min) and long (~4.4 min) eruptions.',
    axis: [1.2, 5.8],
    dp: 2,
    make: (r) => Array.from({ length: N }, () => repeatUntil(
      () => (r.random() < 0.35 ? r.normal(2.0, 0.28) : r.normal(4.35, 0.42)),
      (v) => v >= 1.3 && v <= 5.7)),
  },
  {
    id: 'exam',
    name: 'Scores on an easy exam',
    units: 'points',
    shape: 'Left-skewed',
    note: 'Simulated: most students score in the 90s, with a long tail of lower scores.',
    axis: [39.5, 100.5],
    step: 1,
    dp: 2,
    make: (r) => Array.from({ length: N }, () => repeatUntil(
      () => 100 - Math.round(r.exponential(6) + r.exponential(6)),
      (v) => v >= 40)),
  },
  {
    id: 'children',
    name: 'Children per household',
    units: 'children',
    shape: 'Right-skewed (discrete)',
    note: 'Simulated counts: 38% of households have no children.',
    axis: [-0.5, 6.5],
    step: 1,
    dp: 2,
    counts: [[0, 3800], [1, 2100], [2, 2300], [3, 1100], [4, 450], [5, 180], [6, 70]],
  },
  {
    id: 'income',
    name: 'Household income',
    units: '$ thousands',
    shape: 'Strongly right-skewed',
    note: 'Simulated lognormal (median ≈ $60k, capped at $800k). Even at n = 30 the sampling distribution is still visibly skewed.',
    axis: [0, 800],
    dp: 1,
    make: (r) => Array.from({ length: N }, () => repeatUntil(
      () => 60 * Math.exp(r.normal(0, 1)), (v) => v <= 800)),
  },
  {
    id: 'scratch',
    name: 'Scratch-off ticket winnings',
    units: 'dollars',
    shape: 'Extreme skew',
    note: '80% win $0; 1 ticket in 1,000 wins $1,000. The “n ≥ 30” rule fails badly here — try the zoomed axis.',
    axis: [0, 1000],
    step: 1,
    dp: 2,
    counts: [[0, 8000], [2, 1500], [10, 400], [100, 90], [1000, 10]],
  },
];

export const POPULATION_LIST = DEFS.map(({ id, name, shape }) => ({ id, name, shape }));

const cache = new Map();

function finalize(def, values) {
  const mu = mean(values);
  const sigma = sd(values, 0);
  // widen the display axis if any value falls outside it
  const lo = min(values), hi = max(values);
  const pad = (def.axis[1] - def.axis[0]) * 0.02;
  const axis = [Math.min(def.axis[0], lo - pad), Math.max(def.axis[1], hi + pad)];
  return {
    ...def,
    axis,
    kind: 'quant',
    values,
    N: values.length,
    mu,
    sigma,
    skew: skewness(values),
    median: median(values),
    max: max(values),
    min: min(values),
    dp: def.dp ?? 2,
    sample(n, rng) {
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = values[rng.int(values.length)];
      return out;
    },
  };
}

export function getPopulation(id) {
  if (cache.has(id)) return cache.get(id);
  const def = DEFS.find((d) => d.id === id) || DEFS[0];
  const values = def.counts ? fromCounts(def.counts) : def.make(new RNG(7000 + DEFS.indexOf(def)));
  const pop = finalize(def, values);
  cache.set(def.id, pop);
  return pop;
}

// An infinite normal population, used by the probability tool's "custom" option.
export function makeNormal(mu, sigma) {
  return {
    id: 'custom',
    name: `Normal(μ = ${mu}, σ = ${sigma})`,
    units: '',
    shape: 'Normal',
    note: 'An idealised normal population.',
    kind: 'quant',
    values: null,
    mu,
    sigma,
    skew: 0,
    axis: [mu - 4 * sigma, mu + 4 * sigma],
    dp: 2,
    sample(n, rng) {
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = rng.normal(mu, sigma);
      return out;
    },
  };
}

// A population of successes (1) and failures (0) in proportion p.
export function makeUrn(p, successLabel = 'success') {
  const sigma = Math.sqrt(p * (1 - p));
  return {
    id: 'urn',
    name: 'Bead urn',
    kind: 'binary',
    p,
    mu: p,
    sigma,
    skew: sigma > 0 ? (1 - 2 * p) / sigma : 0,
    successLabel,
    axis: [0, 1],
    step: 1,
    dp: 3,
    sample(n, rng) {
      const out = new Array(n);
      for (let i = 0; i < n; i++) out[i] = rng.next() < p ? 1 : 0;
      return out;
    },
  };
}

export const PROP_PRESETS = [
  { id: 'custom', label: 'Custom p', p: null, success: 'success' },
  { id: 'coin', label: 'Coin flips (heads)', p: 0.5, success: 'heads' },
  { id: 'vote', label: 'Voters supporting a measure', p: 0.52, success: 'supporters' },
  { id: 'lefty', label: 'Left-handed people', p: 0.1, success: 'left-handed' },
  { id: 'defect', label: 'Defective parts', p: 0.02, success: 'defective' },
];
