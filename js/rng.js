// Seeded random numbers, so a recorded demo can be replayed exactly.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.reseed(seed);
  }

  reseed(seed) {
    this.seed = seed >>> 0;
    this.next = mulberry32(this.seed);
    this.spare = null;
  }

  random() {
    return this.next();
  }

  int(n) {
    return Math.floor(this.next() * n);
  }

  normal(mu = 0, sd = 1) {
    if (this.spare !== null) {
      const z = this.spare;
      this.spare = null;
      return mu + sd * z;
    }
    const u = 1 - this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return mu + sd * r * Math.cos(2 * Math.PI * v);
  }

  exponential(mean) {
    return -mean * Math.log(1 - this.next());
  }

  bernoulli(p) {
    return this.next() < p ? 1 : 0;
  }

  binomial(n, p) {
    let k = 0;
    for (let i = 0; i < n; i++) if (this.next() < p) k++;
    return k;
  }
}
