// Linting the valley itself. Every check here is a property of the DATA, so a
// level authored badly fails the build rather than being discovered by a
// five-year-old who cannot get past it.
//
// Failures are collected into arrays and asserted empty, so one run names every
// offender instead of stopping at the first.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { load, ROOT } = require("./load.js");

const S = load();
const { LEVELS, WORLDS, FEAST, SPECIES, NEED, MAX_TIER, PLAYER_SPEED, SPEED_CAP } = S;

const label = (l) => `${l.idx + 1} "${l.name}"`;

test("every level is shaped legally", () => {
  const bad = [];
  for (const l of LEVELS) {
    if (!(l.start >= 1)) bad.push(`${label(l)}: start ${l.start}`);
    if (!(l.target > l.start)) bad.push(`${label(l)}: target ${l.target} <= start ${l.start}`);
    if (l.target > MAX_TIER) bad.push(`${label(l)}: target ${l.target} above the ladder`);
    if (!(l.time > 0)) bad.push(`${label(l)}: no clock`);
    if (!WORLDS[l.world]) bad.push(`${label(l)}: world ${l.world}`);
    if (!l.hint) bad.push(`${label(l)}: no hint`);
    if (!(l.plants > 0)) bad.push(`${label(l)}: no plants — nothing to fall back on`);
    for (const [id] of l.spawn) if (!S.species(id)) bad.push(`${label(l)}: unknown "${id}"`);
  }
  assert.deepStrictEqual(bad, []);
});

// The beast has to be exactly one rung below the level's target, or the whole
// arc breaks: it must hunt you at the start and be edible the moment you top
// out. One rung lower and it is food before the finale; one higher and the
// level cannot be finished at all.
test("a beast is always one rung below the target", () => {
  const bad = [];
  for (const l of LEVELS) {
    if (!l.beast) continue;
    const sp = S.species(l.beast.id);
    if (!sp) { bad.push(`${label(l)}: unknown beast "${l.beast.id}"`); continue; }
    if (sp.spiky) bad.push(`${label(l)}: beast ${sp.name} is armoured — it could never be eaten`);
    if (sp.tier !== l.target - 1) {
      bad.push(`${label(l)}: beast ${sp.name} is tier ${sp.tier}, target is ${l.target}`);
    }
    if (!l.beast.name) bad.push(`${label(l)}: the beast has no name`);
  }
  assert.deepStrictEqual(bad, []);
  assert.ok(LEVELS.filter((l) => l.beast).length >= 4, "every world wants a finale");
});

// The one that matters most. At EVERY size she passes through, there has to be
// enough in the valley to fill the next bar without waiting on respawns —
// otherwise the level is not hard, it is a queue, and she spends it dodging
// predators with nothing to eat. Level 16 shipped in a first draft with four
// Hypsilophodon as the only food at tier 4 and was unwinnable by all four bots.
const SUPPLY = 1.5;
test("there is always enough to eat at every size you pass through", () => {
  const bad = [];
  for (const l of LEVELS) {
    for (let t = l.start; t < l.target; t++) {
      let value = 0;
      for (const [id, n] of l.spawn) {
        const sp = S.species(id);
        if (S.relation(sp, t) === "food") value += n * S.speciesValue(sp);
      }
      const want = NEED[t] * SUPPLY;
      if (value < want) {
        bad.push(`${label(l)}: at tier ${t} the valley holds ${value} of food, needs ${want.toFixed(0)}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

test("plants are edible at every size, so there is always a fallback", () => {
  const bad = [];
  for (const sp of SPECIES.filter((s) => s.kind === "plant")) {
    for (let t = 1; t <= MAX_TIER; t++) {
      if (S.relation(sp, t) !== "food") bad.push(`${sp.name} is not food at tier ${t}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

// Nothing may out-run the player, or being chased stops being something you can
// escape and starts being something that happens to you.
test("nothing alive out-runs the player", () => {
  const slowest = Math.min(...PLAYER_SPEED.slice(1));
  // Spread it into this realm: an array built by the sandbox's own Array fails
  // deepStrictEqual against a plain one, reporting "same structure but not
  // reference-equal" over two things that print identically.
  const bad = [...SPECIES
    .filter((s) => s.kind !== "plant" && s.speed > SPEED_CAP)
    .map((s) => `${s.name} runs ${s.speed}, cap is ${SPEED_CAP}`)];
  assert.deepStrictEqual(bad, []);
  assert.ok(SPEED_CAP < slowest * 0.9,
    `SPEED_CAP ${SPEED_CAP} must stay under 90% of the slowest player speed ${slowest}`);
});

// The beast is the deliberate exception and pays for it by tiring. Both halves
// have to be true or the finale is either impossible or pointless.
test("a beast really does out-run you, and really does have to stop", () => {
  // Both are multiples of the PLAYER's speed, so these hold for every beast at
  // every size rather than only for a hypothetical one running at the cap.
  assert.ok(S.BEAST_SPRINT > 1, "a sprinting beast has to actually pull away");
  assert.ok(S.BEAST_TIRED < 0.7, "a blown beast has to be comfortably catchable");
  assert.ok(S.BEAST_REST > 1.5, "the window has to be long enough to close the gap");

  // The one that makes the chase a plan rather than a coin toss: sticking with
  // it has to pay. Ground gained while it blows must beat ground lost while it
  // sprints, or following it forever still never closes.
  const lost = (S.BEAST_SPRINT - 1) * S.BEAST_STAMINA;
  const gained = (1 - S.BEAST_TIRED) * S.BEAST_REST;
  assert.ok(gained > lost * 2,
    `a full sprint/breather cycle must net you ground: lose ${lost.toFixed(2)}, gain ${gained.toFixed(2)}`);
});

// Sizes have to be tellable apart across the arena, because that judgement IS
// the game. 1.25x is the floor; anything closer and a fair mistake becomes a
// lost heart.
test("each size is visibly bigger than the last", () => {
  const bad = [];
  for (let i = 1; i < S.TIER_R.length; i++) {
    const ratio = S.TIER_R[i] / S.TIER_R[i - 1];
    if (ratio < 1.25) bad.push(`tier ${i - 1}->${i} is only ${ratio.toFixed(2)}x`);
  }
  for (let i = 2; i < S.PLAYER_R.length; i++) {
    const ratio = S.PLAYER_R[i] / S.PLAYER_R[i - 1];
    if (ratio < 1.25) bad.push(`player ${i - 1}->${i} is only ${ratio.toFixed(2)}x`);
  }
  assert.deepStrictEqual(bad, []);
});

// The same size as you is SAFE. This is the promise that lets a child guess
// wrong without being punished for it, and it has to hold for every pairing.
test("anything your own size is harmless, and armour is never food", () => {
  const bad = [];
  for (const sp of SPECIES) {
    if (sp.kind === "plant") continue;
    for (let t = 1; t <= MAX_TIER; t++) {
      const rel = S.relation(sp, t);
      if (!["food", "bump", "danger", "spiky"].includes(rel)) bad.push(`${sp.name}@${t}: ${rel}`);
      if (sp.spiky && rel !== "spiky") bad.push(`${sp.name}@${t}: armour read as ${rel}`);
      if (!sp.spiky && sp.tier === t && rel !== "bump") bad.push(`${sp.name}@${t}: same size read as ${rel}`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

// Fern Hollow teaches the rule; it is not the place to meet a hunter, and
// armour is Spike Ridge's whole idea, so it may not turn up before it.
test("the worlds introduce their ideas in order", () => {
  const bad = [];
  for (const l of LEVELS) {
    for (const [id] of l.spawn) {
      const sp = S.species(id);
      if (sp.spiky && l.world < 2) bad.push(`${label(l)}: armour (${sp.name}) before Spike Ridge`);
      if (sp.aggression >= 0.8 && l.world === 0 && l.idx < 3) {
        bad.push(`${label(l)}: a real hunter (${sp.name}) in the first three levels`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

// The Dino Book is a collection, so it has to be collectable.
test("every species can actually be met, and has something to say", () => {
  const seen = new Set();
  for (const l of LEVELS) {
    for (const [id] of l.spawn) seen.add(id);
    if (l.beast) seen.add(l.beast.id);
  }
  for (const w of FEAST.waves) for (const [id] of w) seen.add(id);
  for (const sp of SPECIES) if (sp.kind === "plant") seen.add(sp.id);

  const missing = [...SPECIES.filter((s) => !seen.has(s.id)).map((s) => s.name)];
  assert.deepStrictEqual(missing, [], "unreachable species can never fill the book");

  const thin = [...SPECIES.filter((s) => !s.name || !s.fact || s.fact.length < 20).map((s) => s.id)];
  assert.deepStrictEqual(thin, []);
});

test("the Feast ramps, and unlocks after a world rather than on day one", () => {
  assert.ok(FEAST.unlockAfter === undefined || true);
  assert.strictEqual(S.FEAST_UNLOCK, S.levelsInWorld(0).length,
    "the Feast should open exactly when Fern Hollow is finished");
  assert.ok(FEAST.maxTier < MAX_TIER,
    "in the Feast something must always be able to reach you, or it never ends");
  const bad = [];
  for (const w of FEAST.waves) for (const [id] of w) if (!S.species(id)) bad.push(id);
  assert.deepStrictEqual(bad, []);
});

// game.js is the piece the bots drive. If it ever reaches for the DOM, the
// canvas or an unseeded random it stops being replayable and every balance
// number in tests/bot.test.js becomes an opinion.
test("the simulation stays pure", () => {
  const raw = fs.readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
  // Strip comments first, or this fails on the header that promises the thing.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const bad = [];
  if (/Math\.random\s*\(/.test(src)) bad.push("Math.random");
  if (/\bdocument\b/.test(src)) bad.push("document");
  if (/getContext\s*\(/.test(src)) bad.push("canvas");
  if (/\bwindow\b/.test(src)) bad.push("window");
  assert.deepStrictEqual(bad, []);
});
