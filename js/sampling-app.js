// Tools 2 and 4: build a sampling distribution one sample at a time.
// mode 'mean' — quantitative populations; statistic x̄ (or median / max for contrast)
// mode 'prop' — a bead urn with proportion p; statistic p̂
// Both share everything else: p̂ is just x̄ of 0/1 data.

import { RNG } from './rng.js';
import * as S from './stats.js';
import { Plot } from './plot.js';
import { POPULATION_LIST, getPopulation, makeUrn, PROP_PRESETS } from './populations.js';
import { $, readParams, saveParams, initChrome, bindKeys, onLayoutChange, tween, SPEEDS, setOptions } from './ui.js';

const STATS = {
  mean: { sym: 'x̄', label: 'Sample mean x̄', fn: S.mean },
  median: { sym: 'median', label: 'Sample median', fn: S.median },
  max: { sym: 'max', label: 'Sample maximum', fn: S.max },
  prop: { sym: 'p̂', label: 'Sample proportion p̂', fn: S.mean },
};

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function controlsMarkup(isProp) {
  const popCard = isProp
    ? `<div class="card"><h3>Population</h3>
        <label class="field">Scenario <select id="presetSelect"></select></label>
        <label class="field">Population proportion p = <strong id="pLabel"></strong>
          <input type="range" id="pSlider" min="0.01" max="0.99" step="0.01"></label>
        <p class="note" id="popNote"></p></div>`
    : `<div class="card"><h3>Population</h3>
        <label class="field">Population <select id="popSelect"></select></label>
        <p class="note" id="popNote"></p></div>`;
  return `
    ${popCard}
    <div class="card"><h3>Sample</h3>
      <label class="field">Sample size n <input type="number" id="nInput" min="1" max="${isProp ? 5000 : 2000}" step="1"></label>
      <input type="range" id="nSlider" min="1" max="${isProp ? 1000 : 100}" step="1" style="margin-top:8px">
      <div class="quick" id="nQuick"></div>
      ${isProp ? '' : `<label class="field" style="margin-top:10px">Statistic
        <select id="statSelect">
          <option value="mean">Sample mean x̄</option>
          <option value="median">Sample median</option>
          <option value="max">Sample maximum</option>
        </select></label>`}
    </div>
    <div class="card"><h3>Draw samples</h3>
      <div class="btn-grid">
        <button type="button" class="primary wide" id="btnDraw1">Draw 1 sample</button>
        <button type="button" id="btnDraw10">Draw 10</button>
        <button type="button" id="btnDraw1000">Draw 1,000</button>
        <button type="button" id="btnPlay">▶ Play</button>
        <button type="button" id="btnReset">Reset</button>
      </div>
      <label class="field" style="margin-top:10px">Animation
        <select id="speedSelect">
          <option value="slow">Slow</option><option value="normal">Normal</option>
          <option value="fast">Fast</option><option value="instant">Off</option>
        </select></label>
    </div>
    <div class="card"><h3>Display</h3>
      <label class="check"><input type="checkbox" id="overlayToggle"> Normal curve predicted by theory</label>
      <label class="check"><input type="checkbox" id="zoomToggle"> Zoom in on the sampling distribution</label>
      <label class="check"><input type="checkbox" id="compareToggle"> Compare three sample sizes</label>
    </div>
    ${isProp ? `<div class="card"><h3>Is p̂ approximately normal?</h3><div id="conditions"></div></div>` : ''}
    <div class="card"><h3>Predict first</h3>
      <label class="field"><span id="predictLabel"></span><input type="number" step="any" id="predictInput"></label>
      <button type="button" id="btnPredict" style="margin-top:8px;width:100%">Check my prediction</button>
      <div class="note" id="predictOut"></div>
    </div>
    <div class="card hide-present"><h3>Random seed</h3>
      <input type="number" id="seedInput" min="1" step="1">
      <p class="note">Same seed + same clicks = same samples.</p>
    </div>
    <div class="card keys hide-present">
      <kbd>Space</kbd> draw 1 · <kbd>T</kbd> draw 10 · <kbd>K</kbd> draw 1,000 · <kbd>P</kbd> play/pause ·
      <kbd>R</kbd> reset · <kbd>O</kbd> normal curve · <kbd>Z</kbd> zoom · <kbd>C</kbd> compare · <kbd>F</kbd> presenter mode
    </div>`;
}

function panelsMarkup() {
  return `
    <div class="panel">
      <div class="panel-head"><span class="chip pop">Population</span><h2 id="popTitle"></h2><span class="meta" id="popMeta"></span></div>
      <canvas id="popCanvas"></canvas>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="chip sample">One sample</span><h2 id="sampleTitle"></h2><span class="meta" id="sampleMeta"></span></div>
      <canvas id="sampleCanvas"></canvas>
    </div>
    <div class="panel">
      <div class="panel-head"><span class="chip stat">Sampling distribution</span><h2 id="distTitle"></h2><span class="meta" id="distMeta"></span></div>
      <canvas id="distCanvas"></canvas>
    </div>
    <div class="panel" id="comparePanel" hidden>
      <div class="panel-head"><span class="chip stat">Compare</span><h2>Same population, three sample sizes</h2>
        <span class="meta">n values <input type="text" id="cmpInput" style="width:8em;display:inline-block">
        <button type="button" id="btnCompare">Re-run</button></span></div>
      <canvas id="cmp0"></canvas><canvas id="cmp1"></canvas><canvas id="cmp2"></canvas>
      <p class="note">Each row is 5,000 samples. The axes are shared, so a narrower distribution has to stand taller.</p>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Theory vs. simulation</h2></div>
      <div id="readout"></div>
    </div>`;
}

export function startSamplingApp(mode) {
  const isProp = mode === 'prop';
  const P = readParams(isProp
    ? { preset: 'custom', p: 0.3, n: 25, seed: 1, speed: 'normal', overlay: 0, zoom: 0, compare: 0, cmp: '10,50,200', present: 0 }
    : { pop: 'heights', stat: 'mean', n: 5, seed: 1, speed: 'normal', overlay: 0, zoom: 0, compare: 0, cmp: '2,10,30', present: 0 });

  $('#controls').innerHTML = controlsMarkup(isProp);
  $('#panels').innerHTML = panelsMarkup();
  const chrome = initChrome(isProp ? 'proportion' : 'sampling', P);

  const rng = new RNG(P.seed);
  const cmpRng = new RNG(P.seed + 99991);
  const plots = {
    pop: new Plot($('#popCanvas'), { height: isProp ? 130 : 170 }),
    sample: new Plot($('#sampleCanvas'), { height: isProp ? 130 : 160 }),
    dist: new Plot($('#distCanvas'), { height: 250 }),
    cmp: [0, 1, 2].map((i) => new Plot($('#cmp' + i), { height: 125, margin: { t: 22, b: i === 2 ? 36 : 14 } })),
  };

  let pop = null;
  let popBins = null;
  let stats = [];
  let current = null;
  let currentStat = NaN;
  let reveal = 0;
  let showStat = false;
  let fall = null;
  let anim = null;
  let playing = false;
  let cmpData = null;

  const statKey = () => (isProp ? 'prop' : P.stat);
  const ST = () => STATS[statKey()];

  // ---------- model ----------
  function loadPop() {
    if (isProp) {
      const pre = PROP_PRESETS.find((x) => x.id === P.preset) || PROP_PRESETS[0];
      P.p = Math.min(0.99, Math.max(0.01, P.p));
      pop = makeUrn(P.p, pre.success);
    } else {
      pop = getPopulation(P.pop);
      P.pop = pop.id;
      const spec = S.binSpec(pop.axis[0], pop.axis[1], 60, pop.step);
      popBins = S.binCounts(pop.values, pop.axis[0], pop.axis[1], spec);
    }
  }

  function theoryFor(n) {
    const k = statKey();
    if (k !== 'mean' && k !== 'prop') return null;
    return { center: pop.mu, se: pop.sigma / Math.sqrt(n), skew: pop.skew / Math.sqrt(n) };
  }

  function latticeFor(n) {
    if (!pop.step) return null;
    const k = statKey();
    if (k === 'mean' || k === 'prop') return pop.step / n;
    if (k === 'median') return n % 2 ? pop.step : pop.step / 2;
    return pop.step;
  }

  function parameter() {
    switch (statKey()) {
      case 'median': return { name: 'population median', value: pop.median };
      case 'max': return { name: 'population max', value: pop.max };
      case 'prop': return { name: 'p', value: pop.p };
      default: return { name: 'μ', value: pop.mu };
    }
  }

  function distAxis(n) {
    const base = pop.axis;
    if (!P.zoom) return base;
    const th = theoryFor(n);
    let lo, hi;
    if (th && th.se > 0) {
      lo = th.center - 4.5 * th.se;
      hi = th.center + 4.5 * th.se;
    } else if (stats.length > 1) {
      lo = S.min(stats);
      hi = S.max(stats);
      const pad = (hi - lo) * 0.2 || 1;
      lo -= pad;
      hi += pad;
    } else return base;
    return [Math.max(base[0], lo), Math.min(base[1], hi)];
  }

  // ---------- drawing samples ----------
  function cancel() {
    if (anim) {
      anim.cancelled = true;
      if (anim.pending !== null) stats.push(anim.pending);
      anim = null;
    }
    fall = null;
    if (current) {
      reveal = current.length;
      showStat = true;
    }
    if (playing) {
      playing = false;
      updatePlayButton();
    }
  }

  function drawInstant(count) {
    const fn = ST().fn;
    for (let i = 0; i < count; i++) {
      current = pop.sample(P.n, rng);
      currentStat = fn(current);
      stats.push(currentStat);
    }
    reveal = current.length;
    showStat = true;
  }

  async function animateOne(token, f) {
    const sp = SPEEDS[P.speed] * f;
    const s = pop.sample(P.n, rng);
    const st = ST().fn(s);
    current = s;
    currentStat = st;
    if (sp === 0) {
      stats.push(st);
      reveal = s.length;
      showStat = true;
      renderAll();
      await nextFrame();
      return;
    }
    token.pending = st;
    reveal = 0;
    showStat = false;
    renderSampleMeta();
    await tween(token, Math.min(900, 25 * s.length) * sp, (u) => {
      reveal = Math.ceil(u * s.length);
      renderSample();
    });
    if (token.cancelled) return;
    showStat = true;
    renderSample();
    renderSampleMeta();
    await tween(token, 320 * sp, () => {});
    if (token.cancelled) return;
    fall = { x: st, u: 0 };
    await tween(token, 520 * sp, (u) => {
      if (fall) fall.u = u;
      renderDist();
    });
    if (token.cancelled) return;
    fall = null;
    token.pending = null;
    stats.push(st);
    renderDist();
    renderReadout();
  }

  async function draw(count) {
    cancel();
    if (count >= 100 || SPEEDS[P.speed] === 0) {
      drawInstant(count);
      renderAll();
      return;
    }
    const token = { cancelled: false, pending: null };
    anim = token;
    for (let i = 0; i < count && !token.cancelled; i++) await animateOne(token, count > 1 ? 0.3 : 1);
    if (anim === token) anim = null;
  }

  async function togglePlay() {
    if (playing) {
      cancel();
      renderAll();
      return;
    }
    cancel();
    playing = true;
    updatePlayButton();
    const token = { cancelled: false, pending: null };
    anim = token;
    while (!token.cancelled) await animateOne(token, 0.45);
  }

  function updatePlayButton() {
    $('#btnPlay').textContent = playing ? '❚❚ Pause' : '▶ Play';
  }

  function reset() {
    cancel();
    rng.reseed(P.seed);
    stats = [];
    current = null;
    currentStat = NaN;
    reveal = 0;
    showStat = false;
    $('#predictOut').textContent = '';
    if (P.compare) runCompare();
    renderAll();
  }

  // ---------- comparison ----------
  function compareNs() {
    return P.cmp.split(/[\s,]+/).map(Number).filter((v) => Number.isInteger(v) && v > 0)
      .map((v) => Math.min(v, 5000)).slice(0, 3);
  }

  function runCompare() {
    cmpRng.reseed(P.seed + 99991);
    const fn = ST().fn;
    cmpData = compareNs().map((n) => {
      const reps = n > 1000 ? 2000 : 5000;
      const vals = new Array(reps);
      for (let i = 0; i < reps; i++) vals[i] = fn(pop.sample(n, cmpRng));
      return { n, vals };
    });
  }

  // ---------- rendering ----------
  function renderAll() {
    renderPop();
    renderSample();
    renderSampleMeta();
    renderDist();
    renderCompare();
    renderReadout();
    renderConditions();
    renderPredictLabel();
  }

  function renderPop() {
    const pl = plots.pop.begin();
    if (isProp) {
      $('#popTitle').textContent = `Proportion p of ${pop.successLabel}`;
      $('#popMeta').innerHTML = `p = ${pop.p.toFixed(2)} · σ = √(p(1−p)) = ${pop.sigma.toFixed(3)}`;
      drawUrn(pl);
      return;
    }
    $('#popTitle').textContent = `${pop.name} (${pop.units})`;
    $('#popMeta').textContent = `μ = ${pop.mu.toFixed(pop.dp)} · σ = ${pop.sigma.toFixed(pop.dp)} · N = ${S.fmtInt(pop.N)} · ${pop.shape}`;
    pl.setX(...pop.axis);
    const peak = Math.max(...popBins.bins.map((b) => b.count));
    pl.setY(0, peak * 1.18);
    pl.bars(popBins.bins, { fill: pl.col('pop-fill') });
    // μ ± σ bracket
    const y = pl.sy(peak * 1.06);
    const a = pl.sx(Math.max(pl.x0, pop.mu - pop.sigma)), b = pl.sx(Math.min(pl.x1, pop.mu + pop.sigma));
    const ctx = pl.ctx;
    ctx.strokeStyle = pl.col('pop');
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(a, y); ctx.lineTo(b, y);
    ctx.moveTo(a, y - 4); ctx.lineTo(a, y + 4);
    ctx.moveTo(b, y - 4); ctx.lineTo(b, y + 4);
    ctx.stroke();
    pl.text('±σ', b + 4, y + pl.font * 0.35, { color: pl.col('pop'), weight: 600 });
    pl.vline(pop.mu, { color: pl.col('ink'), dash: [5, 4], width: 1.5, label: `μ = ${pop.mu.toFixed(pop.dp)}` });
    pl.xAxis({ label: pop.units });
  }

  function beadGrid(pl, n, x0, y0, w, h) {
    const cell = Math.sqrt((w * h) / n);
    let cols = Math.max(1, Math.floor(w / cell));
    let rows = Math.ceil(n / cols);
    while (rows * (w / cols) > h && cols < n) {
      cols++;
      rows = Math.ceil(n / cols);
    }
    const size = Math.min(w / cols, h / rows);
    const r = Math.min(9 * pl.scale, size * 0.42);
    return { cols, size, r, x0: x0 + (w - cols * size) / 2, y0 };
  }

  function drawUrn(pl) {
    const total = 200;
    const succ = Math.round(pop.p * total);
    // fixed shuffle so beads do not jump around as p changes
    const order = [...Array(total).keys()];
    const r0 = new RNG(424242);
    for (let i = total - 1; i > 0; i--) {
      const j = r0.int(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const rank = new Array(total);
    order.forEach((v, i) => (rank[v] = i));
    const g = beadGrid(pl, total, 10, 8, pl.W - 20, pl.H - 16);
    for (let i = 0; i < total; i++) {
      const cx = g.x0 + (i % g.cols + 0.5) * g.size;
      const cy = g.y0 + (Math.floor(i / g.cols) + 0.5) * g.size;
      pl.circle(cx, cy, g.r, rank[i] < succ ? pl.col('pop') : pl.col('bead-off'));
    }
  }

  function renderSample() {
    const pl = plots.sample.begin();
    $('#sampleTitle').textContent = `One random sample of n = ${S.fmtInt(P.n)}`;
    if (isProp) return renderPropSample(pl);
    pl.setX(...pop.axis);
    if (!current) {
      pl.xAxis({ label: pop.units });
      pl.message('Draw a sample (Space) to see it here');
      return;
    }
    const shown = current.slice(0, reveal);
    let ok = false;
    if (P.n <= 150) ok = pl.dotStack(shown.map((x) => ({ x, color: pl.col('sample-fill') })), { rMax: 6, rMin: 2 });
    if (!ok) {
      const spec = S.binSpec(pop.axis[0], pop.axis[1], 60, pop.step);
      const { bins } = S.binCounts(shown, pop.axis[0], pop.axis[1], spec);
      pl.setY(0, Math.max(1, ...bins.map((b) => b.count)) * 1.15);
      pl.bars(bins, { fill: pl.col('sample-fill') });
    }
    pl.vline(pop.mu, { color: pl.col('ink'), dash: [5, 4], width: 1.5, label: 'μ' });
    if (showStat) {
      pl.vline(currentStat, {
        color: pl.col('stat'), width: 2.5, row: 1,
        label: `${ST().sym} = ${currentStat.toFixed(pop.dp)}`,
      });
    }
    pl.xAxis({ label: pop.units });
  }

  function renderPropSample(pl) {
    if (!current) {
      pl.message('Draw a sample (Space) to see it here');
      return;
    }
    const n = current.length;
    const shown = Math.min(reveal, n);
    const g = beadGrid(pl, n, 10, 8, pl.W - 20, pl.H - 16);
    if (g.r >= 1.6) {
      for (let i = 0; i < shown; i++) {
        const cx = g.x0 + (i % g.cols + 0.5) * g.size;
        const cy = g.y0 + (Math.floor(i / g.cols) + 0.5) * g.size;
        pl.circle(cx, cy, g.r, current[i] ? pl.col('sample') : pl.col('bead-off'));
      }
      return;
    }
    // too many beads to draw individually: a single proportion bar
    let k = 0;
    for (let i = 0; i < shown; i++) k += current[i];
    const x0 = 20, x1 = pl.W - 20, y = pl.H / 2 - 14;
    const ctx = pl.ctx;
    ctx.fillStyle = pl.col('bead-off');
    ctx.fillRect(x0, y, ((x1 - x0) * shown) / n, 28);
    ctx.fillStyle = pl.col('sample');
    ctx.fillRect(x0, y, ((x1 - x0) * k) / n, 28);
    ctx.strokeStyle = pl.col('axis');
    ctx.strokeRect(x0 + 0.5, y + 0.5, x1 - x0, 28);
    const px = x0 + (x1 - x0) * pop.p;
    ctx.strokeStyle = pl.col('ink');
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(px, y - 8); ctx.lineTo(px, y + 36); ctx.stroke();
    ctx.setLineDash([]);
    pl.text('p', px, y - 11, { align: 'center', weight: 600 });
  }

  function renderSampleMeta() {
    const el = $('#sampleMeta');
    if (!current || !showStat) {
      el.textContent = '';
      return;
    }
    if (isProp) {
      const k = current.reduce((a, b) => a + b, 0);
      el.innerHTML = `${S.fmtInt(k)} of ${S.fmtInt(current.length)} are ${pop.successLabel} → <strong style="color:var(--stat)">p̂ = ${currentStat.toFixed(3)}</strong>`;
    } else {
      el.innerHTML = `<strong style="color:var(--stat)">${ST().sym} = ${currentStat.toFixed(pop.dp)}</strong>` +
        (current.length > 1 ? ` · sample SD s = ${S.sd(current, 1).toFixed(pop.dp)}` : '');
    }
  }

  function renderDist() {
    const pl = plots.dist.begin();
    const n = P.n;
    const st = ST();
    $('#distTitle').textContent = `Sampling distribution of ${st.sym} (n = ${S.fmtInt(n)})`;
    $('#distMeta').textContent = `${S.fmtInt(stats.length)} sample${stats.length === 1 ? '' : 's'}`;
    const [lo, hi] = distAxis(n);
    pl.setX(lo, hi);
    const target = P.zoom ? 45 : isProp ? 100 : 120;
    const spec = S.binSpec(lo, hi, target, latticeFor(n));
    const { bins, width } = S.binCounts(stats, lo, hi, spec);
    const total = stats.length;
    let fallBin = null;
    if (fall) fallBin = bins.find((b) => fall.x >= b.x0 && fall.x < b.x1) || null;
    let peak = 0;
    for (const b of bins) peak = Math.max(peak, b.count + (b === fallBin ? 1 : 0));
    const th = theoryFor(n);
    const showCurve = P.overlay && th && th.se > 0;
    const curveScale = total > 0 ? total * width : 1;
    const curvePeak = showCurve ? curveScale * S.normalPdf(0, 0, th.se) : 0;
    if (total === 0 && !showCurve) peak = 1;
    pl.setY(0, Math.max(peak, curvePeak) * 1.15 || 1);
    if (total > 0) pl.yAxis({ format: (v) => S.fmtInt(v) });
    pl.bars(bins, { fill: pl.col('stat-fill') });
    if (showCurve) {
      pl.curve((x) => curveScale * S.normalPdf(x, th.center, th.se), { color: pl.col('theory'), width: 2.5 });
    }
    const par = parameter();
    pl.vline(par.value, { color: pl.col('ink'), dash: [5, 4], width: 1.5, label: `${par.name} = ${par.value.toFixed(pop.dp)}` });
    if (total > 0) {
      pl.vline(S.mean(stats), { color: pl.col('stat'), width: 2, row: 1, label: `mean of ${st.sym}'s = ${S.mean(stats).toFixed(pop.dp)}` });
    }
    if (fall) {
      const r = 6 * pl.scale;
      const yEnd = pl.sy(fallBin ? fallBin.count : 0) - r;
      const y = pl.top + (yEnd - pl.top) * fall.u * fall.u;
      pl.circle(pl.sx(fall.x), y, r, pl.col('stat'), pl.col('ink'));
    }
    pl.xAxis({ label: isProp ? 'p̂' : `${st.sym} (${pop.units})` });
    if (total === 0) pl.message(showCurve ? 'Theory predicts this shape. Now draw samples.' : 'Each sample adds one value here.');
  }

  function renderCompare() {
    $('#comparePanel').hidden = !P.compare;
    if (!P.compare) return;
    if (!cmpData) runCompare();
    let [lo, hi] = pop.axis;
    const widest = cmpData.length ? theoryFor(Math.min(...cmpData.map((d) => d.n))) : null;
    if (P.zoom && widest && widest.se > 0) {
      lo = Math.max(lo, widest.center - 4.5 * widest.se);
      hi = Math.min(hi, widest.center + 4.5 * widest.se);
    }
    const rows = cmpData.map(({ n, vals }) => {
      const spec = S.binSpec(lo, hi, isProp ? 100 : 120, latticeFor(n));
      const { bins, width } = S.binCounts(vals, lo, hi, spec);
      return { n, vals, bins, width, th: theoryFor(n) };
    });
    let ymax = 0;
    for (const r of rows) {
      for (const b of r.bins) ymax = Math.max(ymax, b.count / (r.vals.length * r.width));
      if (P.overlay && r.th && r.th.se > 0) ymax = Math.max(ymax, S.normalPdf(0, 0, r.th.se));
    }
    plots.cmp.forEach((plot, i) => {
      const r = rows[i];
      const canvas = $('#cmp' + i);
      canvas.hidden = !r;
      if (!r) return;
      const pl = plot.begin();
      pl.setX(lo, hi).setY(0, ymax * 1.1);
      pl.bars(r.bins, { fill: pl.col('stat-fill'), scale: 1 / (r.vals.length * r.width) });
      if (P.overlay && r.th && r.th.se > 0) {
        pl.curve((x) => S.normalPdf(x, r.th.center, r.th.se), { color: pl.col('theory'), width: 2 });
      }
      const par = parameter();
      pl.vline(par.value, { color: pl.col('ink'), dash: [5, 4], width: 1.2 });
      const sdTxt = `SD of ${ST().sym}'s = ${S.sd(r.vals).toFixed(pop.dp + 1)}` +
        (r.th ? `  (${isProp ? '√(p(1−p)/n)' : 'σ/√n'} = ${r.th.se.toFixed(pop.dp + 1)})` : '');
      pl.text(`n = ${S.fmtInt(r.n)}`, pl.left, pl.top - 6, { weight: 700 });
      pl.text(sdTxt, pl.left + pl.font * 5, pl.top - 6, { color: pl.col('muted') });
      if (i === rows.length - 1) pl.xAxis({ label: isProp ? 'p̂' : pop.units });
    });
  }

  function renderReadout() {
    const n = P.n;
    const st = ST();
    const k = stats.length;
    const dp = pop.dp + 1;
    const simMean = k ? S.mean(stats) : NaN;
    const simSD = k > 1 ? S.sd(stats) : NaN;
    const simSkew = k > 2 ? S.skewness(stats) : NaN;
    const th = theoryFor(n);
    let rows;
    if (th && isProp) {
      rows = `
        <tr><td>Center</td><td class="theory">μ<sub>p̂</sub> = p = ${pop.p.toFixed(3)}</td><td class="sim">${S.fmt(simMean, 3)}</td></tr>
        <tr><td>Spread</td><td class="theory">σ<sub>p̂</sub> = √(p(1−p)/n) = √(${pop.p.toFixed(2)}·${(1 - pop.p).toFixed(2)}/${n}) = ${th.se.toFixed(4)}</td><td class="sim">${S.fmt(simSD, 4)}</td></tr>
        <tr><td>Skewness <span class="note">(0 = symmetric)</span></td><td class="theory">(1−2p)/√(np(1−p)) = ${th.skew.toFixed(3)}</td><td class="sim">${S.fmt(simSkew, 3)}</td></tr>`;
    } else if (th) {
      rows = `
        <tr><td>Center</td><td class="theory">μ<sub>x̄</sub> = μ = ${pop.mu.toFixed(dp)}</td><td class="sim">${S.fmt(simMean, dp)}</td></tr>
        <tr><td>Spread</td><td class="theory">σ<sub>x̄</sub> = σ/√n = ${pop.sigma.toFixed(pop.dp)}/√${n} = ${th.se.toFixed(dp)}</td><td class="sim">${S.fmt(simSD, dp)}</td></tr>
        <tr><td>Skewness <span class="note">(0 = symmetric)</span></td><td class="theory">(population skew)/√n = ${th.skew.toFixed(3)}</td><td class="sim">${S.fmt(simSkew, 3)}</td></tr>`;
    } else {
      const par = parameter();
      rows = `
        <tr><td>Center</td><td class="theory">${par.name} = ${par.value.toFixed(dp)}</td><td class="sim">${S.fmt(simMean, dp)}</td></tr>
        <tr><td>Average error (bias)</td><td class="theory">—</td><td class="sim">${k ? (simMean - par.value >= 0 ? '+' : '−') + Math.abs(simMean - par.value).toFixed(dp) : '—'}</td></tr>
        <tr><td>Spread</td><td class="theory">no simple formula<br><span class="note">(x̄ would have σ/√n = ${(pop.sigma / Math.sqrt(n)).toFixed(dp)})</span></td><td class="sim">${S.fmt(simSD, dp)}</td></tr>
        <tr><td>Skewness</td><td class="theory">—</td><td class="sim">${S.fmt(simSkew, 3)}</td></tr>`;
    }
    $('#readout').innerHTML = `
      <table class="readout">
        <thead><tr><th>${st.label}, n = ${S.fmtInt(n)}</th><th>Theory</th><th>Simulation (${S.fmtInt(k)} samples)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function renderConditions() {
    if (!isProp) return;
    const n = P.n, p = pop.p;
    const a = n * p, b = n * (1 - p);
    const badge = (v) => `<span class="badge ${v >= 10 ? 'ok' : 'no'}">${v >= 10 ? '≥ 10 ✓' : '< 10 ✗'}</span>`;
    const ok = a >= 10 && b >= 10;
    $('#conditions').innerHTML = `
      <div>np = ${n}·${p.toFixed(2)} = <strong>${a.toFixed(1)}</strong> ${badge(a)}</div>
      <div style="margin-top:4px">n(1−p) = ${n}·${(1 - p).toFixed(2)} = <strong>${b.toFixed(1)}</strong> ${badge(b)}</div>
      <p class="note">${ok
        ? 'Both at least 10: expect an approximately normal sampling distribution.'
        : 'Too few expected successes or failures: expect skew and visible gaps. Try it.'}</p>`;
  }

  function renderPredictLabel() {
    $('#predictLabel').textContent = `Predict the SD of the ${ST().sym}'s when n = ${S.fmtInt(P.n)}:`;
  }

  function checkPrediction() {
    const guess = parseFloat($('#predictInput').value);
    const out = $('#predictOut');
    if (!Number.isFinite(guess)) {
      out.textContent = 'Type a number first.';
      return;
    }
    if (stats.length < 200) drawInstant(1000 - stats.length);
    const sim = S.sd(stats);
    const th = theoryFor(P.n);
    const dp = pop.dp + 1;
    out.innerHTML = `Your guess: <strong>${guess}</strong><br>Simulation (${S.fmtInt(stats.length)} samples): <strong>${sim.toFixed(dp)}</strong>` +
      (th ? `<br>Theory: <strong>${th.se.toFixed(dp)}</strong>` : '') +
      `<br>You were off by ${Math.abs(guess - sim).toFixed(dp)} (${Math.round((Math.abs(guess - sim) / sim) * 100)}%).`;
    renderAll();
  }

  // ---------- wire up controls ----------
  if (isProp) {
    setOptions($('#presetSelect'), PROP_PRESETS.map((x) => [x.id, x.label + (x.p ? ` (p = ${x.p})` : '')]), P.preset);
    $('#pSlider').value = P.p;
    $('#pLabel').textContent = P.p.toFixed(2);
    $('#presetSelect').addEventListener('change', (e) => {
      P.preset = e.target.value;
      const pre = PROP_PRESETS.find((x) => x.id === P.preset);
      if (pre.p) P.p = pre.p;
      $('#pSlider').value = P.p;
      $('#pLabel').textContent = P.p.toFixed(2);
      changed();
    });
    $('#pSlider').addEventListener('input', (e) => {
      P.p = +e.target.value;
      $('#pLabel').textContent = P.p.toFixed(2);
      const pre = PROP_PRESETS.find((x) => x.id === P.preset);
      if (pre && pre.p !== P.p) {
        P.preset = 'custom';
        $('#presetSelect').value = 'custom';
      }
      changed();
    });
  } else {
    setOptions($('#popSelect'), POPULATION_LIST.map((x) => [x.id, `${x.name} — ${x.shape}`]), P.pop);
    $('#statSelect').value = P.stat;
    $('#popSelect').addEventListener('change', (e) => { P.pop = e.target.value; changed(); });
    $('#statSelect').addEventListener('change', (e) => { P.stat = e.target.value; changed(); });
  }

  const QUICK = isProp ? [10, 25, 50, 100, 500, 1000] : [1, 2, 5, 10, 30, 100];
  $('#nQuick').innerHTML = QUICK.map((v) => `<button type="button" data-n="${v}">${v}</button>`).join('');
  $('#nQuick').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setN(+b.dataset.n);
  });
  $('#nSlider').addEventListener('input', (e) => setN(+e.target.value));
  $('#nInput').addEventListener('change', (e) => setN(+e.target.value));

  function setN(v) {
    const maxN = isProp ? 5000 : 2000;
    P.n = Math.max(1, Math.min(maxN, Math.round(v) || 1));
    syncN();
    saveParams(P);
    reset();
  }
  function syncN() {
    $('#nInput').value = P.n;
    $('#nSlider').value = Math.min(P.n, +$('#nSlider').max);
    for (const b of $('#nQuick').children) b.setAttribute('aria-pressed', +b.dataset.n === P.n ? 'true' : 'false');
  }

  $('#speedSelect').value = P.speed;
  $('#speedSelect').addEventListener('change', (e) => { P.speed = e.target.value; saveParams(P); });
  $('#seedInput').value = P.seed;
  $('#seedInput').addEventListener('change', (e) => {
    P.seed = Math.max(1, Math.floor(+e.target.value) || 1);
    e.target.value = P.seed;
    saveParams(P);
    reset();
  });

  const toggles = { overlayToggle: 'overlay', zoomToggle: 'zoom', compareToggle: 'compare' };
  for (const [id, key] of Object.entries(toggles)) {
    $('#' + id).checked = !!P[key];
    $('#' + id).addEventListener('change', (e) => flip(key, e.target.checked));
  }
  function flip(key, value = !P[key]) {
    P[key] = value ? 1 : 0;
    const id = Object.keys(toggles).find((k) => toggles[k] === key);
    $('#' + id).checked = !!P[key];
    saveParams(P);
    if (key === 'compare' && P.compare) runCompare();
    renderAll();
  }

  $('#cmpInput').value = P.cmp;
  $('#cmpInput').addEventListener('change', (e) => {
    P.cmp = e.target.value;
    saveParams(P);
    runCompare();
    renderCompare();
  });
  $('#btnCompare').addEventListener('click', () => { runCompare(); renderCompare(); });

  $('#btnDraw1').addEventListener('click', () => draw(1));
  $('#btnDraw10').addEventListener('click', () => draw(10));
  $('#btnDraw1000').addEventListener('click', () => draw(1000));
  $('#btnPlay').addEventListener('click', togglePlay);
  $('#btnReset').addEventListener('click', reset);
  $('#btnPredict').addEventListener('click', checkPrediction);

  bindKeys({
    space: () => draw(1),
    t: () => draw(10),
    k: () => draw(1000),
    p: togglePlay,
    r: reset,
    o: () => flip('overlay'),
    z: () => flip('zoom'),
    c: () => flip('compare'),
    f: () => chrome.togglePresenter(),
  });
  onLayoutChange(renderAll);

  function changed() {
    saveParams(P);
    loadPop();
    $('#popNote').textContent = isProp
      ? `Each bead is one member of the population. Colored beads are ${pop.successLabel}.`
      : pop.note;
    cmpData = null;
    reset();
  }

  syncN();
  changed();
}
