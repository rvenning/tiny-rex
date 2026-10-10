/** Creature behaviour: prey stalking, telegraphed attacks of every archetype, boss phases, projectiles, status ticks.
 *  Operates on an Adventure instance but owns no state of its own. */
import { attacksOf, type AttackDef, type Point } from "./data";
import { enemyDamage } from "../rpg/progression";
import type { Adventure } from "./sim";
import type { Actor, ActorState, Shot } from "./sim-types";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const heading = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);

function setState(a: Actor, s: ActorState, t = 0) {
  a.state = s;
  a.t = t;
  a.age = 0;
}
function goto(sim: Adventure, a: Actor, tx: number, ty: number, speed: number, dt: number) {
  const h = Math.atan2(ty - a.y, tx - a.x);
  a.face = h;
  const slow = a.fx.slow ? 1 - a.fx.slow.m : 1;
  const haste = a.fx.haste ? 1.3 : 1;
  const sp = speed * a.speedMul * slow * haste;
  a.speedNow = sp;
  sim.moveBody(a, Math.cos(h) * sp * dt, Math.sin(h) * sp * dt, a.spec.r);
}
const attackers = (sim: Adventure) => sim.actors.filter((a) => a.state === "windup" || a.state === "strike").length;
export const damageOf = (a: Actor, atk: AttackDef) => enemyDamage(atk.damage, a.level) * (a.elite ? 1.25 : 1);

// ------------------------------------------------------------------ per-actor tick
export function updateActor(sim: Adventure, a: Actor, dt: number) {
  if (a.escort) return;
  const p = sim.player;
  a.flash = Math.max(0, a.flash - dt);
  a.cooldown = Math.max(0, a.cooldown - dt);
  a.provoked = Math.max(0, a.provoked - dt);
  a.guard = Math.max(0, a.guard - dt);
  a.speedNow = 0;
  for (const k of Object.keys(a.acd)) a.acd[k] = Math.max(0, a.acd[k] - dt);
  if (a.state === "dead") {
    if (sim.time >= a.respawnAt && dist(a.home, p) > 14) {
      a.state = a.spec.archetype === "ambusher" ? "dormant" : "idle";
      a.hp = a.maxHp;
      a.x = a.home.x;
      a.y = a.home.y;
      a.t = 1;
      a.unaware = true;
      a.fx = {};
    }
    return;
  }
  a.age += dt;
  a.t -= dt;
  const d = dist(a, p);
  if (d > 70) return; // far from the player: asleep (bounded AI cost)
  if (tickStatus(sim, a, dt)) return;
  // knockback glide
  if (Math.abs(a.kvx) + Math.abs(a.kvy) > 0.05) {
    sim.moveBody(a, a.kvx * dt, a.kvy * dt, a.spec.r);
    const k = Math.exp(-9 * dt);
    a.kvx *= k;
    a.kvy *= k;
  }
  if (a.npc) return updateNpc(sim, a, dt, d);
  if (a.fx.stun) {
    if (a.state !== "stagger" && a.state !== "dormant") setState(a, "stagger", a.fx.stun.t);
    return;
  }
  if (!sim.save.studied.includes(a.spec.id) && d < 7 && a.state !== "dormant" && sim.world.grid.clearLine(a.x, a.y, p.x, p.y)) {
    sim.save.studied.push(a.spec.id);
    sim.emit("discovery", a, { text: `${a.spec.name} · added to your book` });
  }
  if (a.spec.role === "prey") return updatePrey(sim, a, dt, d);
  if (a.spec.archetype === "neutral" && a.provoked <= 0 && !isAttacking(a)) return updateGrazer(sim, a, dt);
  if (a.spec.role === "armour" && a.spec.archetype !== "tank" && a.provoked <= 0 && !isAttacking(a) && a.state !== "stagger") return updateGrazer(sim, a, dt);
  updatePredator(sim, a, dt, d);
}
const isAttacking = (a: Actor) => a.state === "windup" || a.state === "strike" || a.state === "recover";

/** DOTs, slow, mark, haste timers. Returns true if the actor died. */
function tickStatus(sim: Adventure, a: Actor, dt: number): boolean {
  const fx = a.fx;
  let dot = 0;
  if (fx.bleed) {
    dot += fx.bleed.dps * fx.bleed.stacks * dt;
    fx.bleed.t -= dt;
    if (fx.bleed.t <= 0) delete fx.bleed;
  }
  if (fx.poison) {
    dot += fx.poison.dps * fx.poison.stacks * dt;
    fx.poison.t -= dt;
    if (fx.poison.t <= 0) delete fx.poison;
  }
  if (dot > 0) {
    a.hp -= dot;
    a.dotAcc += dot;
    // accumulate tick damage into one readable number a second
    if (a.dotAcc >= Math.max(2, a.maxHp * 0.01) && sim.time - a.dotAt > 0.9) {
      sim.emit("dmg", a, { amount: Math.round(a.dotAcc), actor: a.id, kind: "dot" });
      a.dotAcc = 0;
      a.dotAt = sim.time;
    }
    if (a.hp <= 0) {
      sim.kill(a, false);
      return true;
    }
  }
  for (const k of ["slow", "mark", "stun", "haste"] as const) {
    const s = fx[k];
    if (s) {
      s.t -= dt;
      if (s.t <= 0) delete fx[k];
    }
  }
  return false;
}

function updateNpc(sim: Adventure, a: Actor, dt: number, d: number) {
  if (d < 6 && a.state !== "stagger") a.face = heading(a, sim.player);
  else if (a.t <= 0) {
    a.wander = sim.rng.range(0, Math.PI * 2);
    a.t = sim.rng.range(2, 5);
  }
  if (a.state === "idle" && d >= 6 && dist(a.home, a) < 2.5 && sim.rng.next() < 0.5 * dt) goto(sim, a, a.x + Math.cos(a.wander), a.y + Math.sin(a.wander), a.spec.speed * 0.25, dt);
}

function updateGrazer(sim: Adventure, a: Actor, dt: number) {
  if (a.t <= 0) {
    if (a.state === "feed" || a.state === "stagger" || a.state === "idle") {
      a.wander = sim.rng.range(0, Math.PI * 2);
      setState(a, "return", sim.rng.range(1, 2.5));
    } else setState(a, "feed", sim.rng.range(2, 5));
  }
  if (a.state === "return") {
    const tx = a.x + Math.cos(a.wander) * 3,
      ty = a.y + Math.sin(a.wander) * 3;
    if (dist(a.home, { x: tx, y: ty }) < 8) goto(sim, a, tx, ty, a.spec.speed * 0.4, dt);
  }
}

function updatePrey(sim: Adventure, a: Actor, dt: number, d: number) {
  const p = sim.player;
  const spec = a.spec;
  // Stalking: creeping shrinks the distance at which prey notices you; running is loud.
  const loud = Math.min(1, p.speedNow / (sim.stats.speed * 0.9));
  const noticeR = spec.sense * (0.35 + 0.65 * loud) * (a.state === "feed" ? 0.75 : 1) * (sim.safe ? 0.3 : 1);
  if (a.state !== "flee") {
    if (d < noticeR) a.alert = Math.min(1, a.alert + dt * (d < noticeR * 0.55 ? 2.4 : 1.1));
    else a.alert = Math.max(0, a.alert - dt * 0.6);
    if (a.alert >= 1) {
      setState(a, "flee", sim.rng.range(2.2, 3.4));
      a.unaware = false;
      sim.emit("notice", a, { actor: a.id });
    }
  }
  if (a.state === "flee") {
    const away = heading(p, a) + Math.sin(a.age * 6 + a.id) * 0.5;
    a.face = away;
    a.speedNow = spec.speed * (spec.speed > 3 ? 1.05 : 1.4);
    sim.moveBody(a, Math.cos(away) * a.speedNow * dt, Math.sin(away) * a.speedNow * dt, spec.r);
    if (a.t <= 0) {
      a.alert = 0.3;
      setState(a, "idle", sim.rng.range(1, 2));
    }
    return;
  }
  if (a.t <= 0) {
    if (a.state === "feed") {
      a.wander = a.face + sim.rng.range(-1.6, 1.6);
      setState(a, "idle", sim.rng.range(0.9, 2.2));
    } else setState(a, "feed", sim.rng.range(1.4, 3.4));
  }
  if (a.state === "idle") {
    const tx = a.x + Math.cos(a.wander) * 2,
      ty = a.y + Math.sin(a.wander) * 2;
    if (dist(a.home, { x: tx, y: ty }) < 9) goto(sim, a, tx, ty, spec.speed * 0.45, dt);
    else a.wander = heading(a, a.home);
  }
}

// ------------------------------------------------------------------ predators
function currentAttacks(a: Actor): AttackDef[] {
  const all = attacksOf(a.spec);
  const phase = a.spec.boss?.phases[a.phase];
  if (!phase || !phase.attacks.length) return all;
  return all.filter((x) => phase.attacks.includes(x.id));
}
function pickAttack(sim: Adventure, a: Actor, d: number): AttackDef | undefined {
  const options = currentAttacks(a).filter((x) => {
    if (x.kind === "summon" && sim.actors.filter((o) => o.summoned && o.state !== "dead").length >= 6) return false;
    if (x.kind === "rally" && !sim.actors.some((o) => o !== a && o.state !== "dead" && !o.npc && o.spec.role !== "prey" && dist(o, a) < x.reach && o.hp < o.maxHp * 0.9) && !sim.actors.some((o) => o !== a && o.state !== "dead" && !o.npc && o.spec.role !== "prey" && dist(o, a) < x.reach)) return false;
    if ((a.acd[x.id] ?? 0) > 0) return false;
    const [lo, hi] = x.range ?? [0, (x.reach ?? 4) * 1.05];
    return d >= lo && d <= hi;
  });
  if (!options.length) return undefined;
  const direct = options.filter((x) => (x.weight ?? 1) > 0);
  const pool = direct.length ? direct : options;
  const total = pool.reduce((n, x) => n + (x.weight ?? 1), 0);
  let r = sim.rng.next() * total;
  for (const x of pool) {
    r -= x.weight ?? 1;
    if (r <= 0) return x;
  }
  return pool[0];
}

function updatePredator(sim: Adventure, a: Actor, dt: number, d: number) {
  const p = sim.player,
    spec = a.spec;
  const attacks = attacksOf(spec);
  const decoy = sim.decoys.find((x) => dist(x, a) < 16);
  const target: Point = decoy ?? p;
  const dT = decoy ? dist(a, decoy) : d;
  const hostile = !sim.safe && p.hp > 0 && (spec.role !== "armour" || a.provoked > 0 || spec.archetype === "tank");
  const boss = spec.boss;
  const leash = boss ? boss.arena : a.sentinel ? 22 : 30;
  const maxReach = Math.max(4, ...attacks.map((x) => x.range?.[1] ?? x.reach));
  // leave the fight if the player escapes or reaches safety
  if (a.state !== "return" && a.state !== "idle" && a.state !== "recover" && a.state !== "stagger" && a.state !== "windup" && a.state !== "strike" && a.state !== "roar" && a.state !== "dormant") {
    if (!hostile || d > spec.sense * 2.2 || dist(a, a.home) > leash) setState(a, "return", 6);
  }
  switch (a.state) {
    case "dormant": {
      // ambushers lie still until the player is almost on them; a rustle gives a fair warning beat
      if (hostile && d < spec.sense && !sim.player.speedNow && d < spec.sense * 0.6) {
        a.face = heading(a, p);
        setState(a, "alert", 0.7 * sim.diff.tell);
        a.unaware = false;
        sim.emit("notice", a, { actor: a.id, text: "Something rustles in the reeds!" });
      } else if (hostile && d < spec.sense * 0.8) {
        a.face = heading(a, p);
        setState(a, "alert", 0.7 * sim.diff.tell);
        a.unaware = false;
        sim.emit("notice", a, { actor: a.id, text: "Something rustles in the reeds!" });
      }
      break;
    }
    case "idle": {
      if (a.t <= 0) {
        a.wander = sim.rng.range(0, Math.PI * 2);
        a.t = sim.rng.range(1.5, 3.5);
      }
      const tx = a.x + Math.cos(a.wander) * 1.5,
        ty = a.y + Math.sin(a.wander) * 1.5;
      if (dist(a.home, { x: tx, y: ty }) < 3.5) goto(sim, a, tx, ty, spec.speed * 0.2, dt);
      else a.wander = heading(a, a.home);
      if (hostile && d < spec.sense && sim.world.grid.clearLine(a.x, a.y, p.x, p.y)) {
        a.face = heading(a, p);
        a.unaware = false;
        setState(a, "alert", 0.55);
        sim.emit("notice", a, { actor: a.id });
        // a pack answers together
        if (a.spec.archetype === "swarm") for (const o of sim.actorsNear(a, 7)) if (o !== a && o.spec.archetype === "swarm" && o.state === "idle") setState(o, "alert", 0.4 + sim.rng.range(0, 0.3));
      }
      break;
    }
    case "alert":
      a.face = heading(a, target);
      if (a.t <= 0) setState(a, "stalk", 0);
      break;
    case "roar":
      a.face = heading(a, p);
      if (a.t <= 0) setState(a, "stalk", 0);
      break;
    case "stalk":
      stalk(sim, a, dt, dT, target, attacks, maxReach);
      break;
    case "windup":
      windup(sim, a, dt, target);
      break;
    case "strike":
      strike(sim, a, dt, d);
      break;
    case "recover":
    case "stagger":
      if (a.t <= 0) setState(a, hostile ? "stalk" : "return", 4);
      break;
    case "return": {
      goto(sim, a, a.home.x, a.home.y, spec.speed * 0.55, dt);
      a.hp = Math.min(a.maxHp, a.hp + dt * (boss ? a.maxHp * 0.04 : 6));
      if (boss && dist(a, a.home) < 1.2 && a.hp >= a.maxHp) {
        a.phase = 0;
        a.speedMul = 1;
        a.cdMul = 1;
      }
      if (dist(a, a.home) < 1.2) setState(a, "idle", 1.5);
      else if (a.t <= 0 && hostile && d < spec.sense * 0.8 && dist(a, a.home) < leash * 0.6) setState(a, "alert", 0.4);
      break;
    }
    default:
      break;
  }
}

function stalk(sim: Adventure, a: Actor, dt: number, dT: number, target: Point, attacks: AttackDef[], maxReach: number) {
  const spec = a.spec;
  a.face = heading(a, target);
  const melee = attacks.filter((x) => x.kind !== "spit" && x.kind !== "volley" && x.kind !== "summon" && x.kind !== "rally");
  const meleeReach = Math.max(3, ...melee.map((x) => (x.kind === "slam" ? 3 : x.reach)));
  const keep = spec.keepAway ?? 0;
  if (keep > 0) {
    // ranged / support: hold a preferred range, back away when crowded, circle when settled
    if (dT < keep - 1.5) goto(sim, a, a.x - Math.cos(a.face) * 3, a.y - Math.sin(a.face) * 3, spec.speed * 0.8, dt);
    else if (dT > keep + 2.5 && spec.archetype !== "support") goto(sim, a, target.x, target.y, spec.speed * 0.8, dt);
    else strafe(sim, a, dt, 0.45);
    if (spec.archetype === "support") {
      // stay close to the strongest ally instead of the player
      const ally = sim.actors.filter((o) => o !== a && o.state !== "dead" && !o.npc && o.spec.role !== "prey" && dist(o, a) < 14).sort((x, y) => y.maxHp - x.maxHp)[0];
      if (ally && dist(ally, a) > 6) goto(sim, a, ally.x, ally.y, spec.speed * 0.7, dt);
    }
  } else {
    const want = Math.min(meleeReach, maxReach) * 0.85;
    if (dT > want + 0.8) goto(sim, a, target.x, target.y, spec.speed * 0.8, dt);
    else if (dT < want * 0.55) goto(sim, a, a.x - Math.cos(a.face) * 2, a.y - Math.sin(a.face) * 2, spec.speed * 0.5, dt);
    else strafe(sim, a, dt, 0.45);
  }
  const rival = a.rival;
  const limit = (rival ? 2 : 1) + (spec.role === "sweeper" ? 0 : 1) + (spec.archetype === "swarm" ? 2 : 0);
  if (a.cooldown > 0 || attackers(sim) >= limit) return;
  const atk = pickAttack(sim, a, dT);
  if (!atk) return;
  if (rival === "marsh-pack" && sim.actors.some((o) => o !== a && o.rival === a.rival && (o.state === "windup" || o.state === "strike"))) return;
  if (atk.kind !== "summon" && atk.kind !== "rally" && !sim.world.grid.clearLine(a.x, a.y, sim.player.x, sim.player.y)) return;
  startAttack(sim, a, atk, target);
}
function strafe(sim: Adventure, a: Actor, dt: number, k: number) {
  const side = a.face + (Math.PI / 2) * a.strafe;
  goto(sim, a, a.x + Math.cos(side), a.y + Math.sin(side), a.spec.speed * k, dt);
  a.face = heading(a, sim.player);
  if (sim.rng.next() < dt * 0.25) a.strafe *= -1;
}

function startAttack(sim: Adventure, a: Actor, atk: AttackDef, target: Point) {
  a.atk = atk;
  a.dir = heading(a, target);
  a.aim = { x: target.x, y: target.y };
  a.hit = false;
  a.count++;
  setState(a, "windup", atk.windup * sim.diff.tell);
  sim.emit("tell", a, { dir: a.dir, actor: a.id, text: atk.name, kind: atk.kind, radius: atk.reach });
}

function windup(sim: Adventure, a: Actor, dt: number, target: Point) {
  const atk = a.atk;
  if (!atk) return setState(a, "stalk", 0);
  const total = atk.windup * sim.diff.tell;
  // track for the first part of the windup, then commit: the lane locks before the strike
  if (a.age < total * 0.55 && a.t > 0.25) {
    if (atk.kind === "slam" || atk.kind === "volley" || atk.kind === "spit") {
      a.aim = { x: target.x, y: target.y };
      a.dir = heading(a, target);
    } else {
      const h = heading(a, target);
      a.dir += Math.max(-5 * dt, Math.min(5 * dt, angleDelta(h, a.dir)));
    }
  }
  a.face = a.dir;
  if (a.t > 0) return;
  setState(a, "strike", atk.strike);
  a.hit = false;
  const e = sim.player;
  const dmg = damageOf(a, atk);
  switch (atk.kind) {
    case "sweep": {
      const dd = dist(a, e) - sim.radius;
      if (dd < atk.reach && Math.abs(angleDelta(heading(a, e), a.dir)) < (atk.arc ?? 1.5)) {
        a.hit = true;
        sim.hurt(dmg, a, { knock: atk.knock });
      }
      sim.emit("slam", a, { kind: "sweep", dir: a.dir, radius: atk.reach });
      break;
    }
    case "slam": {
      if (atk.id === "leap") break; // resolved on landing
      const at = a.aim ?? e;
      sim.emit("slam", at, { kind: "circle", radius: atk.reach });
      if (dist(at, e) < atk.reach + sim.radius * 0.6) {
        a.hit = true;
        sim.hurt(dmg, a, { knock: atk.knock ?? 1.2 });
      }
      break;
    }
    case "spit":
    case "volley": {
      const n = atk.kind === "volley" ? (atk.count ?? 3) : 1;
      const spread = atk.kind === "volley" ? 0.5 : 0;
      for (let i = 0; i < n; i++) {
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread * 2;
        fire(sim, a, atk, a.dir + off, dmg);
      }
      sim.emit("shot", a, { dir: a.dir, kind: a.spec.id === "gigano" ? "stone" : a.spec.id === "glimmerjaw" ? "amber" : "spit" });
      break;
    }
    case "summon": {
      const adds = atk.adds;
      if (adds) callAdds(sim, a, adds.id, adds.count);
      break;
    }
    case "rally": {
      for (const o of sim.actors) {
        if (o === a || o.state === "dead" || o.npc || o.spec.role === "prey" || dist(o, a) > atk.reach) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.25);
        o.fx.haste = { t: 4 };
        sim.emit("heal", o, { amount: 0, kind: "rally" });
      }
      sim.emit("slam", a, { kind: "rally", radius: atk.reach });
      break;
    }
    default:
      break;
  }
}

function strike(sim: Adventure, a: Actor, dt: number, d: number) {
  const atk = a.atk;
  if (!atk) return setState(a, "recover", 0.8);
  const p = sim.player;
  const dmg = damageOf(a, atk);
  if (atk.kind === "lunge" || atk.kind === "charge") {
    const sp = atk.speed ?? 11;
    a.speedNow = sp;
    sim.moveBody(a, Math.cos(a.dir) * sp * dt, Math.sin(a.dir) * sp * dt, a.spec.r);
    if (!a.hit && d < a.spec.r + sim.radius + 0.35) {
      a.hit = true;
      sim.hurt(dmg, a, { knock: atk.knock });
    }
  } else if (atk.kind === "slam" && atk.id === "leap" && a.aim) {
    // the leap carries the creature to where you were standing; it lands as the strike ends
    const rem = Math.max(0.02, a.t);
    const dd = dist(a, a.aim);
    if (dd > 0.2) {
      const step = Math.min(dd, (dd / rem) * dt);
      const h = heading(a, a.aim);
      sim.moveBody(a, Math.cos(h) * step, Math.sin(h) * step, a.spec.r);
      a.speedNow = step / dt;
    }
    if (!a.hit && a.t < 0.07) {
      a.hit = true;
      sim.emit("slam", a, { kind: "circle", radius: atk.reach });
      if (dist(a, p) < atk.reach + sim.radius * 0.7) sim.hurt(dmg, a, { knock: 1.4 });
    }
  }
  if (a.t <= 0) {
    setState(a, "recover", atk.recover * (sim.diff.tell > 1 ? 1.25 : 1));
    const cd = atk.cd * a.cdMul;
    a.cooldown = 0.35 + (a.spec.role === "sweeper" ? cd * 0.5 : cd * 0.3);
    a.acd[atk.id] = cd;
  }
}

function fire(sim: Adventure, a: Actor, atk: AttackDef, dir: number, dmg: number) {
  const sp = atk.speed ?? 10;
  const s: Shot = {
    id: sim.nextId++,
    x: a.x + Math.cos(dir) * (a.spec.r + 0.2),
    y: a.y + Math.sin(dir) * (a.spec.r + 0.2),
    vx: Math.cos(dir) * sp,
    vy: Math.sin(dir) * sp,
    r: 0.35,
    dmg,
    life: (atk.reach + 1) / sp,
    from: a.id,
    venom: !!atk.venom,
    kind: a.spec.id === "gigano" ? "stone" : a.spec.id === "glimmerjaw" ? "amber" : "spit",
  };
  sim.shots.push(s);
}

export function updateShots(sim: Adventure, dt: number) {
  const p = sim.player;
  for (let i = sim.shots.length - 1; i >= 0; i--) {
    const s = sim.shots[i];
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    const owner = sim.actors.find((o) => o.id === s.from);
    if (s.life <= 0 || !sim.world.grid.fits(s.x, s.y, 0.12)) {
      sim.emit("impact", s, { kind: s.kind });
      sim.shots.splice(i, 1);
      continue;
    }
    if (dist(s, p) < s.r + sim.radius * 0.75 && p.hp > 0) {
      const hit = sim.hurt(s.dmg, owner ?? s, { venom: s.venom, ranged: true });
      // a shot that meets a dodging player flies on; any other outcome spends it
      if (hit || p.invuln <= 0) {
        sim.emit("impact", s, { kind: s.kind });
        sim.shots.splice(i, 1);
      }
    }
  }
}

function callAdds(sim: Adventure, a: Actor, id: string, count: number) {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + sim.rng.range(0, 1);
    const q = { x: a.x + Math.cos(ang) * (a.spec.r + 2.5), y: a.y + Math.sin(ang) * (a.spec.r + 2.5) };
    const add = sim.addActor(id, q, { summoned: true, level: Math.max(1, a.level - 1), exact: true });
    if (add) {
      add.state = "stalk";
      add.cooldown = 0.8 + i * 0.35;
      add.unaware = false;
      sim.emit("notice", add, { text: "" });
    }
  }
}

/** Boss phases: crossing a health threshold roars, calls adds and changes the attack set. */
export function triggerPhaseIfNeeded(sim: Adventure, a: Actor) {
  const boss = a.spec.boss;
  if (!boss || a.state === "dead") return;
  const frac = a.hp / a.maxHp;
  for (let i = boss.phases.length - 1; i > a.phase; i--) {
    const ph = boss.phases[i];
    if (frac > ph.at) continue;
    a.phase = i;
    a.speedMul = ph.speed;
    a.cdMul = ph.cd;
    if (ph.text) sim.emit("phase", a, { text: ph.text, amount: i, actor: a.id });
    if (ph.summon) callAdds(sim, a, ph.summon.id, ph.summon.count);
    if (ph.roar) {
      a.guard = ph.roar;
      setState(a, "roar", ph.roar);
      a.fx = {};
    }
    break;
  }
}
