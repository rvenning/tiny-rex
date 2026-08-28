// Tiny Rex — the save file.
//
// PROGRESS.merge is the one function in the game that can permanently destroy
// something. It runs on every device sync, so a wrong max() silently forgets a
// star that was already earned or empties the Dino Book. It is exported as a
// named object precisely so this suite can call it, because createStorage keeps
// its callbacks in a closure where nothing else can reach them.
//
// The merge is order-dependent by nature — whichever device syncs first is a
// coin toss — so every claim here is asserted BOTH ways round.

const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

// js/storage.js calls GK.createStorage at load time, so the kit and the
// registries it reads have to come with it, in index.html's order.
const S = loadScripts({
  baseDir: ROOT,
  files: [
    "lib/gk-util.js", "lib/gk-audio.js", "lib/gk-ui.js", "lib/gk-storage.js",
    "js/creatures.js", "js/levels.js", "js/storage.js",
  ],
  exports: ["PROGRESS", "Storage", "LEVELS", "FEAST_UNLOCK"],
  browser: true,
  globals: {
    performance: { now: () => 0 }, requestAnimationFrame() {},
    FIREBASE_CONFIG: null,
  },
});

const { PROGRESS, Storage, LEVELS, FEAST_UNLOCK } = S;
const blank = () => PROGRESS.blank();

test("two devices that both played keep the best of everything", () => {
  const a = { ...blank(), feastBest: 4200, feastTier: 5, catches: 210,
    levels: { 0: { stars: 3, best: 900 }, 1: { stars: 1, best: 600 } },
    met: { compy: 1, raptor: 1 } };
  const b = { ...blank(), feastBest: 3100, feastTier: 4, catches: 140,
    levels: { 1: { stars: 3, best: 550 }, 2: { stars: 2, best: 700 } },
    met: { compy: 1, trike: 1 } };

  for (const [x, y] of [[a, b], [b, a]]) {
    const m = PROGRESS.merge(x, y);
    assert.equal(m.feastBest, 4200);
    assert.equal(m.feastTier, 5);
    assert.equal(m.levels[0].stars, 3);
    assert.equal(m.levels[1].stars, 3, "the better result for a level survives");
    assert.equal(m.levels[1].best, 600, "and so does the better score, separately");
    assert.equal(m.levels[2].stars, 2, "a level only one device has played survives");
    // The book is a union: meeting a Triceratops on the iPad does not un-meet
    // the Velociraptor she found on the phone.
    assert.deepStrictEqual(
      Object.keys(m.met).sort(), ["compy", "raptor", "trike"]);
  }
});

test("a blank device never wipes one that has played", () => {
  const played = { ...blank(), feastBest: 900, catches: 40,
    levels: { 0: { stars: 2, best: 500 } }, met: { beetle: 1 } };
  for (const [x, y] of [[played, blank()], [blank(), played]]) {
    const m = PROGRESS.merge(x, y);
    assert.equal(m.feastBest, 900);
    assert.equal(m.levels[0].stars, 2);
    assert.deepStrictEqual(Object.keys(m.met), ["beetle"]);
  }
});

// A field an older build has never heard of must survive its merge, or the
// first sync from an out-of-date iPad quietly deletes the new feature.
test("a field a newer build added survives an older client's merge", () => {
  const newer = { ...blank(), somethingNew: 7 };
  assert.equal(PROGRESS.merge(blank(), newer).somethingNew, 7);
  assert.equal(PROGRESS.merge(newer, blank()).somethingNew, 7);
});

test("hunts unlock one at a time and never run off the end", () => {
  const p = blank();
  assert.equal(Storage.unlockedLevel(p), 0);
  p.levels = { 0: { stars: 3 }, 1: { stars: 1 } };
  assert.equal(Storage.unlockedLevel(p), 2);
  p.levels = Object.fromEntries(LEVELS.map((l) => [l.idx, { stars: 3 }]));
  assert.equal(Storage.unlockedLevel(p), LEVELS.length - 1);
  assert.equal(Storage.totalStars(p), LEVELS.length * 3);
});

test("the Feast opens once Fern Hollow is done, and not before", () => {
  const p = blank();
  assert.equal(Storage.feastUnlocked(p), false);
  p.levels = Object.fromEntries(
    Array.from({ length: FEAST_UNLOCK - 1 }, (_, i) => [i, { stars: 1 }]));
  assert.equal(Storage.feastUnlocked(p), false);
  p.levels[FEAST_UNLOCK - 1] = { stars: 1 };
  assert.equal(Storage.feastUnlocked(p), true);
});

// Losing a hunt still fills the book — the Dino Book is a record of the
// afternoon, not a reward for winning — but it must not unlock the next level.
test("a lost hunt fills the book without unlocking anything", () => {
  const id = "tester";
  Storage.saveProgress(id, { ...blank(), updated: 1 });
  Storage.record(id, {
    mode: "campaign", levelIdx: 0, win: false, stars: 0, score: 300,
    catches: 5, met: { beetle: 1, hypsi: 1 },
  });
  let p = Storage.getProgress(id);
  assert.deepStrictEqual(Object.keys(p.levels), [], "a loss unlocks nothing");
  assert.equal(Object.keys(p.met).length, 2, "but she still met them");
  assert.equal(p.catches, 5);

  Storage.record(id, {
    mode: "campaign", levelIdx: 0, win: true, stars: 2, score: 800,
    catches: 9, met: { beetle: 1 },
  });
  p = Storage.getProgress(id);
  assert.equal(p.levels[0].stars, 2);
  assert.equal(p.catches, 14, "everything she has ever eaten keeps counting");
});

// Re-playing a hunt she has already three-starred must never take stars away.
test("a worse replay never costs you what you already had", () => {
  const id = "replayer";
  Storage.saveProgress(id, { ...blank(), updated: 1 });
  Storage.record(id, { mode: "campaign", levelIdx: 3, win: true, stars: 3, score: 1200, catches: 1, met: {} });
  Storage.record(id, { mode: "campaign", levelIdx: 3, win: true, stars: 1, score: 400, catches: 1, met: {} });
  const p = Storage.getProgress(id);
  assert.equal(p.levels[3].stars, 3);
  assert.equal(p.levels[3].best, 1200);
});

test("the Feast records a best score without touching the campaign", () => {
  const id = "feaster";
  Storage.saveProgress(id, { ...blank(), updated: 1 });
  Storage.record(id, { mode: "feast", win: false, score: 5400, tier: 5, catches: 30, met: { rex: 1 } });
  Storage.record(id, { mode: "feast", win: false, score: 2100, tier: 3, catches: 12, met: {} });
  const p = Storage.getProgress(id);
  assert.equal(p.feastBest, 5400);
  assert.equal(p.feastTier, 5);
  assert.deepStrictEqual(Object.keys(p.levels), []);
});
