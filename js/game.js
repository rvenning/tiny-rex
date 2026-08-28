// The simulation. No DOM, no canvas, no Math.random — every random choice comes
// from a seeded RNG in js/rng.js, so tests/bot.test.js can replay a whole hunt
// exactly and a level that suddenly takes ten seconds longer is a real balance
// change rather than an unlucky afternoon.
//
// The arena is a fixed logical field and the camera never moves. Everything is
// on screen all of the time, on purpose: the game is one judgement made over
// and over — is that smaller than me? — and you cannot judge what you cannot
// see. js/render.js scales this field to whatever screen it lands on, so every
// device plays the identical valley and the family leaderboard is fair.

const LW = 360;             // arena width, logical px
const LH = 560;             // arena height

const EASE = 9;             // how hard the player chases your finger (the feel)
const SPAWN_CLEAR = 110;    // nothing appears closer than this to you
const INVULN = 2.2;         // seconds of grace after a scare
const SCARE_OFF = 2.6;      // seconds the thing that got you runs away for
const BELLY_LOST = 0.25;    // fraction of the current mouthful a scare costs
const SPIKE_COST = 1;       // one belly point for biting something armoured
const FOOD_FLOOR = 3;       // never fewer edible things than this in the valley

// Nothing hunts you forever. A predator chases for HUNT_TIME and then loses
// interest for HUNT_REST, and that is not politeness — without it a big
// aggressive dinosaur with a 170px nose simply owns the arena, and there is
// never a moment free to go and eat something. The bots found it: with the
// chase running unbroken, Thunder Basin was unwinnable by every bot including
// the perfect one. It also gives the mechanic a shape a child can say out loud:
// keep away from it for a few seconds and it gives up on you.
const HUNT_TIME = 4.5;
const HUNT_REST = 3.6;
// And the bigger the hunter, the longer it needs afterwards. A Tyrannosaurus is
// an enormous animal and does not sprint about all afternoon — which is lucky,
// because every level the guardrail bot could not clear had an apex predator in
// it, and this is the one change that fixed all four at once without making
// anything smaller any easier.
const HUNT_REST_PER_TIER = 0.19;

const Game = {
  /* ------------------------------- state -------------------------------- */
  running: false, paused: false,
  mode: "campaign",         // "campaign" | "feast"
  level: null, rng: null,
  T: 0, timeLeft: 0, wave: 0,
  hearts: 3, score: 0, valueEaten: 0, catches: 0, scares: 0,
  maxTier: MAX_TIER, beastEaten: false, beastEnt: null,
  ents: [], nextId: 1, spawnAt: {}, met: {},
  q: [],                    // event queue, drained by the renderer every frame
  player: null,
  input: { tx: LW / 2, ty: LH / 2 },

  /* ------------------------------- start -------------------------------- */
  start(cfg) {
    const level = cfg.level || null;
    this.mode = cfg.mode || "campaign";
    this.level = level;
    this.rng = RNG.make(cfg.seed >>> 0 || 1);
    this.T = 0; this.wave = 0;
    this.hearts = 3; this.score = 0; this.valueEaten = 0;
    this.catches = 0; this.scares = 0;
    this.beastEaten = false; this.beastEnt = null;
    this.ents = []; this.nextId = 1; this.spawnAt = {}; this.met = {};
    this.q = []; this.result = null;

    const feast = this.mode === "feast";
    const start = feast ? FEAST.start : level.start;
    this.maxTier = feast ? FEAST.maxTier : level.target;
    this.timeLeft = feast ? 0 : level.time;

    this.player = {
      x: LW / 2, y: LH * 0.66, vxSign: 1,
      tier: start, startTier: start, belly: 0,
      r: PLAYER_R[start], speed: PLAYER_SPEED[start],
      invuln: 0, chomp: 0,
    };
    this.input.tx = this.player.x;
    this.input.ty = this.player.y;

    // Fill the valley before the first frame, so it never opens empty.
    for (let i = 0; i < this.plantWant(); i++) this.spawnPlant(true);
    for (const [id, n] of this.creatureWants()) {
      for (let i = 0; i < n; i++) this.spawnCreature(id, true);
    }
    if (!feast && level.beast) {
      this.beastEnt = this.spawnCreature(level.beast.id, true, {
        beast: true, name: level.beast.name,
      });
    }

    this.running = true;
    this.paused = false;
    this.emit({ type: "start" });
  },

  emit(e) { this.q.push(e); },

  /* ------------------------- what should be alive ------------------------ */
  plantWant() { return this.mode === "feast" ? FEAST.plants : this.level.plants; },

  // Steady-state creature counts. In the Endless Feast every wave so far is
  // stacked on top of the last, so the valley thickens rather than swapping.
  creatureWants() {
    if (this.mode !== "feast") return this.level.spawn;
    const want = {};
    const last = FEAST.waves.length - 1;
    const upto = Math.min(this.wave, last);
    for (let w = 0; w <= upto; w++) {
      for (const [id, n] of FEAST.waves[w]) want[id] = (want[id] || 0) + n;
    }
    // Past the last authored wave the valley keeps thickening rather than
    // settling, or a good player simply never comes to the end of the Feast —
    // the bots sat at the harness cap for seven minutes and were still climbing.
    if (this.wave > last) {
      const mult = 1 + FEAST.thicken * (this.wave - last);
      for (const id of Object.keys(want)) want[id] = Math.round(want[id] * mult);
    }
    return Object.entries(want);
  },

  countOf(id) {
    let n = 0;
    for (const e of this.ents) if (!e.dead && e.sp.id === id) n++;
    return n;
  },

  // Somewhere in the arena that is not on top of the player. Tried a handful of
  // times and then given up on — a spawn that cannot find room is skipped, not
  // forced next to her face.
  findSpot(r, immediate) {
    const p = this.player;
    for (let i = 0; i < 14; i++) {
      const x = this.rng.float(r + 6, LW - r - 6);
      const y = this.rng.float(r + 6, LH - r - 6);
      const clear = immediate ? SPAWN_CLEAR * 0.8 : SPAWN_CLEAR;
      if (Math.hypot(x - p.x, y - p.y) > clear + r) return { x, y };
    }
    return null;
  },

  spawnPlant(immediate) {
    const sp = this.rng.chance(0.45) ? species("berries") : species("fern");
    const at = this.findSpot(PLANT_R, immediate);
    if (!at) return null;
    const e = {
      id: this.nextId++, sp, kind: "plant", x: at.x, y: at.y, r: PLANT_R,
      dir: this.rng.angle(), vx: 0, vy: 0, wanderT: 0, flee: 0, dead: false,
      sway: this.rng.float(0, 6.28),
    };
    this.ents.push(e);
    return e;
  },

  spawnCreature(id, immediate, extra) {
    const sp = species(id);
    const r = speciesRadius(sp);
    const at = this.findSpot(r, immediate);
    if (!at) return null;
    const e = {
      id: this.nextId++, sp, kind: "creature", x: at.x, y: at.y, r,
      dir: this.rng.angle(), vx: 0, vy: 0, face: 1,
      wanderT: this.rng.float(0.6, 2.4), flee: 0, nope: 0, dead: false,
      step: this.rng.float(0, 6.28),
      beast: false, name: null, sprintT: BEAST_STAMINA, restT: 0,
      huntT: HUNT_TIME, boredT: 0,
      ...(extra || {}),
    };
    this.met[id] = 1;
    this.ents.push(e);
    return e;
  },

  /* ------------------------------- update -------------------------------- */
  update(dt) {
    if (!this.running || this.paused) return;
    dt = Math.min(0.05, dt);
    this.T += dt;

    const p = this.player;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.chomp > 0) p.chomp -= dt;

    this.movePlayer(dt);
    for (const e of this.ents) if (!e.dead) this.moveEntity(e, dt);
    this.collide();
    this.restock(dt);

    if (this.mode === "feast") this.feastTick(dt);
    else {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; return this.end(false, "time"); }
      if (p.tier >= this.level.target && (!this.level.beast || this.beastEaten)) {
        return this.end(true, "grown");
      }
    }
  },

  movePlayer(dt) {
    const p = this.player;
    const dx = this.input.tx - p.x, dy = this.input.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) return;
    // Ease for the feel, cap for the balance: a small correction decays over
    // several frames instead of snapping, and a full-arena sweep runs at the
    // cap right up until it arrives.
    const k = Math.min(1, dt * EASE);
    let mx = dx * k, my = dy * k;
    const m = Math.hypot(mx, my), cap = p.speed * dt;
    if (m > cap) { mx = (mx / m) * cap; my = (my / m) * cap; }
    p.x = GK.util.clamp(p.x + mx, p.r, LW - p.r);
    p.y = GK.util.clamp(p.y + my, p.r, LH - p.r);
    if (Math.abs(mx) > 0.05) p.vxSign = mx < 0 ? -1 : 1;
  },

  moveEntity(e, dt) {
    if (e.kind === "plant") return;
    if (e.nope > 0) e.nope -= dt;
    if (e.boredT > 0) e.boredT -= dt;
    const p = this.player, sp = e.sp;
    const dx = p.x - e.x, dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;

    let speed = sp.speed, wantX = 0, wantY = 0, engaged = true;
    // A beast that has been out-grown always bolts, whatever its species would
    // normally do. Three of the four finales are built on animals with a natural
    // caution of 0.2 — a Triceratops does not run from much — so without this
    // floor the promised "now it is his turn to run" was a 0.9-second walk up to
    // a stationary meal, and the whole stamina cycle never came into play.
    const caution = e.beast ? Math.max(0.9, sp.caution) : sp.caution;

    if (e.flee > 0) {
      // Freshly scared off (or a beast that has been out-grown): run, whatever
      // the usual disposition.
      e.flee -= dt;
      wantX = -dx / dist; wantY = -dy / dist;
      speed = sp.speed * (e.beast ? 1 : 0.95);
    } else if (sp.tier > p.tier && sp.aggression > 0 && e.boredT <= 0 &&
               dist < SENSE * (0.7 + sp.aggression * 0.6)) {
      // It out-sizes her and it has noticed — for as long as it can be bothered.
      wantX = dx / dist; wantY = dy / dist;
      speed = sp.speed * (0.75 + 0.25 * sp.aggression);
      e.huntT -= dt;
      if (e.huntT <= 0) {
        e.huntT = HUNT_TIME;
        e.boredT = HUNT_REST * (1 + HUNT_REST_PER_TIER * Math.max(0, sp.tier - 3));
      }
    } else if (sp.tier < p.tier && caution > 0 &&
               dist < (e.beast ? BEAST_FLEE_RANGE : SENSE * caution) + p.r) {
      // She out-sizes it and it would rather be elsewhere.
      wantX = -dx / dist; wantY = -dy / dist;
      speed = sp.speed * (0.7 + 0.3 * caution);
    } else {
      // Nothing doing: amble about.
      engaged = false;
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.dir += this.rng.float(-1.5, 1.5);
        e.wanderT = this.rng.float(1.2, 3.2);
      }
      wantX = Math.cos(e.dir); wantY = Math.sin(e.dir);
      speed = sp.speed * 0.42;
    }

    // A beast can out-run anything alive, in bursts — hunting you OR running
    // from you. Then it has to blow, and that is the window. "Keep after it
    // until it puffs out" is a plan a five-year-old can actually carry out;
    // "be faster than it" is not.
    if (e.beast && engaged) {
      const ref = PLAYER_SPEED[p.tier];      // measured against HER, not itself
      if (e.restT > 0) { e.restT -= dt; speed = ref * BEAST_TIRED; }
      else {
        speed = ref * BEAST_SPRINT;
        e.sprintT -= dt;
        if (e.sprintT <= 0) { e.sprintT = BEAST_STAMINA; e.restT = BEAST_REST; }
      }
    }

    e.x += wantX * speed * dt;
    e.y += wantY * speed * dt;
    if (Math.abs(wantX) > 0.02) e.face = wantX < 0 ? -1 : 1;
    e.step += speed * dt * 0.12;

    // Bounce off the valley walls, and turn the wander heading with it so a
    // creature does not grind along an edge for the rest of the level.
    if (e.x < e.r) { e.x = e.r; e.dir = Math.PI - e.dir; }
    if (e.x > LW - e.r) { e.x = LW - e.r; e.dir = Math.PI - e.dir; }
    if (e.y < e.r) { e.y = e.r; e.dir = -e.dir; }
    if (e.y > LH - e.r) { e.y = LH - e.r; e.dir = -e.dir; }
  },

  /* ----------------------------- collisions ------------------------------ */
  collide() {
    const p = this.player;
    for (const e of this.ents) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const rel = relation(e.sp, p.tier);

      if (rel === "food") {
        if (d < p.r + e.r * 0.7) this.eat(e);
      } else if (rel === "danger") {
        if (d < e.r + p.r * 0.55) this.scare(e, dx, dy, d);
      } else {
        // Same size, or armoured: a nudge. Nothing here can cost a heart.
        const touch = p.r + e.r * 0.8;
        if (d < touch) {
          const push = (touch - d) + 0.6;
          e.x = GK.util.clamp(e.x + (dx / d) * push, e.r, LW - e.r);
          e.y = GK.util.clamp(e.y + (dy / d) * push, e.r, LH - e.r);
          if (rel === "spiky") {
            if (e.nope > 0) continue;
            e.nope = 0.9;
            p.belly = Math.max(0, p.belly - SPIKE_COST);
            this.emit({ type: "nope", x: e.x, y: e.y, sp: e.sp });
          }
        }
      }
    }
  },

  eat(e) {
    const p = this.player, val = speciesValue(e.sp);
    e.dead = true;
    this.valueEaten += val;
    this.catches++;
    this.score += val * 10;
    p.belly += val;
    p.chomp = 0.22;
    if (e.beast) { this.beastEaten = true; this.beastEnt = null; }
    this.emit({ type: "eat", x: e.x, y: e.y, sp: e.sp, value: val, beast: !!e.beast, name: e.name });
    this.grow();
  },

  grow() {
    const p = this.player;
    while (p.tier < this.maxTier && p.belly >= NEED[p.tier]) {
      p.belly -= NEED[p.tier];
      p.tier++;
      p.r = PLAYER_R[p.tier];
      p.speed = PLAYER_SPEED[p.tier];
      this.score += 120;
      this.emit({ type: "grow", tier: p.tier, x: p.x, y: p.y });
    }
    if (p.tier >= this.maxTier) p.belly = Math.min(p.belly, NEED[this.maxTier - 1]);
  },

  // Getting caught is meant to be a fright, not a punishment: a heart, a bit of
  // the mouthful you were working on, and the thing that did it bolts. You keep
  // your size — dropping a tier here would undo minutes of work and is exactly
  // the kind of thing that makes a five-year-old put the iPad down.
  scare(e, dx, dy, d) {
    const p = this.player;
    if (p.invuln > 0) return;
    this.hearts--;
    this.scares++;
    p.belly = Math.max(0, p.belly - Math.ceil(p.belly * BELLY_LOST));
    p.invuln = INVULN;
    e.flee = SCARE_OFF;
    const push = e.r + p.r + 12 - d;
    e.x = GK.util.clamp(e.x + (dx / d) * push, e.r, LW - e.r);
    e.y = GK.util.clamp(e.y + (dy / d) * push, e.r, LH - e.r);
    this.emit({ type: "hurt", x: p.x, y: p.y, sp: e.sp, hearts: this.hearts });
    if (this.hearts <= 0) this.end(false, "caught");
  },

  /* ------------------------------ restocking ----------------------------- */
  // Eat something and another one wanders in a few seconds later, so a level
  // never runs dry. The FOOD_FLOOR check underneath it is the real promise:
  // whatever size you are, there is always something you can safely eat.
  restock(dt) {
    const at = this.spawnAt;
    if ((at.__plant || 0) <= this.T) {
      if (this.plantCount() < this.plantWant()) this.spawnPlant(false);
      at.__plant = this.T + this.rng.float(1.4, 3.4);
    }
    for (const [id, n] of this.creatureWants()) {
      if ((at[id] || 0) > this.T) continue;
      if (this.countOf(id) >= n) continue;
      this.spawnCreature(id, false);
      at[id] = this.T + this.rng.float(3, 7);
    }
    if (this.edibleCount() < FOOD_FLOOR) this.spawnPlant(false);
  },

  plantCount() {
    let n = 0;
    for (const e of this.ents) if (!e.dead && e.kind === "plant") n++;
    return n;
  },

  edibleCount() {
    const t = this.player.tier;
    let n = 0;
    for (const e of this.ents) if (!e.dead && relation(e.sp, t) === "food") n++;
    return n;
  },

  /* --------------------------- the Endless Feast ------------------------- */
  feastTick(dt) {
    const p = this.player;
    const w = Math.floor(this.T / FEAST.waveEvery);
    if (w !== this.wave) { this.wave = w; this.emit({ type: "wave", wave: w }); }
    // Hunger is a fraction of the CURRENT growth bar per second, not a flat
    // rate. A flat rate is measured against one tier's economy and is wrong at
    // every other: at 0.85/s a hatchling burned twice what beetles could pay,
    // so the Feast ended at tier 1 for anyone who was not already good at it.
    // As a fraction it scales with the food that tier can reach, and only the
    // wave ramp makes it bite.
    const bar = NEED[Math.min(p.tier, NEED.length - 1)];
    p.belly -= bar * (FEAST.hunger + FEAST.hungerPerWave * this.wave) * dt;
    if (p.belly < 0) {
      if (p.tier > 1) {
        p.tier--;
        p.r = PLAYER_R[p.tier];
        p.speed = PLAYER_SPEED[p.tier];
        p.belly = NEED[p.tier] * 0.6;
        this.emit({ type: "shrink", tier: p.tier, x: p.x, y: p.y });
      } else {
        p.belly = 0;
      }
    }
  },

  /* -------------------------------- ending ------------------------------- */
  end(win, reason) {
    if (!this.running) return;
    this.running = false;
    const p = this.player;
    const stars = win ? (this.hearts >= 3 ? 3 : this.hearts === 2 ? 2 : 1) : 0;
    let score = this.score;
    if (this.mode === "campaign" && win) score += 200 * this.hearts;
    const res = {
      mode: this.mode,
      levelIdx: this.level ? this.level.idx : -1,
      win, reason, stars, score,
      tier: p.tier, startTier: p.startTier, hearts: Math.max(0, this.hearts),
      catches: this.catches, scares: this.scares, valueEaten: this.valueEaten,
      wave: this.wave, timeLeft: Math.max(0, Math.round(this.timeLeft)),
      elapsed: Math.round(this.T),
      met: { ...this.met },
      beast: this.level && this.level.beast ? this.level.beast.name : null,
      beastEaten: this.beastEaten,
    };
    this.result = res;
    this.emit({ type: "end", result: res });
    return res;
  },

  quit() {
    if (!this.running) return null;
    this.paused = false;
    return this.end(false, "quit");
  },

  /* ------------------------- read-outs for the HUD ----------------------- */
  bellyFrac() {
    const p = this.player;
    if (p.tier >= this.maxTier) return 1;
    return GK.util.clamp(p.belly / NEED[p.tier], 0, 1);
  },
  stageName() { return STAGE_NAME[this.player.tier]; },
};
