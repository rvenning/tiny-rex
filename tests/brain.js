// The bots that play Tiny Rex.
//
// The faculty this game tests is judging RELATIVE SIZE at a glance and getting
// out of the way in time, so that is exactly what the bots are allowed to be
// bad at. A bot with perfect size judgement clears everything without a scratch
// and tells you nothing about whether a five-year-old can — the numbers below
// are the difficulty vocabulary:
//
//   reaction  seconds before it re-reads the valley and changes its mind
//   confuse   chance it mistakes a creature ONE rung away for something else
//   jitter    how sloppily it steers at what it picked
//   panic     how close a thing it fears has to get before it drops lunch
//
// `confuse` is stored per creature per tier, not re-rolled every think: a
// mistake you re-roll ten times a second is a mistake nobody ever actually
// makes, because some roll always saves you.

// How close something has to be before the game itself tells you what it is.
// Keep this in step with the rim/glow radius in js/render.js.
const CUE_RANGE = 110;

const PROFILES = {
  // Guardrail. Nothing in the campaign may be unwinnable by this one — so it is
  // as careful as it is clear-sighted. Two earlier versions had it approaching
  // closer than the timid bot, which made "perfect" the WORST bot in the cast
  // and turned every reading upside down. In a game where the only way to lose
  // is to be touched, keeping your distance IS perfect play, and the guardrail
  // has to be allowed to know that.
  perfect:  { reaction: 0.08, confuse: 0.00, jitter: 0,  panic: 168 },
  // Rosalie at eight, roughly: quick, mostly right, and willing to push her luck.
  rosalie:  { reaction: 0.28, confuse: 0.06, jitter: 14, panic: 110 },
  // The tuning target. Isabelle at five or six: slow to notice, muddles two
  // sizes that are next to each other, wanders at what she is aiming for.
  isabelle: { reaction: 0.55, confuse: 0.20, jitter: 26, panic: 82 },
  // The kindness bot: slow, but it never goes near anything that frightens it.
  // If this one still finishes, nobody is ever FORCED into danger to progress.
  timid:    { reaction: 0.34, confuse: 0.02, jitter: 12, panic: 150 },
};

function makeBot(S, name, seed) {
  const prof = PROFILES[name];
  const rng = S.RNG.make((seed * 7919 + 13) >>> 0);
  const belief = new Map();      // "<entId>:<tier>" -> what this bot thinks it is
  const learned = new Set();     // species it has been bitten by and will not misread again
  let think = 0, seen = 0;
  let tx = 0, ty = 0;

  // What the bot BELIEVES a creature is. The truth is one call away; the point
  // is that it does not always get there.
  //
  // Inside CUE_RANGE it always gets there, because js/render.js paints a red rim
  // on anything that can eat you and a warm glow on anything you can eat as soon
  // as it is that close. Size is what you read across the valley; up close the
  // game answers. A bot that stays confused at point-blank range is modelling a
  // game nobody is playing, and it made every level whose danger sits one rung
  // up look far harder than it is.
  function see(e, tier, dist) {
    if (dist < CUE_RANGE) return S.relation(e.sp, tier);
    const key = e.id + ":" + tier;
    if (belief.has(key)) return belief.get(key);
    const truth = S.relation(e.sp, tier);
    let b = truth;
    // Being eaten is unambiguous feedback: nobody makes the same size mistake
    // about the same animal twice in one afternoon. Without this the bot walks
    // back into the thing that just bit it and burns all three hearts in eight
    // seconds, which is a bot bug that reads as a brutal first level.
    if (learned.has(e.sp.id)) b = truth;
    else if (truth === "danger" && e.sp.tier === tier + 1 && rng.chance(prof.confuse)) b = "food";
    else if (truth === "spiky" && rng.chance(prof.confuse * 0.8)) b = "food";
    else if (truth === "bump" && rng.chance(prof.confuse * 0.5)) b = "food";
    belief.set(key, b);
    return b;
  }

  return {
    name,
    step(dt) {
      const G = S.Game, p = G.player;
      // Nothing drains the engine's event queue in a headless run, so the bot
      // reads it the way the renderer does.
      for (; seen < G.q.length; seen++) {
        const ev = G.q[seen];
        if (ev.type === "hurt" || ev.type === "nope") {
          learned.add(ev.sp.id);
          belief.clear();     // keys are per creature, so re-judge the lot
        }
      }
      think -= dt;
      if (think > 0) return;
      think = prof.reaction;

      const live = [];
      for (const e of G.ents) {
        if (e.dead) continue;
        e.__d = Math.hypot(e.x - p.x, e.y - p.y);
        live.push(e);
      }
      const scary = live.filter((e) => see(e, p.tier, e.__d) === "danger");
      const food = live.filter((e) => see(e, p.tier, e.__d) === "food");

      // A predator that has lost interest reads as further away than it is,
      // because that is exactly what a player does: you watch the big one
      // wander off and you go back to eating. Without this the bots panic
      // continuously in any level with two hunters, never feed, and eventually
      // get cornered — which showed up as the GUARDRAIL bot failing a level the
      // sloppy one cleared.
      const range = (e) => Math.hypot(e.x - p.x, e.y - p.y) - e.r + (e.boredT > 0 ? 62 : 0);
      let nearest = Infinity;
      for (const e of scary) nearest = Math.min(nearest, range(e));

      if (nearest < prof.panic) {
        // Sample eight ways out and take the one that puts the most air between
        // it and everything it is afraid of — a straight "run the other way"
        // walks itself into corners, which is a bot bug that reads as a
        // difficulty finding.
        let best = null, bestScore = -Infinity;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const nx = Math.max(p.r + 6, Math.min(S.LW - p.r - 6, p.x + Math.cos(a) * 130));
          const ny = Math.max(p.r + 6, Math.min(S.LH - p.r - 6, p.y + Math.sin(a) * 130));
          let worst = Infinity;
          for (const e of scary) worst = Math.min(worst, Math.hypot(e.x - nx, e.y - ny));
          if (worst > bestScore) { bestScore = worst; best = { nx, ny }; }
        }
        tx = best.nx; ty = best.ny;
      } else if (food.length) {
        let pick = null, bestScore = -Infinity;
        for (const e of food) {
          const d = Math.hypot(e.x - p.x, e.y - p.y);
          // Something sitting next to a predator is not worth the trip.
          let risk = 0;
          for (const s of scary) if (Math.hypot(s.x - e.x, s.y - e.y) < 90) risk += 1;
          const sc = S.speciesValue(e.sp) / (d + 45) - risk * 0.09;
          if (sc > bestScore) { bestScore = sc; pick = e; }
        }
        tx = pick.x + rng.float(-prof.jitter, prof.jitter);
        ty = pick.y + rng.float(-prof.jitter, prof.jitter);
      } else {
        tx = rng.float(30, S.LW - 30);
        ty = rng.float(30, S.LH - 30);
      }

      G.input.tx = Math.max(0, Math.min(S.LW, tx));
      G.input.ty = Math.max(0, Math.min(S.LH, ty));
    },
  };
}

// The control. Never touches the controls, so it stands where it hatched.
function idleBot() {
  return { name: "idle", step() {} };
}

// Run one level to a conclusion and hand back the result plus the things the
// balance assertions care about that the result object does not carry.
function play(S, level, botName, seed, opts = {}) {
  const G = S.Game;
  const mode = opts.mode || "campaign";
  G.start({ mode, level, seed });
  const bot = botName === "idle" ? idleBot() : makeBot(S, botName, seed);
  const dt = 1 / 60;
  const capSeconds = opts.cap || (mode === "feast" ? 900 : (level.time + 5));
  let frames = 0, minEdible = Infinity, hungryFrames = 0;

  while (G.running && frames < capSeconds * 60) {
    bot.step(dt);
    G.update(dt);
    if (frames % 15 === 0) {
      const n = G.edibleCount();
      if (n < minEdible) minEdible = n;
      if (n === 0) hungryFrames++;
    }
    frames++;
  }
  const res = G.result || G.end(false, "cap");
  return { ...res, frames, seconds: frames / 60, minEdible, hungryFrames };
}

module.exports = { PROFILES, makeBot, idleBot, play };
