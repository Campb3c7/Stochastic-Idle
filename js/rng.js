// Seeded random number generation.
// Every random thing in the simulation draws from a seeded stream so a world
// can be replayed exactly from its seed. Separate streams (world, survivor, ...)
// keep systems independent: adding a new random call in one system won't
// change what happens in another.
(function () {
  "use strict";

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Integer hash for deterministic per-pixel / per-cell noise.
  function hash2(x, y, seed) {
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  class RNG {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.next = mulberry32(this.seed);
    }
    float() { return this.next(); }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    // Exponential(mean): waiting time between memoryless events.
    exponential(mean) { return -Math.log(1 - this.next()) * mean; }
    // Normal(mu, sigma) via Box-Muller.
    normal(mu = 0, sigma = 1) {
      const u = 1 - this.next(), v = this.next();
      return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    // Independent child stream, deterministic from this seed + a label.
    fork(label) { return new RNG(hashString(this.seed + ":" + label)); }
  }

  window.SI = window.SI || {};
  SI.RNG = RNG;
  SI.hash2 = hash2;
})();
