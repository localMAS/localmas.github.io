# Sampling Lab

Interactive tools for teaching sampling variability, sampling distributions, the
Central Limit Theorem, and the sampling distribution of p̂. The site is plain
HTML, CSS, and JavaScript modules: no build step, no dependencies, and no server.

| Page | What it does |
|---|---|
| `index.html` | Landing page with one-click "lecture recipes" (preset links) |
| `picker.html` | 30 men; draw samples of n, watch x̄ vary, and show the exact distribution over all C(30, n) samples |
| `sampling.html` | Population, one sample, and sampling distribution panels; 8 populations; mean/median/max; CLT; comparing sample sizes |
| `probability.html` | z for one individual vs. x̄ (or p̂), shaded areas, and a simulation check; click or drag on a plot to move the cut-off |
| `proportion.html` | Bead urn with proportion p; sampling distribution of p̂; np ≥ 10 checks |


## Customizing

- **The 30 heights**: edit `js/data/heights30.js`. Use one decimal place, because the exact-distribution calculation works in tenths of an inch.
- **Add a population**: add an entry to `DEFS` in `js/populations.js`, either with `make(rng)` returning 10,000 values or with exact `counts`. Set `step: 1` for integer-valued data so histograms bin cleanly.
- **Proportion scenarios**: edit `PROP_PRESETS` in `js/populations.js`.
- **Colors and presenter sizing**: CSS variables at the top of `css/style.css`.

## Code layout

```
js/rng.js            seeded random numbers (reproducible takes)
js/stats.js          summaries, normal CDF/PDF, lattice-aware histogram binning
js/plot.js           small canvas plotting layer
js/populations.js    population library
js/ui.js             header, URL state, presenter mode, shortcuts, tweening
js/picker-app.js     tool 1
js/sampling-app.js   tools 2 and 4 (proportion mode)
js/probability-app.js tool 3
```

All state lives in the URL query string. Copy the address bar (or press **Copy link**) to share an exact setup with students.
