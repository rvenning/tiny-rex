// A tiny seeded PRNG, so the whole valley is a function of one number.
//
// The engine never calls Math.random — every wander, every spawn point and
// every nibble comes from here. That is what lets tests/bot.test.js replay a
// level byte-for-byte: a level that suddenly takes longer is a real balance
// change, never a bad roll.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RNG = {
  make(seed) {
    const next = mulberry32(seed);
    return {
      next,
      float(a, b) { return a + next() * (b - a); },
      int(a, b) { return a + Math.floor(next() * (b - a + 1)); },
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      chance(p) { return next() < p; },
      angle() { return next() * Math.PI * 2; },
    };
  },
};
