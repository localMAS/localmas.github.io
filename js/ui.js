// Shared page chrome: header/nav, URL-encoded state, presenter mode, shortcuts.

export const $ = (sel, root = document) => root.querySelector(sel);

const PAGES = [
  ['index.html', 'Home', 'home'],
  ['picker.html', 'Sampling variability', 'picker'],
  ['sampling.html', 'Sampling distributions & CLT', 'sampling'],
  ['probability.html', 'Probabilities with z', 'probability'],
  ['proportion.html', 'Sample proportions', 'proportion'],
];

// State lives in the URL so a link reproduces an exact setup (population, n, seed, ...).
export function readParams(defaults) {
  const q = new URLSearchParams(location.search);
  const P = {};
  for (const [k, d] of Object.entries(defaults)) {
    const raw = q.get(k);
    if (raw === null) P[k] = d;
    else if (typeof d === 'number') {
      const v = Number(raw);
      P[k] = Number.isFinite(v) ? v : d;
    } else P[k] = raw;
  }
  Object.defineProperty(P, '_defaults', { value: defaults });
  return P;
}

export function saveParams(P) {
  const q = new URLSearchParams();
  for (const [k, d] of Object.entries(P._defaults)) if (P[k] !== d) q.set(k, P[k]);
  const s = q.toString();
  history.replaceState(null, '', s ? '?' + s : location.pathname);
}

export function initChrome(active, P) {
  const header = document.createElement('header');
  header.className = 'topbar';
  header.innerHTML = `
    <a class="brand" href="index.html">Sampling Lab</a>
    <nav>${PAGES.slice(1).map(([href, label, id]) =>
      `<a href="${href}"${id === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
    <div class="topbar-tools">
      <button type="button" id="btnLink" title="Copy a link to exactly this setup">Copy link</button>
      ${P ? '<button type="button" id="btnPresent" title="Larger text for recording (F)">Presenter mode</button>' : ''}
    </div>`;
  document.body.prepend(header);

  $('#btnLink').addEventListener('click', async () => {
    const b = $('#btnLink');
    try {
      await navigator.clipboard.writeText(location.href);
      b.textContent = 'Copied!';
    } catch {
      b.textContent = 'Copy failed';
    }
    setTimeout(() => (b.textContent = 'Copy link'), 1400);
  });

  // Mouse clicks shouldn't leave buttons focused, or Space would re-trigger them
  // instead of reaching the keyboard shortcuts.
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && e.detail > 0) b.blur();
  });

  if (P && 'present' in P) {
    const apply = () => {
      document.body.classList.toggle('presenter', !!P.present);
      $('#btnPresent').setAttribute('aria-pressed', P.present ? 'true' : 'false');
      window.dispatchEvent(new Event('layoutchange'));
    };
    const toggle = () => {
      P.present = P.present ? 0 : 1;
      saveParams(P);
      apply();
    };
    $('#btnPresent').addEventListener('click', toggle);
    apply();
    return { togglePresenter: toggle };
  }
  return {};
}

export function bindKeys(map) {
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const key = e.key === ' ' ? 'space' : e.key.toLowerCase();
    if (tag === 'BUTTON' && (key === 'space' || key === 'enter')) return;
    const fn = map[key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });
}

export function onLayoutChange(fn) {
  window.addEventListener('layoutchange', fn);
  let raf = 0;
  let lastW = 0;
  new ResizeObserver(() => {
    const w = document.body.clientWidth;
    if (w === lastW) return;
    lastW = w;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fn);
  }).observe(document.body);
}

// Promise-based tween that can be cancelled through a shared token.
export function tween(token, ms, frame) {
  return new Promise((resolve) => {
    if (token.cancelled || ms <= 0) {
      frame(1);
      resolve();
      return;
    }
    const t0 = performance.now();
    const step = (now) => {
      if (token.cancelled) return resolve();
      const u = Math.min(1, (now - t0) / ms);
      frame(u);
      if (u < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const SPEEDS = { slow: 2.2, normal: 1, fast: 0.35, instant: 0 };

export function setOptions(select, options, value) {
  select.innerHTML = options.map(([v, label]) => `<option value="${v}">${label}</option>`).join('');
  select.value = String(value);
}
