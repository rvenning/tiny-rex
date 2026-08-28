// Balance. Four bots play the whole campaign and the Endless Feast, and the
// assertions below are the promises the game makes to the people who play it.
//
// The valley has real variance in it — where things spawn, which way they
// wander — so nothing here asserts that anybody wins every single time. What it
// asserts is that nobody ever hits a WALL: a level that a careful player cannot
// get past, or one that needs six attempts. Losing a hunt is fine. Being stuck
// is not.
//
//   TR_REPORT=1 node --test tests/bot.test.js     print the table as well

const test = require("node:test");
const assert = require("node:assert");
const { load } = require("./load.js");
const { play, PROFILES } = require("./brain.js");

const S = load();
const REPORT = !!process.env.TR_REPORT;

// Eight seeds, because a per-level pass rate swings by a couple of runs on
// three and you end up "discovering" orderings that reverse next time.
const SEEDS = [11, 47, 903, 1571, 2609, 4133, 6067, 8191];

function campaign(bot) {
  const rows = [];
  for (const level of S.LEVELS) {
    let wins = 0, stars = 0, score = 0, scares = 0, secs = 0, left = 0, minFood = 99;
    for (const seed of SEEDS) {
      const r = play(S, level, bot, seed);
      wins += r.win ? 1 : 0;
      stars += r.stars; score += r.score; scares += r.scares;
      secs += r.seconds; if (r.win) left += r.timeLeft / level.time;
      minFood = Math.min(minFood, r.minEdible);
    }
    rows.push({
      level, wins, rate: wins / SEEDS.length, stars, score, scares,
      secs: secs / SEEDS.length, left: wins ? left / wins : 0, minFood,
    });
  }
  const tot = (k) => rows.reduce((s, r) => s + r[k], 0);
  return { rows, wins: tot("wins"), stars: tot("stars"), score: tot("score"),
    scares: tot("scares"), runs: rows.length * SEEDS.length };
}

const RUNS = Object.fromEntries(
  ["perfect", "rosalie", "isabelle", "timid"].map((b) => [b, campaign(b)])
);

if (REPORT) {
  for (const [name, run] of Object.entries(RUNS)) {
    console.log(`\n--- ${name}: ${run.wins}/${run.runs} won, ${run.stars} stars, ` +
      `${run.score.toLocaleString()} points, ${run.scares} scares`);
    for (const r of run.rows) {
      if (r.rate === 1) continue;
      console.log(`    ${r.level.idx + 1} ${r.level.name}: ${r.wins}/${SEEDS.length}` +
        `  ${r.secs.toFixed(0)}s  ${Math.round(r.left * 100)}% clock left`);
    }
  }
}

/* ------------------------------- guardrails ------------------------------ */

test("a clear-sighted, careful player clears the campaign", () => {
  const run = RUNS.perfect;
  assert.ok(run.wins / run.runs >= 0.95,
    `the guardrail bot won ${run.wins}/${run.runs}`);
  // And no single level may be a wall for it, however hard the world is.
  const walls = run.rows.filter((r) => r.rate < 0.7)
    .map((r) => `${r.level.idx + 1} ${r.level.name} (${r.wins}/${SEEDS.length})`);
  assert.deepStrictEqual(walls, []);
});

// The kindness guarantee. This bot will not go near anything that frightens it,
// so if it still finishes, no level ever FORCES a player into danger to make
// progress — there is always a way through on plants and safe prey.
test("nobody is ever forced into danger", () => {
  const run = RUNS.timid;
  assert.ok(run.wins / run.runs >= 0.93, `the timid bot won ${run.wins}/${run.runs}`);
  const walls = run.rows.filter((r) => r.rate < 0.6)
    .map((r) => `${r.level.idx + 1} ${r.level.name} (${r.wins}/${SEEDS.length})`);
  assert.deepStrictEqual(walls, []);
});

// The one the game is actually for. She is slow to notice things, muddles two
// sizes that sit next to each other, and steers roughly at what she wants.
test("Isabelle gets through the whole campaign", () => {
  const run = RUNS.isabelle;
  assert.ok(run.wins / run.runs >= 0.88,
    `the five-year-old bot won ${run.wins}/${run.runs}`);
  const walls = run.rows.filter((r) => r.rate < 0.5)
    .map((r) => `${r.level.idx + 1} ${r.level.name} (${r.wins}/${SEEDS.length})`);
  assert.deepStrictEqual(walls, []);
});

// "Losing is fine, being stuck is not", stated as the thing a child actually
// experiences: she may have to go again, but never six times.
test("and she is never stuck — a retry always gets her through", () => {
  const MAX_TRIES = 5;
  let totalTries = 0;
  const stuck = [];
  for (const level of S.LEVELS) {
    for (const seed of SEEDS.slice(0, 4)) {
      let tries = 0, won = false;
      while (tries < MAX_TRIES && !won) {
        won = play(S, level, "isabelle", seed * 100 + tries).win;
        tries++;
      }
      totalTries += tries;
      if (!won) stuck.push(`${level.idx + 1} ${level.name} @${seed}`);
    }
  }
  assert.deepStrictEqual(stuck, []);
  const mean = totalTries / (S.LEVELS.length * 4);
  assert.ok(mean < 1.35, `mean attempts per level was ${mean.toFixed(2)} — that is a grind`);
  if (REPORT) console.log(`\n--- mean attempts per level: ${mean.toFixed(2)}`);
});

/* -------------------------------- controls ------------------------------- */

test("standing still wins nothing at all", () => {
  const bad = [];
  for (const level of S.LEVELS) {
    for (const seed of SEEDS.slice(0, 3)) {
      const r = play(S, level, "idle", seed);
      if (r.win) bad.push(`${level.idx + 1} ${level.name} @${seed}`);
      if (r.stars > 0) bad.push(`${level.idx + 1} stars for doing nothing`);
    }
  }
  assert.deepStrictEqual(bad, []);
});

// If judging sizes well did not pay, the game would not be about judging sizes.
test("playing well beats playing badly", () => {
  assert.ok(RUNS.perfect.stars > RUNS.isabelle.stars * 1.15,
    `${RUNS.perfect.stars} stars vs ${RUNS.isabelle.stars}`);
  assert.ok(RUNS.perfect.score > RUNS.isabelle.score,
    `${RUNS.perfect.score} points vs ${RUNS.isabelle.score}`);
  assert.ok(RUNS.perfect.scares < RUNS.isabelle.scares * 0.6,
    "a careful player should be caught far less often");
});

// Stars come from hearts, so they have to actually separate. If everyone got
// three the grade would mean nothing; if nobody did it would be unreachable.
test("stars are worth earning and possible to earn", () => {
  const max = S.LEVELS.length * SEEDS.length * 3;
  assert.ok(RUNS.perfect.stars / max > 0.75, "three stars must be reachable");
  assert.ok(RUNS.isabelle.stars / max < 0.85, "a sloppy run must not top out");
  assert.ok(RUNS.isabelle.stars / max > 0.4, "and it must not be hopeless either");
});

/* -------------------------------- finales -------------------------------- */

// The arc every world ends on: it hunts you, you out-grow it, and then it runs
// and you have to run it down. All three halves are load-bearing, and the middle
// one broke silently once — three of the four beasts are species with a natural
// caution of 0.2, so being out-grown left them standing still to be eaten.
test("an out-grown beast runs, tires, and can still be caught", () => {
  const bad = [];
  for (const level of S.LEVELS.filter((l) => l.beast)) {
    S.Game.start({ mode: "campaign", level, seed: 4242 });
    const beast = S.Game.beastEnt;
    const p = S.Game.player;
    assert.ok(beast, `${level.name}: no beast spawned`);

    // Grow her the way eating does, and check the level does NOT end on that.
    while (p.tier < level.target) { p.belly += S.NEED[p.tier]; S.Game.grow(); }
    S.Game.update(1 / 60);
    if (!S.Game.running) bad.push(`${level.name}: ended without catching ${level.beast.name}`);
    if (S.relation(beast.sp, p.tier) !== "food") bad.push(`${level.name}: beast is not edible at the target size`);

    // Stand still near it — but outside her own reach, or it is simply eaten on
    // the first frame and the test measures nothing.
    p.x = 180; p.y = 300; beast.x = 180; beast.y = 180;
    S.Game.input.tx = p.x; S.Game.input.ty = p.y;
    const d0 = Math.hypot(beast.x - p.x, beast.y - p.y);
    for (let i = 0; i < 90; i++) S.Game.update(1 / 60);
    const opened = Math.hypot(beast.x - p.x, beast.y - p.y) - d0;
    if (opened < 40) bad.push(`${level.name}: only opened ${Math.round(opened)}px in 1.5s — it is not running`);

    // And chasing it down has to work, and has to need the breather.
    let f = 0, rested = false;
    while (S.Game.running && !S.Game.beastEaten && f < 60 * 90) {
      S.Game.input.tx = beast.x; S.Game.input.ty = beast.y;
      S.Game.update(1 / 60);
      if (beast.restT > 0) rested = true;
      f++;
    }
    if (!S.Game.beastEaten) bad.push(`${level.name}: ${level.beast.name} could not be caught in 90s`);
    if (!rested) bad.push(`${level.name}: never had to stop for breath — the chase is a formality`);
    if (REPORT) console.log(`    ${level.beast.name}: opened ${Math.round(opened)}px, caught after ${(f / 60).toFixed(1)}s`);
  }
  assert.deepStrictEqual(bad, []);
});

/* ------------------------------ never hungry ----------------------------- */

// The promise underneath everything: whatever size you are, there is always
// something in the valley you can safely eat. Plants respawn to a floor, so
// this should never even approach zero.
test("there is always something you can eat", () => {
  const bad = [];
  for (const [name, run] of Object.entries(RUNS)) {
    for (const r of run.rows) {
      if (r.minFood < S.FOOD_FLOOR - 1) {
        bad.push(`${name} on ${r.level.idx + 1} ${r.level.name}: down to ${r.minFood}`);
      }
    }
  }
  assert.deepStrictEqual(bad, []);
});

// The clock exists so a stalled level ends, not as a difficulty knob. Stars come
// from hearts alone, so a careful, slow player must never be beaten by it.
test("the clock is never what beats you", () => {
  const bad = [];
  for (const r of RUNS.timid.rows) {
    if (r.left < 0.2) bad.push(`${r.level.idx + 1} ${r.level.name}: only ${Math.round(r.left * 100)}% left`);
  }
  assert.deepStrictEqual(bad, []);
  const timeOuts = [];
  for (const level of S.LEVELS) {
    for (const seed of SEEDS.slice(0, 4)) {
      const r = play(S, level, "timid", seed);
      if (!r.win && r.reason === "time") timeOuts.push(`${level.idx + 1} @${seed}`);
    }
  }
  assert.deepStrictEqual(timeOuts, []);
});

/* ---------------------------- the Endless Feast -------------------------- */

test("the Endless Feast ends, rewards skill, and never runs away with itself", () => {
  const out = {};
  for (const bot of ["perfect", "rosalie", "isabelle", "timid", "idle"]) {
    let score = 0, secs = 0, tier = 0;
    for (const seed of SEEDS.slice(0, 4)) {
      const r = play(S, null, bot, seed, { mode: "feast" });
      score += r.score; secs += r.seconds; tier = Math.max(tier, r.tier);
    }
    out[bot] = { score: score / 4, secs: secs / 4, tier };
  }
  if (REPORT) console.log("\n--- feast", JSON.stringify(out));

  // It has to actually finish, or it is not a score anyone can compare.
  for (const [bot, o] of Object.entries(out)) {
    assert.ok(o.secs < 600, `${bot} was still going after ${o.secs.toFixed(0)}s`);
  }
  assert.ok(out.timid.secs > 90, "a good run should last a couple of minutes");
  assert.ok(out.rosalie.score > out.isabelle.score * 1.3,
    "playing well has to pay in the Feast too");
  assert.ok(out.idle.score < out.isabelle.score * 0.25, "standing still scores nothing");

  // Note which bot the growth claim is made about. The guardrail bot keeps 168px
  // between itself and anything dangerous, which is most of the way across the
  // arena — fine in the campaign, where hanging back costs nothing but time, and
  // useless in the Feast, where hunger is draining the whole while. It tops out
  // around tier 3. That is not a bug in the mode, it is the mode's whole point:
  // out here you have to take the risk, and the campaign is where patience wins.
  const bold = Math.max(out.rosalie.tier, out.timid.tier);
  assert.strictEqual(bold, S.FEAST.maxTier,
    "a player who commits should be able to reach the top of the Feast");
});
