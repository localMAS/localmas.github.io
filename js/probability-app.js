// Tool 3: standardizing x̄ (or p̂) and finding probabilities, with a simulation check.
// The key contrast: P(one individual > a) versus P(the average of n > a).

import { RNG } from './rng.js';
import * as S from './stats.js';
import { Plot } from './plot.js';
import { POPULATION_LIST, getPopulation, makeNormal } from './populations.js';
import { $, readParams, saveParams, initChrome, bindKeys, onLayoutChange, setOptions } from './ui.js';

const SIM_BATCH = 10000;
const MODE_DEFAULTS = {
  mean: { n: 9, a: 71, b: 72, event: 'gt' },
  prop: { n: 400, a: 0.5, b: 0.55, event: 'lt' },
};

function controlsMarkup() {
  return `
    <div class="card"><h3>Statistic</h3>
      <select id="statSelect">
        <option value="mean">Sample mean x̄</option>
        <option value="prop">Sample proportion p̂</option>
      </select>
    </div>
    <div class="card"><h3>Population</h3>
      <div id="meanPop">
        <label class="field">Population <select id="popSelect"></select></label>
        <div id="customFields" class="field-row" style="margin-top:10px">
          <label class="field">μ <input type="number" step="any" id="muInput"></label>
          <label class="field">σ <input type="number" step="any" min="0" id="sigmaInput"></label>
        </div>
      </div>
      <div id="propPop">
        <label class="field">Population proportion p <input type="number" step="0.01" min="0.01" max="0.99" id="pInput"></label>
      </div>
      <label class="field">Sample size n <input type="number" min="1" max="5000" step="1" id="nInput"></label>
    </div>
    <div class="card"><h3>Event</h3>
      <label class="field">Probability that the statistic is…
        <select id="eventSelect">
          <option value="gt">greater than a</option>
          <option value="lt">less than a</option>
          <option value="between">between a and b</option>
        </select></label>
      <div class="field-row" style="margin-top:10px">
        <label class="field">a <input type="number" step="any" id="aInput"></label>
        <label class="field" id="bField">b <input type="number" step="any" id="bInput"></label>
      </div>
      <p class="note">Tip: click or drag on any plot to move a (or b).</p>
    </div>
    <div class="card"><h3>Check by simulation</h3>
      <button type="button" class="primary" id="btnSim" style="width:100%">Simulate 10,000 samples</button>
      <p class="note">Draws real samples and counts how often the event happens.</p>
    </div>
    <div class="card keys hide-present">
      <kbd>S</kbd> simulate · <kbd>←</kbd> <kbd>→</kbd> nudge a · <kbd>F</kbd> presenter mode
    </div>`;
}

function panelsMarkup() {
  return `
    <div class="panel" id="indPanel">
      <div class="panel-head"><span class="chip pop">One individual</span><h2 id="indTitle"></h2><span class="meta" id="indMeta"></span></div>
      <canvas id="indCanvas"></canvas>
      <div class="work" id="indWork"></div>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="chip stat" id="meanChip">Average of n</span><h2 id="meanTitle"></h2><span class="meta" id="meanMeta"></span></div>
      <canvas id="meanCanvas"></canvas>
      <div class="work" id="meanWork"></div>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="chip sample">Simulation</span><h2>Check by simulation</h2><span class="meta" id="simMeta"></span></div>
      <canvas id="simCanvas"></canvas>
      <div class="work" id="simOut"></div>
    </div>
    <div class="panel" id="warnPanel"><div id="warn" class="note" style="margin:0"></div></div>`;
}

const frac = (top, bottom) => `<span class="frac"><span>${top}</span><span>${bottom}</span></span>`;

export function startProbability() {
  const P = readParams({ stat: 'mean', pop: 'heights', mu: 100, sigma: 15, p: 0.52, ...MODE_DEFAULTS.mean, seed: 1, present: 0 });
  $('#controls').innerHTML = controlsMarkup();
  $('#panels').innerHTML = panelsMarkup();
  const chrome = initChrome('probability', P);
  const rng = new RNG(P.seed);

  const plots = {
    ind: new Plot($('#indCanvas'), { height: 170 }),
    mean: new Plot($('#meanCanvas'), { height: 190 }),
    sim: new Plot($('#simCanvas'), { height: 190 }),
  };

  let pop = null;
  let popBins = null;
  let sims = [];

  const isProp = () => P.stat === 'prop';
  const sym = () => (isProp() ? 'p̂' : 'x̄');

  function loadPop() {
    if (isProp()) {
      P.p = Math.min(0.99, Math.max(0.01, P.p));
      const sigma = Math.sqrt(P.p * (1 - P.p));
      pop = { mu: P.p, sigma, dp: 3, step: 1, shape: 'Binary' };
      popBins = null;
      return;
    }
    pop = P.pop === 'custom' ? makeNormal(P.mu, Math.max(1e-9, P.sigma)) : getPopulation(P.pop);
    if (pop.values) {
      const spec = S.binSpec(pop.axis[0], pop.axis[1], 60, pop.step);
      popBins = S.binCounts(pop.values, pop.axis[0], pop.axis[1], spec);
    } else popBins = null;
  }

  const se = () => pop.sigma / Math.sqrt(P.n);

  function axis() {
    if (!isProp()) return pop.axis;
    const s = se();
    return [Math.max(0, P.p - 5 * s), Math.min(1, P.p + 5 * s)];
  }

  function inEvent(v) {
    if (P.event === 'gt') return v > P.a;
    if (P.event === 'lt') return v < P.a;
    return v > Math.min(P.a, P.b) && v < Math.max(P.a, P.b);
  }

  function normalProb(mu, s) {
    const za = (P.a - mu) / s;
    if (P.event === 'gt') return 1 - S.normalCdf(za);
    if (P.event === 'lt') return S.normalCdf(za);
    const lo = Math.min(P.a, P.b), hi = Math.max(P.a, P.b);
    return S.normalCdf((hi - mu) / s) - S.normalCdf((lo - mu) / s);
  }

  function eventText(s) {
    const d = isProp() ? 3 : 2;
    if (P.event === 'gt') return `P(${s} > ${+P.a.toFixed(d)})`;
    if (P.event === 'lt') return `P(${s} < ${+P.a.toFixed(d)})`;
    return `P(${+Math.min(P.a, P.b).toFixed(d)} < ${s} < ${+Math.max(P.a, P.b).toFixed(d)})`;
  }

  function zEventText(za, zb) {
    if (P.event === 'gt') return `P(Z > ${za.toFixed(2)})`;
    if (P.event === 'lt') return `P(Z < ${za.toFixed(2)})`;
    return `P(${Math.min(za, zb).toFixed(2)} < Z < ${Math.max(za, zb).toFixed(2)})`;
  }

  // Shows the standardization arithmetic for one or two cut-offs.
  function zWork(mu, sdBottom, sdValue) {
    const cut = P.event === 'between' ? [Math.min(P.a, P.b), Math.max(P.a, P.b)] : [P.a];
    const d = isProp() ? 3 : 2;
    const lines = cut.map((c) => {
      const z = (c - mu) / sdValue;
      return `<span class="eq">z = ${frac(`${+c.toFixed(d)} − ${mu.toFixed(d)}`, sdBottom)} = ${frac((c - mu).toFixed(d + 1), sdValue.toFixed(d + 1))} = <strong>${z.toFixed(2)}</strong></span>`;
    });
    const zs = cut.map((c) => (c - mu) / sdValue);
    return { lines, zs };
  }

  // ---------- simulation ----------
  function simulate() {
    if (isProp()) {
      for (let i = 0; i < SIM_BATCH; i++) sims.push(rng.binomial(P.n, P.p) / P.n);
    } else {
      for (let i = 0; i < SIM_BATCH; i++) sims.push(S.mean(pop.sample(P.n, rng)));
    }
    renderSim();
  }

  function resetSim() {
    rng.reseed(P.seed);
    sims = [];
  }

  // ---------- rendering ----------
  function renderAll() {
    $('#meanPop').hidden = isProp();
    $('#propPop').hidden = !isProp();
    $('#customFields').hidden = P.pop !== 'custom';
    $('#bField').style.visibility = P.event === 'between' ? 'visible' : 'hidden';
    $('#indPanel').hidden = isProp();
    renderInd();
    renderMean();
    renderSim();
    renderWarn();
  }

  function drawCutoffs(pl) {
    const d = isProp() ? 3 : 2;
    pl.vline(P.a, { color: pl.col('theory'), width: 2, label: `a = ${+P.a.toFixed(d)}`, row: 1 });
    if (P.event === 'between') pl.vline(P.b, { color: pl.col('theory'), width: 2, label: `b = ${+P.b.toFixed(d)}`, row: 1 });
  }

  function shadeRange() {
    if (P.event === 'gt') return [P.a, Infinity];
    if (P.event === 'lt') return [-Infinity, P.a];
    return [Math.min(P.a, P.b), Math.max(P.a, P.b)];
  }

  function renderInd() {
    if (isProp()) return;
    const pl = plots.ind.begin();
    const [lo, hi] = axis();
    pl.setX(lo, hi);
    const pdf = (x) => S.normalPdf(x, pop.mu, pop.sigma);
    let ymax = pdf(pop.mu);
    let exactShare = null;
    if (popBins) {
      const dens = 1 / (pop.N * popBins.width);
      for (const b of popBins.bins) ymax = Math.max(ymax, b.count * dens);
      pl.setY(0, ymax * 1.15);
      pl.bars(popBins.bins, {
        fill: pl.col('pop-fill'), scale: dens,
        highlight: (b) => inEvent((b.x0 + b.x1) / 2), hlFill: pl.col('shade-bar'),
      });
      pl.curve(pdf, { color: pl.col('ink'), width: 1.5, dash: [5, 4] });
      let k = 0;
      for (const v of pop.values) if (inEvent(v)) k++;
      exactShare = k / pop.N;
    } else {
      pl.setY(0, ymax * 1.15);
      const [f0, f1] = shadeRange();
      pl.curve(pdf, { color: pl.col('pop'), width: 2.5, fill: pl.col('shade'), fillFrom: f0, fillTo: f1 });
    }
    pl.vline(pop.mu, { color: pl.col('ink'), dash: [5, 4], width: 1.5, label: `μ = ${pop.mu.toFixed(2)}` });
    drawCutoffs(pl);
    pl.xAxis({ label: pop.units || '' });

    const ev = eventText('X');
    const pNorm = normalProb(pop.mu, pop.sigma);
    $('#indTitle').textContent = `${ev}: one randomly chosen individual`;
    $('#indMeta').textContent = `X has mean μ = ${pop.mu.toFixed(2)}, SD σ = ${pop.sigma.toFixed(2)}`;
    const { lines, zs } = zWork(pop.mu, pop.sigma.toFixed(2), pop.sigma);
    $('#indWork').innerHTML = `${lines.join('<br>')}<br>
      Normal model: ${ev} = ${zEventText(zs[0], zs[1])} = <span class="big">${S.fmtP(pNorm)}</span>
      ${exactShare !== null ? `<br><span class="note">Actual share of this population: ${S.fmtP(exactShare)}${pop.shape === 'Normal' ? '' : ' — the normal model is wrong for individuals when the population is not normal.'}</span>` : ''}`;
  }

  function renderMean() {
    const pl = plots.mean.begin();
    const [lo, hi] = axis();
    pl.setX(lo, hi);
    const s = se();
    const pdf = (x) => S.normalPdf(x, pop.mu, s);
    pl.setY(0, pdf(pop.mu) * 1.15);
    const [f0, f1] = shadeRange();
    pl.curve(pdf, { color: pl.col('stat'), width: 2.5, fill: pl.col('shade'), fillFrom: f0, fillTo: f1 });
    const par = isProp() ? `p = ${P.p.toFixed(2)}` : `μ = ${pop.mu.toFixed(2)}`;
    pl.vline(pop.mu, { color: pl.col('ink'), dash: [5, 4], width: 1.5, label: par });
    drawCutoffs(pl);
    pl.xAxis({ label: isProp() ? 'p̂' : `x̄ ${pop.units ? `(${pop.units})` : ''}` });

    const ev = eventText(sym());
    const pNorm = normalProb(pop.mu, s);
    $('#meanChip').textContent = isProp() ? 'Proportion in a sample' : 'Average of n';
    $('#meanTitle').textContent = isProp()
      ? `${ev}: the proportion in a sample of n = ${S.fmtInt(P.n)}`
      : `${ev}: the average of n = ${S.fmtInt(P.n)} individuals`;
    let sdLine, sdBottom;
    if (isProp()) {
      sdLine = `σ<sub>p̂</sub> = √(p(1−p)/n) = √(${P.p.toFixed(2)}·${(1 - P.p).toFixed(2)}/${P.n}) = ${s.toFixed(4)}`;
      sdBottom = `√(p(1−p)/n)`;
      $('#meanMeta').textContent = `p̂ ≈ Normal(mean p = ${P.p.toFixed(3)}, SD ${s.toFixed(4)})`;
    } else {
      sdLine = `σ<sub>x̄</sub> = σ/√n = ${pop.sigma.toFixed(2)}/√${P.n} = ${s.toFixed(3)}`;
      sdBottom = `${pop.sigma.toFixed(2)}/√${P.n}`;
      $('#meanMeta').textContent = `x̄ ≈ Normal(mean μ = ${pop.mu.toFixed(2)}, SD σ/√n = ${s.toFixed(3)})`;
    }
    const { lines, zs } = zWork(pop.mu, sdBottom, s);
    $('#meanWork').innerHTML = `${sdLine}<br>${lines.join('<br>')}<br>
      ${ev} ≈ ${zEventText(zs[0], zs[1])} = <span class="big" style="color:var(--stat)">${S.fmtP(pNorm)}</span>`;
  }

  function renderSim() {
    const pl = plots.sim.begin();
    const [lo, hi] = axis();
    pl.setX(lo, hi);
    const lattice = isProp() ? 1 / P.n : pop.step ? pop.step / P.n : null;
    const spec = S.binSpec(lo, hi, isProp() ? 60 : 90, lattice);
    const { bins, width } = S.binCounts(sims, lo, hi, spec);
    const k = sims.length;
    const s = se();
    const scale = k * width;
    let ymax = 1;
    for (const b of bins) ymax = Math.max(ymax, b.count);
    if (k) ymax = Math.max(ymax, scale * S.normalPdf(0, 0, s));
    pl.setY(0, ymax * 1.15);
    if (k) pl.yAxis({ format: (v) => S.fmtInt(v) });
    pl.bars(bins, {
      fill: pl.col('stat-fill'),
      highlight: (b) => inEvent((b.x0 + b.x1) / 2), hlFill: pl.col('shade-bar'),
    });
    if (k) pl.curve((x) => scale * S.normalPdf(x, pop.mu, s), { color: pl.col('theory'), width: 2 });
    drawCutoffs(pl);
    pl.xAxis({ label: isProp() ? 'p̂' : 'x̄' });
    $('#simMeta').textContent = k ? `${S.fmtInt(k)} simulated samples of n = ${S.fmtInt(P.n)}` : '';
    if (!k) {
      pl.message('Press “Simulate” (S) to draw real samples');
      $('#simOut').innerHTML = '';
      return;
    }
    let hits = 0;
    for (const v of sims) if (inEvent(v)) hits++;
    $('#simOut').innerHTML = `${S.fmtInt(hits)} of ${S.fmtInt(k)} simulated ${sym()}'s satisfy the event →
      <span class="big" style="color:var(--theory)">${S.fmtP(hits / k)}</span>
      <span class="note">(normal model: ${S.fmtP(normalProb(pop.mu, s))})</span>`;
  }

  function renderWarn() {
    let msg;
    if (isProp()) {
      const a = P.n * P.p, b = P.n * (1 - P.p);
      msg = a >= 10 && b >= 10
        ? `np = ${a.toFixed(1)} and n(1−p) = ${b.toFixed(1)} are both at least 10, so the normal model for p̂ should be good.`
        : `<strong>Caution:</strong> np = ${a.toFixed(1)}, n(1−p) = ${b.toFixed(1)}. With fewer than 10 expected successes or failures, the normal model for p̂ can be noticeably off. Compare with the simulation.`;
      msg += ' Because p̂ can only be a multiple of 1/n, “>” and “≥” can give different answers for small n.';
    } else if (pop.shape === 'Normal') {
      msg = 'The population is normal, so x̄ is exactly normal for every n.';
    } else if (P.n >= 30) {
      msg = `The population is not normal (${pop.shape.toLowerCase()}), but n ≥ 30, so the Central Limit Theorem says x̄ is approximately normal. Check the simulation, though: strong skew needs larger n.`;
    } else {
      msg = `<strong>Caution:</strong> the population is not normal (${pop.shape.toLowerCase()}) and n < 30, so the normal model for x̄ may be off. Compare with the simulation.`;
    }
    $('#warn').innerHTML = msg;
  }

  // ---------- controls ----------
  setOptions($('#popSelect'),
    [...POPULATION_LIST.map((x) => [x.id, `${x.name} — ${x.shape}`]), ['custom', 'Normal with my own μ and σ']], P.pop);
  $('#statSelect').value = P.stat;
  $('#muInput').value = P.mu;
  $('#sigmaInput').value = P.sigma;
  $('#pInput').value = P.p;

  function syncInputs() {
    $('#nInput').value = P.n;
    $('#eventSelect').value = P.event;
    $('#aInput').value = +P.a.toFixed(4);
    $('#bInput').value = +P.b.toFixed(4);
  }

  function popChanged() {
    saveParams(P);
    loadPop();
    resetSim();
    renderAll();
  }

  function cutChanged() {
    syncInputs();
    saveParams(P);
    renderAll();
  }

  $('#statSelect').addEventListener('change', (e) => {
    P.stat = e.target.value;
    Object.assign(P, MODE_DEFAULTS[P.stat]);
    syncInputs();
    popChanged();
  });
  $('#popSelect').addEventListener('change', (e) => {
    P.pop = e.target.value;
    loadPop();
    // move the cut-off to a sensible spot for the new population: one SD above the mean
    P.a = +(pop.mu + pop.sigma).toFixed(1);
    P.b = +(pop.mu + 2 * pop.sigma).toFixed(1);
    syncInputs();
    popChanged();
  });
  for (const [id, key] of [['muInput', 'mu'], ['sigmaInput', 'sigma'], ['pInput', 'p']]) {
    $('#' + id).addEventListener('change', (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v)) P[key] = v;
      popChanged();
    });
  }
  $('#nInput').addEventListener('change', (e) => {
    P.n = Math.max(1, Math.min(5000, Math.round(+e.target.value) || 1));
    syncInputs();
    popChanged();
  });
  $('#eventSelect').addEventListener('change', (e) => { P.event = e.target.value; cutChanged(); });
  $('#aInput').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) P.a = v; cutChanged(); });
  $('#bInput').addEventListener('change', (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) P.b = v; cutChanged(); });
  $('#btnSim').addEventListener('click', simulate);

  // click / drag on a plot to move the cut-off
  function cutStep() {
    const [lo, hi] = axis();
    return Math.pow(10, Math.floor(Math.log10(hi - lo)) - 2);
  }
  for (const plot of Object.values(plots)) {
    const c = plot.c;
    let dragging = null;
    const setFrom = (e) => {
      const r = c.getBoundingClientRect();
      const step = cutStep();
      const x = Math.round(plot.invX(e.clientX - r.left) / step) * step;
      if (!dragging) {
        dragging = P.event === 'between' && Math.abs(x - P.b) < Math.abs(x - P.a) ? 'b' : 'a';
      }
      P[dragging] = +x.toFixed(6);
      cutChanged();
    };
    c.style.cursor = 'ew-resize';
    c.addEventListener('pointerdown', (e) => { dragging = null; c.setPointerCapture(e.pointerId); setFrom(e); });
    c.addEventListener('pointermove', (e) => { if (c.hasPointerCapture(e.pointerId)) setFrom(e); });
    c.addEventListener('pointerup', (e) => { dragging = null; c.releasePointerCapture(e.pointerId); });
  }

  bindKeys({
    s: simulate,
    arrowleft: () => { P.a = +(P.a - cutStep()).toFixed(6); cutChanged(); },
    arrowright: () => { P.a = +(P.a + cutStep()).toFixed(6); cutChanged(); },
    f: () => chrome.togglePresenter(),
  });
  onLayoutChange(renderAll);

  syncInputs();
  loadPop();
  renderAll();
}
