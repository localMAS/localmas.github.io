// Minimal canvas plotting: axes, histogram bars, curves, reference lines, dots.
// Colors and font size come from CSS custom properties so presenter mode and
// dark mode restyle every plot without code changes.

export function niceTicks(lo, hi, count = 6) {
  const range = hi - lo;
  if (!(range > 0)) return [lo];
  const raw = range / Math.max(1, count);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return ticks;
}

function tickFormat(ticks) {
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const d = Math.max(0, Math.min(4, -Math.floor(Math.log10(step) + 1e-9)));
  return (v) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export class Plot {
  constructor(canvas, { height = 200, margin = {} } = {}) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.baseH = height;
    this.m = { l: 44, r: 16, t: 24, b: 36, ...margin };
    this.x0 = 0; this.x1 = 1; this.y0 = 0; this.y1 = 1;
  }

  begin() {
    const st = getComputedStyle(document.body);
    this.style = st;
    this.font = parseFloat(st.getPropertyValue('--plot-font')) || 12;
    this.scale = parseFloat(st.getPropertyValue('--plot-scale')) || 1;
    const W = this.c.clientWidth || 600;
    const H = Math.round(this.baseH * this.scale);
    const dpr = window.devicePixelRatio || 1;
    this.c.style.height = H + 'px';
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (this.c.width !== pw || this.c.height !== ph) {
      this.c.width = pw;
      this.c.height = ph;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.W = W;
    this.H = H;
    this.fontFamily = st.fontFamily;
    ctx.font = `${this.font}px ${this.fontFamily}`;
    ctx.textBaseline = 'alphabetic';
    return this;
  }

  col(name) {
    return this.style.getPropertyValue('--' + name).trim();
  }

  get left() { return this.m.l; }
  get right() { return this.W - this.m.r; }
  get top() { return this.m.t; }
  get bottom() { return this.H - this.m.b; }

  setX(a, b) { this.x0 = a; this.x1 = b; return this; }
  setY(a, b) { this.y0 = a; this.y1 = b > a ? b : a + 1; return this; }

  sx(v) { return this.left + ((v - this.x0) / (this.x1 - this.x0)) * (this.right - this.left); }
  sy(v) { return this.bottom - ((v - this.y0) / (this.y1 - this.y0)) * (this.bottom - this.top); }
  invX(px) { return this.x0 + ((px - this.left) / (this.right - this.left)) * (this.x1 - this.x0); }

  setFont(size = this.font, weight = 400) {
    this.ctx.font = `${weight} ${size}px ${this.fontFamily}`;
  }

  clip() {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.left, 0, this.right - this.left, this.bottom);
    ctx.clip();
  }

  xAxis({ label = '', format = null } = {}) {
    const ctx = this.ctx;
    ctx.strokeStyle = this.col('axis');
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.left, this.bottom + 0.5);
    ctx.lineTo(this.right, this.bottom + 0.5);
    ctx.stroke();
    const ticks = niceTicks(this.x0, this.x1, Math.max(2, Math.floor((this.right - this.left) / (this.font * 6))));
    const f = format || tickFormat(ticks);
    this.setFont();
    ctx.fillStyle = this.col('muted');
    ctx.textAlign = 'center';
    for (const t of ticks) {
      const x = Math.round(this.sx(t)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, this.bottom);
      ctx.lineTo(x, this.bottom + 4);
      ctx.stroke();
      ctx.fillText(f(t), x, this.bottom + 6 + this.font);
    }
    if (label) {
      ctx.textAlign = 'right';
      ctx.fillText(label, this.right, this.H - 2);
    }
  }

  yAxis({ format = null, grid = true } = {}) {
    const ctx = this.ctx;
    const ticks = niceTicks(this.y0, this.y1, Math.max(2, Math.floor((this.bottom - this.top) / (this.font * 3))));
    const f = format || tickFormat(ticks);
    this.setFont();
    ctx.textAlign = 'right';
    for (const t of ticks) {
      const y = Math.round(this.sy(t)) + 0.5;
      if (grid && t !== this.y0) {
        ctx.strokeStyle = this.col('grid');
        ctx.beginPath();
        ctx.moveTo(this.left, y);
        ctx.lineTo(this.right, y);
        ctx.stroke();
      }
      ctx.fillStyle = this.col('muted');
      ctx.fillText(f(t), this.left - 6, y + this.font * 0.35);
    }
  }

  // bins: [{x0, x1, count}]; value drawn = count * scale.
  bars(bins, { fill, stroke = null, scale = 1, highlight = null, hlFill = null } = {}) {
    const ctx = this.ctx;
    this.clip();
    for (const b of bins) {
      if (!b.count) continue;
      const xa = this.sx(b.x0), xb = this.sx(b.x1);
      const gap = xb - xa > 5 ? 1 : 0;
      const yt = this.sy(b.count * scale);
      ctx.fillStyle = highlight && highlight(b) ? hlFill : fill;
      ctx.fillRect(xa + gap / 2, yt, Math.max(0.6, xb - xa - gap), this.bottom - yt);
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.strokeRect(xa + gap / 2, yt, Math.max(0.6, xb - xa - gap), this.bottom - yt);
      }
    }
    ctx.restore();
  }

  // Draws y = fn(x). With `fill`, shades the area between the curve and 0 on [fillFrom, fillTo].
  curve(fn, { color, width = 2, dash = [], fill = null, fillFrom = null, fillTo = null } = {}) {
    const ctx = this.ctx;
    const steps = Math.max(80, Math.round(this.right - this.left));
    this.clip();
    if (fill) {
      const a = Math.max(this.x0, fillFrom ?? this.x0);
      const b = Math.min(this.x1, fillTo ?? this.x1);
      if (b > a) {
        ctx.beginPath();
        ctx.moveTo(this.sx(a), this.sy(0));
        const k = Math.max(20, Math.round(((b - a) / (this.x1 - this.x0)) * steps));
        for (let i = 0; i <= k; i++) {
          const x = a + ((b - a) * i) / k;
          ctx.lineTo(this.sx(x), this.sy(fn(x)));
        }
        ctx.lineTo(this.sx(b), this.sy(0));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
    }
    if (color) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = this.x0 + ((this.x1 - this.x0) * i) / steps;
        const y = this.sy(fn(x));
        if (i === 0) ctx.moveTo(this.sx(x), y);
        else ctx.lineTo(this.sx(x), y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  // Vertical reference line with an optional label. row 0 = above the plot, row 1 = just inside it.
  vline(x, { color, dash = [], width = 2, label = '', row = 0, bold = false } = {}) {
    if (x < this.x0 || x > this.x1) return;
    const ctx = this.ctx;
    const px = Math.round(this.sx(x)) + 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(px, this.top - (row === 0 ? 4 : 0));
    ctx.lineTo(px, this.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    if (label) {
      this.setFont(this.font, bold ? 700 : 600);
      const w = ctx.measureText(label).width;
      let tx = px - w / 2;
      tx = Math.max(2, Math.min(this.W - w - 2, tx));
      const ty = row === 0 ? this.top - 8 : this.top + this.font + 4;
      if (row !== 0) {
        ctx.fillStyle = this.col('panel');
        ctx.fillRect(tx - 3, ty - this.font, w + 6, this.font + 5);
      }
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.fillText(label, tx, ty);
      this.setFont();
    }
  }

  circle(px, py, r, fill, stroke = null) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  text(str, px, py, { color = null, align = 'left', size = null, weight = 400 } = {}) {
    this.setFont(size || this.font, weight);
    this.ctx.fillStyle = color || this.col('ink');
    this.ctx.textAlign = align;
    this.ctx.fillText(str, px, py);
    this.setFont();
  }

  message(str) {
    this.text(str, (this.left + this.right) / 2, (this.top + this.bottom) / 2, {
      color: this.col('muted'), align: 'center', size: this.font * 1.1,
    });
  }

  // Classic stacked dot plot. Returns false if the dots cannot fit (caller should fall back to bars).
  // `items` are {x, color}; dots stack in the order given.
  dotStack(items, { top = this.top, bottom = this.bottom, rMax = 6, rMin = 2 } = {}) {
    const avail = bottom - top - 2;
    const width = this.right - this.left;
    let r = rMax * this.scale;
    let cols;
    for (;;) {
      cols = new Map();
      for (const it of items) {
        const k = Math.floor((this.sx(it.x) - this.left) / (2 * r));
        cols.set(k, (cols.get(k) || 0) + 1);
      }
      let tallest = 0;
      for (const v of cols.values()) tallest = Math.max(tallest, v);
      if (tallest * 2 * r <= avail) break;
      if (r <= rMin) return false;
      r = Math.max(rMin, r * 0.85);
    }
    const fill = new Map();
    for (const it of items) {
      const k = Math.floor((this.sx(it.x) - this.left) / (2 * r));
      const level = fill.get(k) || 0;
      fill.set(k, level + 1);
      const cx = Math.min(this.left + width, this.left + (k + 0.5) * 2 * r);
      const cy = bottom - r - level * 2 * r;
      this.circle(cx, cy, r * 0.9, it.color, it.stroke || null);
    }
    this.dotRadius = r;
    this.dotLevels = fill;
    return true;
  }
}
