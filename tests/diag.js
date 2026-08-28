// Where the time actually goes. Run it before touching a tuning constant:
//   node tests/diag.js            every campaign level, every bot
//   node tests/diag.js 14         just that level
//
// Columns: how long the bot took, how much of the clock it had left, how many
// hearts survived, what it ate, and the fewest edible things that were ever in
// the valley at once (the anti-stuck floor — this must never reach 0).

const { load } = require("./load.js");
const { play } = require("./brain.js");

const S = load();
// Eight, not three. A per-level pass rate swings wildly on a handful of seeds,
// and three of them is enough to "discover" an ordering between two bots that
// reverses itself the next run.
const SEEDS = [11, 47, 903, 1571, 2609, 4133, 6067, 8191];
const BOTS = ["perfect", "rosalie", "isabelle", "timid"];
const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

let worldNow = -1;
const totals = Object.fromEntries(BOTS.map((b) => [b, { win: 0, stars: 0, score: 0, scares: 0, run: 0 }]));

for (const level of S.LEVELS) {
  if (only !== null && level.idx !== only) continue;
  if (level.world !== worldNow) {
    worldNow = level.world;
    console.log(`\n=== ${S.WORLDS[worldNow].name} ===`);
    console.log(`${pad("lvl", 22)}${pad("bot", 10)}${num("win", 4)}${num("★", 3)}${num("secs", 7)}${num("left%", 7)}${num("♥", 3)}${num("ate", 5)}${num("hits", 6)}${num("food↓", 7)}  why`);
  }
  for (const bot of BOTS) {
    let wins = 0, secs = 0, left = 0, hearts = 0, ate = 0, hits = 0, minFood = 99, stars = 0, score = 0;
    const why = new Set();
    for (const seed of SEEDS) {
      const r = play(S, level, bot, seed);
      wins += r.win ? 1 : 0;
      stars += r.stars; score += r.score;
      secs += r.seconds; left += r.win ? r.timeLeft / level.time : 0;
      hearts += r.hearts; ate += r.catches; hits += r.scares;
      minFood = Math.min(minFood, r.minEdible);
      if (!r.win) why.add(r.reason);
      const t = totals[bot];
      t.win += r.win ? 1 : 0; t.stars += r.stars; t.score += r.score;
      t.scares += r.scares; t.run++;
    }
    const n = SEEDS.length;
    console.log(
      pad(`${level.idx + 1}. ${level.name}`, 22) + pad(bot, 10) +
      num(`${wins}/${n}`, 4) + num((stars / n).toFixed(1), 3) +
      num((secs / n).toFixed(0), 7) + num(`${Math.round((left / n) * 100)}%`, 7) +
      num((hearts / n).toFixed(1), 3) + num((ate / n).toFixed(0), 5) +
      num((hits / n).toFixed(1), 6) + num(minFood, 7) + "  " + [...why].join(",")
    );
  }
}

if (only === null) {
  console.log("\n=== campaign totals ===");
  for (const b of BOTS) {
    const t = totals[b];
    console.log(`${pad(b, 10)} won ${num(t.win, 3)}/${t.run}   stars ${num(t.stars, 4)}   ` +
      `score ${num(t.score.toLocaleString(), 9)}   hits ${num(t.scares, 4)}`);
  }

  console.log("\n=== Endless Feast ===");
  for (const bot of BOTS) {
    let sc = 0, tier = 0, secs = 0, wave = 0;
    for (const seed of SEEDS) {
      const r = play(S, null, bot, seed, { mode: "feast" });
      sc += r.score; tier = Math.max(tier, r.tier); secs += r.seconds; wave += r.wave;
    }
    const n = SEEDS.length;
    console.log(`${pad(bot, 10)} score ${num(Math.round(sc / n).toLocaleString(), 8)}   ` +
      `lasted ${num((secs / n).toFixed(0), 4)}s   wave ${num((wave / n).toFixed(1), 5)}   biggest tier ${tier}`);
  }
}
