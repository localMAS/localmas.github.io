// Tool 1: sampling variability with a small, visible population of 30 men.

import { RNG } from './rng.js';
import * as S from './stats.js';
import { Plot } from './plot.js';
import { HEIGHTS30 } from './data/heights30.js';
import { $, readParams, saveParams, initChrome, bindKeys, onLayoutChange, tween, SPEEDS } from './ui.js';

const H = HEIGHTS30;
const N = H.length;
const MU = S.mean(H);
const SIGMA = S.sd(H, 0);
const AXIS = [Math.floor(S.min(H)) - 1, Math.ceil(S.max(H)) + 1];

// Exact distribution of x̄ over every possible sample, by dynamic programming on
// sums measured in tenths of an inch (no need to list the samples one by one).
function exactDistribution(n, replace) {
  const t = H.map((h) => Math.round(h * 10));
  const maxSum = S.max(t) * n;
  let dist;
  if (!replace) {
    // dp[k][s] = number of k-man subsets whose heights sum to s
    const dp = Array.from({ length: n + 1 }, () => new Float64Array(maxSum + 1));
    dp[0][0] = 1;
    for (const v of t) {
      for (let k = n; k >= 1; k--) {
        const prev = dp[k - 1], cur = dp[k];
        for (let s = maxSum; s >= v; s--) if (prev[s - v]) cur[s] += prev[s - v];
      }
    }
    dist = dp[n];
  } else {
    // Each of n ordered draws is equally likely to be any of the N men.
    dist = new Float64Array(maxSum + 1);
    dist[0] = 1;
    for (let k = 0; k < n; k++) {
      const next = new Float64Array(maxSum + 1);
      for (let s = 0; s <= maxSum; s++) {
        if (!dist[s]) continue;
        for (const v of t) if (s + v <= maxSum) next[s + v] += dist[s];
      }
      dist = next;
    }
  }
  const xs = [], ws = [];
  let total = 0;
  for (let s = 0; s <= maxSum; s++) if (dist[s]) { total += dist[s]; }
  for (let s = 0; s <= maxSum; s++) if (dist[s]) { xs.push(s / (10 * n)); ws.push(dist[s] / total); }
  let m = 0;
  for (let i = 0; i < xs.length; i++) m += xs[i] * ws[i];
  let v = 0;
  for (let i = 0; i < xs.length; i++) v += ws[i] * (xs[i] - m) ** 2;
  return { xs, ws, mean: m, sd: Math.sqrt(v), count: replace ? Math.pow(N, n) : S.choose(N, n) };
}

export function startPicker() {
  const P = readParams({ n: 5, repl: 0, seed: 1, speed: 'normal', exact: 0, present: 0 });
  const chrome = initChrome('picker', P);
  const rng = new RNG(P.seed);

  let means = [];          // committed sample means
  let current = null;      // { idx: [...], mean }
  let revealed = 0;        // how many of current.idx are highlighted so far
  let fall = null;         // { x, u } dot falling into the means row
  let anim = null;
  let exact = null;

  const linePlot = new Plot($('#lineCanvas'), { height: 290, margin: { l: 14, r: 14, t: 26, b: 36 } });
  const exactPlot = new Plot($('#exactCanvas'), { height: 190, margin: { l: 14, r: 14, t: 26, b: 36 } });

  // ---------- controls ----------
  $('#nSelect').innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('');
  $('#nSelect').value = String(P.n);
  $('#replToggle').checked = !!P.repl;
  $('#speedSelect').value = P.speed;
  $('#seedInput').value = P.seed;

  const tokens = $('#tokens');
  tokens.innerHTML = H.map((h, i) =>
    `<div class="token" data-i="${i}"><span class="id">#${i + 1}</span><span class="h">${h.toFixed(1)}</span></div>`).join('');
  const tokenEls = [...tokens.children];
  $('#popMeta').textContent = `N = ${N} · μ = ${MU.toFixed(2)} in · σ = ${SIGMA.toFixed(2)} in`;

  function reset() {
    cancel();
    rng.reseed(P.seed);
    means = [];
    current = null;
    revealed = 0;
    exact = P.exact ? exactDistribution(P.n, !!P.repl) : null;
    renderAll();
  }

  $('#nSelect').addEventListener('change', (e) => { P.n = +e.target.value; saveParams(P); reset(); });
  $('#replToggle').addEventListener('change', (e) => { P.repl = e.target.checked ? 1 : 0; saveParams(P); reset(); });
  $('#speedSelect').addEventListener('change', (e) => { P.speed = e.target.value; saveParams(P); });
  $('#seedInput').addEventListener('change', (e) => {
    P.seed = Math.max(1, Math.floor(+e.target.value) || 1);
    e.target.value = P.seed;
    saveParams(P);
    reset();
  });
  const toggleExact = () => {
    P.exact = P.exact ? 0 : 1;
    saveParams(P);
    exact = P.exact ? exactDistribution(P.n, !!P.repl) : null;
    renderAll();
  };
  $('#btnExact').addEventListener('click', toggleExact);
  $('#btnDraw1').addEventListener('click', () => draw(1));
  $('#btnDraw10').addEventListener('click', () => draw(10));
  $('#btnDraw100').addEventListener('click', () => draw(100, false));
  $('#btnReset').addEventListener('click', reset);

  bindKeys({
    space: () => draw(1),
    t: () => draw(10),
    h: () => draw(100, false),
    r: reset,
    e: toggleExact,
    f: () => chrome.togglePresenter(),
  });
  onLayoutChange(renderAll);

  // ---------- sampling ----------
  function drawIndices() {
    const n = P.n;
    if (P.repl) return Array.from({ length: n }, () => rng.int(N));
    const pool = [...Array(N).keys()];
    for (let i = 0; i < n; i++) {
      const j = i + rng.int(N - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  }

  function newSample() {
    const idx = drawIndices();
    return { idx, mean: S.mean(idx.map((i) => H[i])) };
  }

  function cancel() {
    if (!anim) return;
    anim.cancelled = true;
    if (anim.pending) means.push(anim.pending.mean);
    anim = null;
    fall = null;
    revealed = current ? current.idx.length : 0;
  }

  async function draw(count, animate = true) {
    cancel();
    const sp = SPEEDS[P.speed];
    if (!animate || sp === 0) {
      for (let i = 0; i < count; i++) {
        current = newSample();
        means.push(current.mean);
      }
      revealed = current.idx.length;
      renderAll();
      return;
    }
    const token = { cancelled: false, pending: null };
    anim = token;
    const f = count > 1 ? 0.3 : 1;
    for (let i = 0; i < count && !token.cancelled; i++) {
      current = newSample();
      token.pending = current;
      revealed = 0;
      renderTokens();
      renderSampleLine();
      for (let k = 0; k < current.idx.length && !token.cancelled; k++) {
        await tween(token, 260 * sp * f, () => {});
        revealed = k + 1;
        renderTokens();
        renderSampleLine();
      }
      await tween(token, 450 * sp * f, () => {});
      fall = { x: current.mean, u: 0 };
      await tween(token, 550 * sp * f, (u) => { if (fall) fall.u = u; renderLine(); });
      if (token.cancelled) return;
      means.push(current.mean);
      token.pending = null;
      fall = null;
      renderAll();
    }
    if (anim === token) anim = null;
  }

  // ---------- rendering ----------
  function renderAll() {
    renderTokens();
    renderSampleLine();
    renderLine();
    renderExact();
    renderReadout();
  }

  function pickedCounts() {
    const counts = new Map();
    if (current) for (const i of current.idx.slice(0, revealed)) counts.set(i, (counts.get(i) || 0) + 1);
    return counts;
  }

  function renderTokens() {
    const counts = pickedCounts();
    tokenEls.forEach((el, i) => {
      const c = counts.get(i) || 0;
      el.classList.toggle('picked', c > 0);
      const badge = el.querySelector('.count');
      if (c > 1) {
        if (badge) badge.textContent = '×' + c;
        else el.insertAdjacentHTML('beforeend', `<span class="count">×${c}</span>`);
      } else if (badge) badge.remove();
    });
  }

  function renderSampleLine() {
    const el = $('#sampleLine');
    if (!current) {
      el.innerHTML = `<span class="note">Press <kbd>Space</kbd> or “Draw 1 sample” to choose ${P.n} men at random.</span>`;
      return;
    }
    const shown = current.idx.slice(0, revealed).map((i) => H[i].toFixed(1));
    const n = current.idx.length;
    if (revealed < n) {
      el.innerHTML = `Sample: ${shown.join(', ')}${shown.length ? ', ' : ''}…`;
      return;
    }
    const diff = current.mean - MU;
    el.innerHTML = `x̄ = (${shown.join(' + ')}) / ${n} = <strong style="color:var(--stat)">${current.mean.toFixed(2)} in</strong>
      <span class="note" style="margin-left:8px">μ = ${MU.toFixed(2)}, so this sample is off by ${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(2)} in</span>`;
  }

  function renderLine() {
    const pl = linePlot.begin();
    pl.setX(AXIS[0], AXIS[1]);
    const mid = (pl.top + pl.bottom) / 2;
    const row1 = [pl.top + pl.font + 6, mid - 6];
    const row2 = [mid + pl.font + 10, pl.bottom];

    // divider + row labels
    const ctx = pl.ctx;
    ctx.strokeStyle = pl.col('grid');
    ctx.beginPath();
    ctx.moveTo(pl.left, mid + 0.5);
    ctx.lineTo(pl.right, mid + 0.5);
    ctx.stroke();
    pl.text('Individual men (the population)', pl.left + 2, pl.top + pl.font, { color: pl.col('pop'), weight: 600 });
    pl.text(`Sample means x̄ (n = ${P.n})${means.length ? ` — ${S.fmtInt(means.length)} so far` : ''}`,
      pl.left + 2, mid + pl.font + 6, { color: pl.col('stat'), weight: 600 });

    pl.vline(MU, { color: pl.col('ink'), dash: [5, 4], label: `μ = ${MU.toFixed(2)}`, width: 1.5 });

    // row 1: the 30 men, highlighted if in the current sample
    const counts = pickedCounts();
    const people = H.map((h, i) => ({ x: h, color: counts.has(i) ? pl.col('sample') : pl.col('pop-fill') }));
    pl.dotStack(people, { top: row1[0], bottom: row1[1], rMax: 7 });

    // row 2: the sample means
    const items = means.map((x, i) => ({
      x,
      color: pl.col('stat-fill'),
      stroke: i === means.length - 1 && !fall ? pl.col('ink') : null,
    }));
    let fits = pl.dotStack(items, { top: row2[0], bottom: row2[1], rMax: 7, rMin: 2.2 });
    if (!fits) drawMeanBars(pl, row2);

    if (fall) {
      const r = (pl.dotRadius || 6) * 0.9;
      let yEnd = row2[1] - r;
      if (fits && pl.dotLevels) {
        const k = Math.floor((pl.sx(fall.x) - pl.left) / (2 * pl.dotRadius));
        yEnd = row2[1] - pl.dotRadius - (pl.dotLevels.get(k) || 0) * 2 * pl.dotRadius;
      }
      const y0 = row1[1];
      const e = fall.u * fall.u;
      pl.circle(pl.sx(fall.x), y0 + (yEnd - y0) * e, r, pl.col('stat'), pl.col('ink'));
    }
    if (current && revealed === current.idx.length) {
      pl.ctx.save();
      pl.vline(current.mean, { color: pl.col('stat'), width: 1.5, dash: [2, 3], label: `x̄ = ${current.mean.toFixed(2)}`, row: 1 });
      pl.ctx.restore();
    }
    pl.xAxis({ label: 'height (inches)' });

    $('#lineMeta').textContent = means.length > 1
      ? `spread of individuals: σ = ${SIGMA.toFixed(2)} · spread of x̄'s: ${S.sd(means).toFixed(2)}`
      : '';
  }

  function drawMeanBars(pl, [top, bottom]) {
    const spec = S.binSpec(AXIS[0], AXIS[1], 90, null);
    const { bins } = S.binCounts(means, AXIS[0], AXIS[1], spec);
    const peak = Math.max(...bins.map((b) => b.count));
    const ctx = pl.ctx;
    ctx.fillStyle = pl.col('stat-fill');
    for (const b of bins) {
      if (!b.count) continue;
      const h = (b.count / peak) * (bottom - top - 4);
      const xa = pl.sx(b.x0), xb = pl.sx(b.x1);
      ctx.fillRect(xa + 0.5, bottom - h, Math.max(0.6, xb - xa - 1), h);
    }
    pl.dotRadius = 6;
    pl.dotLevels = null;
  }

  function renderExact() {
    $('#exactPanel').hidden = !exact;
    $('#btnExact').textContent = exact ? 'Hide exact sampling distribution' : 'Show exact sampling distribution';
    if (!exact) return;
    const n = P.n;
    $('#exactTitle').textContent = P.repl
      ? `All ${N}^${n} = ${S.fmtInt(exact.count)} ordered samples of size ${n}`
      : `All C(${N}, ${n}) = ${S.fmtInt(exact.count)} possible samples of size ${n}`;
    $('#exactMeta').textContent = `mean of all x̄'s = ${exact.mean.toFixed(3)} · SD = ${exact.sd.toFixed(3)}`;
    const pl = exactPlot.begin();
    pl.setX(AXIS[0], AXIS[1]);
    const spec = S.binSpec(AXIS[0], AXIS[1], 90, null);
    const { bins } = S.binCounts(exact.xs, AXIS[0], AXIS[1], spec, exact.ws);
    pl.setY(0, Math.max(...bins.map((b) => b.count)) * 1.12);
    pl.bars(bins, { fill: pl.col('shade-bar') });
    pl.vline(MU, { color: pl.col('ink'), dash: [5, 4], label: `μ = ${MU.toFixed(2)}`, width: 1.5 });
    pl.xAxis({ label: 'x̄ (inches)' });
    const fpc = Math.sqrt((N - n) / (N - 1));
    $('#exactNote').innerHTML = P.repl
      ? `The mean of every possible x̄ is exactly μ, and the SD is exactly σ/√n = ${(SIGMA / Math.sqrt(n)).toFixed(3)}.`
      : `The mean of every possible x̄ is exactly μ. Because we sample <em>without</em> replacement from only ${N} men, the SD is
         σ/√n × √((N−n)/(N−1)) = ${(SIGMA / Math.sqrt(n)).toFixed(3)} × ${fpc.toFixed(3)} = ${(SIGMA / Math.sqrt(n) * fpc).toFixed(3)},
         a bit smaller than σ/√n. Tick “with replacement” to see σ/√n hold exactly.`;
  }

  function renderReadout() {
    const n = P.n;
    const se = SIGMA / Math.sqrt(n);
    const fpc = Math.sqrt((N - n) / (N - 1));
    const k = means.length;
    const simMean = k ? S.mean(means) : NaN;
    const simSD = k > 1 ? S.sd(means) : NaN;
    const spreadRow = P.repl
      ? `<tr><td>Spread of x̄</td><td class="theory">σ/√n = ${se.toFixed(3)}</td><td class="sim">${S.fmt(simSD, 3)}</td></tr>`
      : `<tr><td>Spread of x̄</td><td class="theory">σ/√n·√((N−n)/(N−1)) = ${(se * fpc).toFixed(3)}</td><td class="sim">${S.fmt(simSD, 3)}</td></tr>
         <tr><td class="note">(ignoring the small population)</td><td class="theory note">σ/√n = ${se.toFixed(3)}</td><td></td></tr>`;
    $('#readout').innerHTML = `
      <table class="readout">
        <thead><tr><th></th><th>What theory says</th><th>Your ${S.fmtInt(k)} sample${k === 1 ? '' : 's'}</th></tr></thead>
        <tbody>
          <tr><td>Center of x̄</td><td class="theory">μ = ${MU.toFixed(3)}</td><td class="sim">${S.fmt(simMean, 3)}</td></tr>
          ${spreadRow}
          <tr><td>Smallest / largest x̄</td><td></td><td>${k ? `${S.min(means).toFixed(2)} / ${S.max(means).toFixed(2)}` : '—'}</td></tr>
          <tr><td>Spread of individuals</td><td class="theory">σ = ${SIGMA.toFixed(3)}</td><td></td></tr>
        </tbody>
      </table>`;
  }

  exact = P.exact ? exactDistribution(P.n, !!P.repl) : null;
  renderAll();
}
