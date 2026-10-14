// Small statistics toolkit: summaries, the normal distribution, and binning.

export function sum(a) {
  let s = 0;
  for (const v of a) s += v;
  return s;
}

export function mean(a) {
  return a.length ? sum(a) / a.length : NaN;
}

// ddof = 0 gives the population SD (divide by N); ddof = 1 gives the sample SD.
export function variance(a, ddof = 0) {
  const n = a.length;
  if (n - ddof <= 0) return NaN;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return s / (n - ddof);
}

export function sd(a, ddof = 0) {
  return Math.sqrt(variance(a, ddof));
}

export function skewness(a) {
  const n = a.length;
  if (n < 3) return NaN;
  const m = mean(a);
  let m2 = 0, m3 = 0;
  for (const v of a) {
    const d = v - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= n;
  m3 /= n;
  return m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
}

export function median(a) {
  const s = Float64Array.from(a).sort();
  const n = s.length;
  if (!n) return NaN;
  const h = n >> 1;
  return n % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

export function max(a) {
  let m = -Infinity;
  for (const v of a) if (v > m) m = v;
  return m;
}

export function min(a) {
  let m = Infinity;
  for (const v of a) if (v < m) m = v;
  return m;
}

export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

// Complementary error function (Numerical Recipes erfcc, |relative error| < 1.2e-7).
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 +
    t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 +
    t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

export function normalCdf(z) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

export function normalPdf(x, mu = 0, s = 1) {
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
}

// ---- formatting ----

export function fmt(x, d = 2) {
  return Number.isFinite(x) ? x.toFixed(d) : '—';
}

export function fmtP(p) {
  if (!Number.isFinite(p)) return '—';
  if (p > 0 && p < 0.0001) return '< 0.0001';
  return p.toFixed(4);
}

export function fmtInt(n) {
  return Number(n).toLocaleString('en-US');
}

// ---- binning ----
// When a statistic can only take values on a lattice (multiples of `lattice`,
// e.g. x̄ from die rolls is always a multiple of 1/n), bins are made a whole number
// of lattice steps wide and offset by half a step, so every bin holds the same
// number of possible values. Without this the histogram shows false jaggedness.

export function binSpec(lo, hi, target, lattice) {
  let width = (hi - lo) / target;
  let origin = lo;
  if (lattice) {
    const k = Math.max(1, Math.round(width / lattice));
    width = k * lattice;
    origin = (Math.floor(lo / lattice) - 0.5) * lattice;
  }
  return { origin, width };
}

// Counts (or summed weights) per bin over [lo, hi]. Values outside are tallied in `outside`.
export function binCounts(values, lo, hi, spec, weights = null) {
  const { origin, width } = spec;
  const i0 = Math.floor((lo - origin) / width);
  const i1 = Math.floor((hi - origin) / width);
  const counts = new Array(i1 - i0 + 1).fill(0);
  let outside = 0;
  for (let j = 0; j < values.length; j++) {
    const i = Math.floor((values[j] - origin) / width) - i0;
    const w = weights ? weights[j] : 1;
    if (i >= 0 && i < counts.length) counts[i] += w;
    else outside += w;
  }
  const bins = counts.map((count, j) => ({
    x0: origin + (i0 + j) * width,
    x1: origin + (i0 + j + 1) * width,
    count,
  }));
  return { bins, width, outside };
}
