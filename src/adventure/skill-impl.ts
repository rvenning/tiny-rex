/** The twelve class skills. `beginSkill` runs once when the button is pressed (sets the action length and instant effects),
 *  `castSkill` runs every tick of the committed action for timed hits. */
import { GATES, type Point } from "./data";
import type { Adventure } from "./sim";
import type { Actor, Player } from "./sim-types";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const heading = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);

function foes(sim: Adventure, r: number, from: Point = sim.player) {
  return sim.actors.filter((a) => a.state !== "dead" && !a.npc && !a.escort && a.spec.archetype !== "neutral" && dist(a, from) < r + a.spec.r);
}
const shoutExtras = (sim: Adventure, mult = 1) => {
  const e = sim.d.effects;
  if (!e.roarShock) return;
  const p = sim.player;
  sim.emit("slam", p, { kind: "shock", radius: 6 });
  for (const a of foes(sim, 5.5)) sim.hitEnemy(a, e.roarShock * mult, { kind: "skill", knock: 2.2, dir: heading(p, a) });
};

export function beginSkill(sim: Adventure, p: Player, id: string) {
  const e = sim.d.effects;
  const st = sim.stats;
  switch (id) {
    case "rex.roar": {
      p.action = p.actionLen = 0.7;
      const radius = 5.5 + sim.tier * 1.2;
      sim.emit("roar", p, { text: "Roar!", radius });
      const stunT = 0.8 + (e.roarStun ?? 0);
      for (const a of sim.actors) {
        if (a.state === "dead" || a.npc || dist(a, p) > radius || a.spec.archetype === "neutral") continue;
        if (a.spec.role === "prey") sim.scareActor(a, 3);
        else if (a.state === "windup" || a.state === "strike") sim.hitEnemy(a, 0.3, { kind: "skill", interrupt: true, stun: stunT, dir: heading(p, a) });
        else if (a.spec.power < sim.tier + 1 && a.state !== "recover" && !a.spec.boss) {
          a.state = "return";
          a.t = 3;
          a.age = 0;
        } else if (e.roarStun) sim.stun(a, stunT * 0.6);
      }
      if (e.thunderlung) {
        sim.emit("slam", p, { kind: "shock", radius });
        for (const a of foes(sim, radius)) sim.hitEnemy(a, 1.3, { kind: "skill", knock: 3, dir: heading(p, a) });
      } else shoutExtras(sim);
      break;
    }
    case "rex.tail":
      p.action = p.actionLen = 0.5;
      break;
    case "rex.stomp":
      p.action = p.actionLen = 0.8;
      break;
    case "rex.frenzy":
      p.action = p.actionLen = 0.5;
      p.frenzy = 8;
      sim.emit("roar", p, { text: "Feeding Frenzy!", kind: "frenzy", radius: 3 });
      break;
    case "raptor.pounce": {
      const T = 0.32;
      p.action = p.actionLen = T;
      p.dashX = (Math.cos(p.face) * 5) / T;
      p.dashY = (Math.sin(p.face) * 5) / T;
      p.invuln = Math.max(p.invuln, T + 0.1);
      sim.emit("pounce", p, { dir: p.face, text: "Pounce!" });
      break;
    }
    case "raptor.flurry": {
      const T = 0.4;
      p.action = p.actionLen = T;
      p.dashX = (Math.cos(p.face) * 4.6) / T;
      p.dashY = (Math.sin(p.face) * 4.6) / T;
      p.invuln = Math.max(p.invuln, T + 0.1);
      sim.emit("pounce", p, { dir: p.face, text: "Razor Flurry!", kind: "flurry" });
      break;
    }
    case "raptor.screech": {
      p.action = p.actionLen = 0.6;
      sim.emit("roar", p, { text: "Screech!", kind: "screech", radius: 6 });
      for (const a of foes(sim, 6)) {
        if (a.spec.role === "prey") sim.scareActor(a, 3);
        else {
          a.fx.mark = { t: 6, m: 0.25 };
          a.fx.slow = { t: 3, m: 0.2 };
          sim.emit("status", a, { kind: "mark", actor: a.id });
        }
      }
      shoutExtras(sim, 0.8);
      break;
    }
    case "raptor.shadow": {
      p.action = p.actionLen = 0.3;
      const t = foes(sim, 10)
        .filter((a) => a.spec.role !== "prey")
        .sort((x, y) => dist(x, p) - dist(y, p))[0];
      const from = { x: p.x, y: p.y };
      sim.emit("pounce", from, { kind: "shadow-out", dir: p.face });
      if (t) {
        const back = t.face + Math.PI;
        let q = { x: t.x + Math.cos(back) * (t.spec.r + sim.radius + 0.5), y: t.y + Math.sin(back) * (t.spec.r + sim.radius + 0.5) };
        if (!sim.world.grid.fits(q.x, q.y, sim.radius)) q = sim.world.grid.nearestWalkable(q.x, q.y, sim.radius);
        // never through a wall, across water or past a locked gate: if the landing is not a legal walk away, dash instead
        if (sim.world.grid.clearLine(p.x, p.y, q.x, q.y) && sim.canTravel(p, q)) {
          p.x = q.x;
          p.y = q.y;
          p.face = heading(p, t);
          p.nextCrit = true;
        } else {
          p.dashX = (Math.cos(p.face) * 4.5) / 0.3;
          p.dashY = (Math.sin(p.face) * 4.5) / 0.3;
        }
      } else {
        p.dashX = (Math.cos(p.face) * 4.5) / 0.3;
        p.dashY = (Math.sin(p.face) * 4.5) / 0.3;
      }
      p.invuln = Math.max(p.invuln, 0.5);
      sim.emit("pounce", p, { kind: "shadow-in", dir: p.face, text: "Shadowstep!" });
      break;
    }
    case "trike.charge": {
      const T = 0.5;
      p.action = p.actionLen = T;
      p.dashX = (Math.cos(p.face) * 7) / T;
      p.dashY = (Math.sin(p.face) * 7) / T;
      sim.emit("pounce", p, { dir: p.face, text: "Charge!", kind: "charge" });
      break;
    }
    case "trike.brace": {
      p.action = p.actionLen = 0.35;
      const long = e.bastion ? 2 : 1;
      p.brace = { t: 3 * long + 0.35, reflect: e.bastion ? 1 : 0.3 + (e.braceReflect ?? 0) };
      sim.emit("roar", p, { text: "Brace!", kind: "brace", radius: 2 });
      break;
    }
    case "trike.toss":
      p.action = p.actionLen = 0.6;
      break;
    case "trike.bellow": {
      p.action = p.actionLen = 0.7;
      p.bellow = 6;
      sim.emit("roar", p, { text: "Bellow!", kind: "bellow", radius: 8 });
      sim.heal(sim.d.maxHp * (0.15 + (e.healPulse ?? 0)), p);
      for (const a of foes(sim, 8)) {
        if (a.spec.role === "prey") continue;
        a.provoked = Math.max(a.provoked, 8);
        if (a.state === "idle" || a.state === "return") {
          a.state = "stalk";
          a.t = 0;
          a.unaware = false;
        }
      }
      shoutExtras(sim, 0.8);
      break;
    }
    default:
      p.action = p.actionLen = 0.4;
  }
  void st;
}

export function castSkill(sim: Adventure, p: Player, _dt: number) {
  const t = p.actionLen - p.action; // time into the action
  const here = { x: p.x, y: p.y };
  switch (p.skillId) {
    case "rex.tail": {
      if (p.skillStep === 0 && t >= 0.18) {
        p.skillStep = 1;
        const r = sim.stats.reach * sim.d.reachMult + 1.2;
        sim.emit("slam", here, { kind: "whip", radius: r });
        for (const a of foes(sim, r)) sim.hitEnemy(a, 1.0, { kind: "skill", knock: 2.5, dir: heading(p, a), interrupt: true });
      }
      break;
    }
    case "rex.stomp": {
      if (p.skillStep === 0 && t >= 0.4) {
        p.skillStep = 1;
        sim.emit("slam", here, { kind: "circle", radius: 4.2 });
        for (const a of foes(sim, 4.2)) sim.hitEnemy(a, 1.4, { kind: "skill", knock: 1, stun: 1.2, dir: heading(p, a), interrupt: true });
      }
      break;
    }
    case "raptor.pounce": {
      if (p.skillStep === 0 && t >= 0.18) {
        p.skillStep = 1;
        const reach = sim.stats.reach * sim.d.reachMult + 0.8;
        for (const a of foes(sim, reach)) if (Math.abs(angleDelta(heading(p, a), p.face)) < 1.6) sim.hitEnemy(a, 1.5, { kind: "skill", apply: "bleed", knock: 0.6, dir: p.face });
      }
      break;
    }
    case "raptor.flurry": {
      const due = Math.floor((t - 0.04) / 0.08) + 1;
      while (p.skillStep < Math.min(5, due)) {
        p.skillStep++;
        sim.emit("slam", here, { kind: "slash", dir: p.face + (p.skillStep % 2 ? 0.5 : -0.5), radius: 1.9 });
        for (const a of foes(sim, 1.9)) sim.hitEnemy(a, 0.55, { kind: "skill", dir: p.face, noEcho: true });
      }
      break;
    }
    case "trike.charge": {
      for (const a of foes(sim, sim.radius + 0.7)) {
        if (p.chargeHit.has(a.id) || a.spec.role === "prey") continue;
        p.chargeHit.add(a.id);
        sim.hitEnemy(a, 1.3 * (1 + (sim.d.effects.chargeDamage ?? 0)), { kind: "skill", knock: 3, stun: 0.8, dir: p.face, interrupt: true });
        if (sim.d.effects.crownCharge) sim.skillCd[p.skillSlot] = Math.max(0, sim.skillCd[p.skillSlot] - 1);
        else {
          // a plain charge ends on the first thing it hits
          p.dashX = p.dashY = 0;
          p.action = Math.min(p.action, 0.18);
        }
      }
      const rubble = GATES.find((g) => g.id === "trike-rubble");
      if (rubble && dist(p, rubble) < 3.8 && Math.abs(angleDelta(heading(p, rubble), p.face)) < 1.2 && !sim.save.gates.includes(rubble.id)) {
        sim.save.gates.push(rubble.id);
        sim.emit("gate", rubble, { text: "Rubble cleared · a fossil alcove revealed" });
      }
      if (sim.d.effects.stampede && p.action < 0.05) p.stampede = 3;
      break;
    }
    case "trike.toss": {
      if (p.skillStep === 0 && t >= 0.28) {
        p.skillStep = 1;
        sim.emit("slam", here, { kind: "cone", dir: p.face, radius: 3.9 });
        for (const a of foes(sim, 3.9)) if (Math.abs(angleDelta(heading(p, a), p.face)) < 1.1) sim.hitEnemy(a, 1.2, { kind: "skill", knock: 3, stun: 1.0, dir: p.face, interrupt: true });
        if (sim.d.effects.earthsplit) sim.lineShock(p, p.face, 7, 0.9);
      }
      break;
    }
    default:
      break;
  }
}

export type { Actor };
