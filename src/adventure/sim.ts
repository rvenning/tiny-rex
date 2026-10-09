import {
  CREATURES,
  DINOS,
  DISCOVERIES,
  GROWTH,
  MAX_HP,
  MILESTONE,
  REGIONS,
  RIVALS,
  SPAWNS,
  STAGES,
  byRegion,
  creature,
  regionAt,
  type CreatureSpec,
  type Dino,
  type Point,
  type RegionId,
} from "./data";
import { type AdventureSave, validateAdventure } from "./save";
import { Random } from "../game/random";
import type { World } from "../world/world";

/** Everything the scene needs to draw feedback. The simulation never touches Phaser, DOM or time. */
export type AdventureEvent = Point & {
  type:
    | "bite"
    | "hit"
    | "eat"
    | "hurt"
    | "dodge"
    | "roar"
    | "pounce"
    | "tell"
    | "notice"
    | "bounce"
    | "grow"
    | "discovery"
    | "nest"
    | "defeat"
    | "victory"
    | "gate"
    | "stagger"
    | "forage";
  text?: string;
  reward?: number;
  dir?: number;
  actor?: number;
  stage?: number;
};
export interface AdventureInput {
  move: Point; // ground-space direction, length 0..1 (partial = creeping)
  bite: boolean;
  dodge: boolean;
  skill: boolean;
  interact: boolean;
}
export const idleInput = (): AdventureInput => ({ move: { x: 0, y: 0 }, bite: false, dodge: false, skill: false, interact: false });

export type ActorState = "idle" | "feed" | "alert" | "flee" | "stalk" | "windup" | "strike" | "recover" | "stagger" | "return" | "dead";
export interface Actor extends Point {
  id: number;
  spec: CreatureSpec;
  home: Point;
  face: number;
  hp: number;
  maxHp: number;
  state: ActorState;
  t: number; // time left in the current state
  age: number; // time in the current state
  alert: number; // 0..1 prey awareness
  dir: number; // locked attack heading
  cooldown: number;
  hit: boolean;
  respawnAt: number;
  rival?: string;
  sentinel: boolean;
  provoked: number;
  wander: number;
  flash: number;
  speedNow: number;
  strafe: number;
}
export type PlayerPose = "idle" | "run" | "bite" | "dodge" | "skill" | "hurt";
export interface Player extends Point {
  face: number;
  hp: number;
  invuln: number;
  pose: PlayerPose;
  action: number; // seconds left in the current committed action
  actionLen: number;
  dashX: number;
  dashY: number;
  speedNow: number;
  biteHit: boolean;
  grow: number; // seconds left of a growth celebration
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const heading = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);
const NEST_SAFE = 5.5;

export class Adventure {
  save: AdventureSave;
  player: Player;
  actors: Actor[] = [];
  events: AdventureEvent[] = [];
  time = 0;
  biteCooldown = 0;
  dodgeCooldown = 0;
  skillCooldown = 0;
  region: RegionId = "hollow";
  stageApplied: number;
  pendingGrow = false;
  quiet = 0; // seconds with no live threat near the player
  gateHint = "";
  private rng: Random;
  private nextId = 1;
  private defeatedAt = -99;
  private forageAt = new Map<string, number>();
  private hintAt = 0;
  private eatenRecent: string[] = [];

  constructor(
    readonly world: World,
    data: AdventureSave,
    seed = 42,
  ) {
    this.save = validateAdventure(data);
    this.rng = new Random(seed);
    const p = this.world.grid.nearestWalkable(this.save.snapshot.position.x, this.save.snapshot.position.y, 0.6);
    this.player = { x: p.x, y: p.y, face: Math.PI / 4, hp: MAX_HP, invuln: 1, pose: "idle", action: 0, actionLen: 0, dashX: 0, dashY: 0, speedNow: 0, biteHit: false, grow: 0 };
    this.region = regionAt(p)?.id ?? "hollow";
    this.stageApplied = this.stageFor(this.dino);
    for (const region of REGIONS) {
      if (!region.built) continue;
      for (const [id, x, y] of SPAWNS[region.id]) this.addActor(id, { x, y });
    }
    for (const rival of RIVALS) {
      if (this.save.rivals.includes(rival.id) || !byRegion(rival.region).built) continue;
      this.addActor(rival.species, rival.home, rival.id);
    }
  }

  // ---------------------------------------------------------------- derived state
  get dino(): Dino {
    return this.save.snapshot.dino;
  }
  stageFor(dino: Dino) {
    const xp = this.save.xp[dino];
    let t = 0;
    while (t < 3 && xp >= GROWTH[t]) {
      const need = MILESTONE[t];
      if (need && !this.save.rivals.includes(need)) break;
      t++;
    }
    return t;
  }
  /** current stage as applied to body, bite and speed */
  get tier() {
    return this.stageApplied;
  }
  get stats() {
    return DINOS[this.dino].stages[this.tier];
  }
  get radius() {
    return this.stats.r;
  }
  get safe() {
    return this.save.nests.some((id) => dist(this.player, byRegion(id).nest) < NEST_SAFE);
  }
  get nearNest() {
    const r = regionAt(this.player);
    if (!r) return false;
    return dist(this.player, r.nest) < NEST_SAFE + 0.5;
  }
  /** [current, needed] for the HUD growth bar of the current stage; null when complete */
  get growth(): { have: number; need: number; blocked: string | null } | null {
    const t = this.tier;
    if (t >= 3) return null;
    const base = t === 0 ? 0 : GROWTH[t - 1];
    const xp = this.save.xp[this.dino];
    const need = GROWTH[t] - base;
    const m = MILESTONE[t];
    const blocked = m && xp >= GROWTH[t] && !this.save.rivals.includes(m) ? RIVALS.find((r) => r.id === m)!.name : null;
    return { have: Math.min(need, Math.max(0, xp - base)), need, blocked };
  }
  get objective() {
    const s = this.save;
    if (!s.discoveries.includes("fossil-hollow-shelf") && this.tier === 0 && s.xp.rex < 4) return "Stalk a beetle and bite it";
    if (this.tier === 0 && s.xp[this.dino] < GROWTH[0]) return "Hunt small prey to grow";
    if (this.tier === 0) return "Find a place to rest and grow";
    if (!s.regions.includes("river")) return "Follow the creek trail to Riverbend";
    if (!s.rivals.includes("river-hunter")) return "Outsmart the River Hunter";
    return "Explore the connected world";
  }
  actorsNear(p: Point, r: number) {
    return this.actors.filter((a) => a.state !== "dead" && dist(a, p) < r);
  }

  // ---------------------------------------------------------------- setup
  private addActor(id: string, p: Point, rival?: string) {
    const spec = creature(id);
    const sentinel = !rival && id === "raptor";
    const hp = spec.hp * (rival ? 1.5 : 1);
    this.actors.push({
      id: this.nextId++,
      spec,
      x: p.x,
      y: p.y,
      home: { ...p },
      face: this.rng.range(0, Math.PI * 2),
      hp,
      maxHp: hp,
      state: "idle",
      t: this.rng.range(0.4, 2),
      age: 0,
      alert: 0,
      dir: 0,
      cooldown: this.rng.range(0.5, 2),
      hit: false,
      respawnAt: 0,
      rival,
      sentinel,
      provoked: 0,
      wander: 0,
      flash: 0,
      speedNow: 0,
      strafe: this.rng.next() < 0.5 ? -1 : 1,
    });
  }
  private emit(type: AdventureEvent["type"], at: Point, extra: Partial<AdventureEvent> = {}) {
    this.events.push({ type, x: at.x, y: at.y, ...extra });
  }

  // ---------------------------------------------------------------- xp & growth
  private gain(n: number, at: Point) {
    if (n <= 0) return;
    this.save.xp[this.dino] += n;
    this.emit("eat", at, { reward: n });
    this.checkGrowth();
  }
  private checkGrowth() {
    this.pendingGrow = this.stageFor(this.dino) > this.stageApplied;
  }
  private applyGrowth() {
    const to = this.stageFor(this.dino);
    if (to <= this.stageApplied) return;
    this.stageApplied = to;
    this.pendingGrow = false;
    this.player.invuln = Math.max(this.player.invuln, 1.6);
    this.player.grow = 1.6;
    this.player.hp = MAX_HP;
    this.player.pose = "idle";
    this.player.action = 0;
    const r = DINOS[this.dino];
    const gained = to === r.skillStage && r.skillStage > 0 ? ` · ${r.skillName} learned` : "";
    this.emit("grow", this.player, { stage: to, text: `${STAGES[to]} ${r.name}${gained}` });
  }

  // ---------------------------------------------------------------- movement helpers
  private moveBody(b: Point, dx: number, dy: number, r: number) {
    const q = this.world.grid.move(b.x, b.y, dx, dy, r);
    b.x = q.x;
    b.y = q.y;
  }
  private wading(b: Point) {
    return this.world.grid.inWater(b.x, b.y);
  }

  // ---------------------------------------------------------------- update
  update(dt: number, input: AdventureInput) {
    dt = Math.max(0, Math.min(dt, 1 / 30));
    this.time += dt;
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.grow = Math.max(0, p.grow - dt);
    this.biteCooldown = Math.max(0, this.biteCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    const spec = DINOS[this.dino];
    const st = this.stats;
    // --- committed actions
    if (p.action > 0) {
      p.action = Math.max(0, p.action - dt);
      if (p.pose === "dodge" || (p.pose === "skill" && (p.dashX || p.dashY))) this.moveBody(p, p.dashX * dt, p.dashY * dt, st.r);
      if (p.pose === "bite" && !p.biteHit && p.actionLen - p.action >= 0.1) {
        p.biteHit = true;
        this.resolveBite();
      }
      if (p.pose === "skill" && p.actionLen - p.action >= 0.18 && !p.biteHit) {
        p.biteHit = true;
        this.resolveSkillHit();
      }
      if (p.action === 0) p.pose = "idle";
    }
    const len = Math.hypot(input.move.x, input.move.y);
    const mag = Math.min(1, len);
    const free = p.action === 0 || p.pose === "bite";
    if (free && len > 0.05) {
      const aim = Math.atan2(input.move.y, input.move.x);
      if (p.pose !== "bite") p.face = aim;
      const slow = this.wading(p) ? 0.7 : p.pose === "bite" ? 0.35 : 1;
      const step = st.speed * mag * slow * dt;
      this.moveBody(p, (input.move.x / len) * step, (input.move.y / len) * step, st.r);
      p.speedNow = st.speed * mag * slow;
      if (p.action === 0) p.pose = "run";
    } else {
      p.speedNow = 0;
      if (p.action === 0) p.pose = "idle";
    }
    if (p.pose === "hurt" && p.action === 0) p.pose = "idle";
    // --- new actions
    if (input.dodge && this.dodgeCooldown === 0 && (p.action === 0 || p.pose === "bite") && p.grow < 1) this.startDodge(input);
    if (input.bite && this.biteCooldown === 0 && p.action === 0 && p.grow < 1.2) this.startBite();
    if (input.skill && this.skillCooldown === 0 && p.action === 0 && this.tier >= spec.skillStage) this.startSkill(input);
    // --- world
    for (const a of this.actors) this.updateActor(a, dt);
    this.trackThreats(dt);
    this.updateRegion();
    this.updateDiscoveries(dt);
    if (this.pendingGrow && this.quiet > 0.5) this.applyGrowth();
    if (this.safe && p.hp > 0 && p.hp < MAX_HP) p.hp = Math.min(MAX_HP, p.hp + dt * 0.8);
    if (p.hp <= 0 && this.time - this.defeatedAt > 1) this.defeat();
    this.save.snapshot.position = { x: p.x, y: p.y };
  }

  private trackThreats(dt: number) {
    const hot = this.actors.some((a) => (a.state === "windup" || a.state === "strike" || a.state === "stalk") && a.spec.role !== "prey" && dist(a, this.player) < 16);
    this.quiet = hot ? 0 : this.quiet + dt;
  }

  // ---------------------------------------------------------------- player actions
  private pickTarget(reach: number, arc: number) {
    const p = this.player;
    let best: Actor | undefined,
      bd = 1e9;
    for (const a of this.actors) {
      if (a.state === "dead") continue;
      const d = dist(a, p) - a.spec.r;
      if (d > reach + this.radius) continue;
      if (Math.abs(angleDelta(heading(p, a), p.face)) > arc / 2) continue;
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }
  private startBite() {
    const p = this.player,
      st = this.stats;
    // generous aim assist: snap toward the nearest target in a wide cone
    const assist = this.save.assist ? 1.15 : 0.7;
    const near = this.pickTarget(st.reach * 1.9, assist * 2);
    if (near) p.face = heading(p, near);
    p.pose = "bite";
    p.action = p.actionLen = 0.3;
    p.biteHit = false;
    this.biteCooldown = DINOS[this.dino].biteCd;
    this.emit("bite", p, { dir: p.face });
  }
  private resolveBite() {
    const p = this.player,
      st = this.stats;
    const arc = this.save.assist ? 2.7 : 2.0;
    const a = this.pickTarget(st.reach + 0.4, arc);
    if (!a) return;
    this.hitActor(a, st.damage, p.face);
  }
  private hitActor(a: Actor, damage: number, dir: number) {
    const vulnerable = a.state === "recover" || a.state === "stagger";
    const mult = vulnerable ? 1.6 : a.spec.role === "prey" ? 1 : 0.6;
    if (a.spec.role === "armour") {
      a.flash = 0.2;
      this.emit("bounce", a, { text: "Armour · leave it in peace" });
      if (a.state === "idle" || a.state === "feed") a.provoked = 15;
      return;
    }
    a.hp -= damage * mult;
    a.flash = 0.18;
    this.emit("hit", a, { dir, actor: a.id });
    if (a.spec.role !== "prey" && !vulnerable) a.provoked = 12;
    if (a.hp <= 0) {
      this.kill(a);
    } else if (a.spec.role === "prey") {
      this.scare(a, 3.5);
    }
  }
  private kill(a: Actor) {
    a.state = "dead";
    a.respawnAt = this.time + (a.rival ? 1e9 : a.spec.role === "prey" ? 45 : 90);
    if (!this.save.studied.includes(a.spec.id)) this.save.studied.push(a.spec.id);
    const lower = a.spec.power < this.tier;
    const stale = this.eatenRecent.filter((x) => x === a.spec.id).length;
    // Easy food stops being the whole game: diminishing returns on repeats and on prey far below your size.
    let n = a.spec.reward * (lower ? 0.4 : 1) * Math.max(0.3, 1 - stale * 0.12);
    n = Math.max(a.spec.reward > 0 ? 1 : 0, Math.round(n));
    this.eatenRecent.push(a.spec.id);
    if (this.eatenRecent.length > 14) this.eatenRecent.shift();
    this.player.hp = Math.min(MAX_HP, this.player.hp + (a.spec.role === "prey" ? 0.12 : 0.25));
    this.emit("eat", a, { reward: n, text: a.spec.name, actor: a.id });
    this.save.xp[this.dino] += n;
    if (a.rival && !this.save.rivals.includes(a.rival)) {
      this.save.rivals.push(a.rival);
      const r = RIVALS.find((x) => x.id === a.rival)!;
      this.emit("victory", a, { text: r.name + " defeated" });
      if (a.hit === false && a.age >= 0 && !this.save.challenges.includes("clean-" + a.rival)) this.save.challenges.push("clean-" + a.rival);
    }
    this.checkGrowth();
  }
  private scare(a: Actor, t: number) {
    a.state = "flee";
    a.t = t;
    a.age = 0;
    a.alert = 1;
  }
  private startDodge(input: AdventureInput) {
    const p = this.player,
      st = this.stats;
    const len = Math.hypot(input.move.x, input.move.y);
    const d = len > 0.2 ? Math.atan2(input.move.y, input.move.x) : p.face;
    const T = 0.25;
    p.pose = "dodge";
    p.action = p.actionLen = T;
    p.dashX = (Math.cos(d) * st.dodgeDist) / T;
    p.dashY = (Math.sin(d) * st.dodgeDist) / T;
    p.face = d;
    p.invuln = Math.max(p.invuln, 0.22);
    this.dodgeCooldown = DINOS[this.dino].dodgeCd;
    this.emit("dodge", p, { dir: d });
  }
  private startSkill(_input: AdventureInput) {
    const p = this.player,
      spec = DINOS[this.dino];
    p.pose = "skill";
    p.biteHit = false;
    this.skillCooldown = spec.skillCd;
    if (this.dino === "rex") {
      p.action = p.actionLen = 0.7;
      p.dashX = p.dashY = 0;
      this.emit("roar", p, { text: "Roar!" });
      const radius = 5.5 + this.tier * 1.2;
      for (const a of this.actors) {
        if (a.state === "dead" || dist(a, p) > radius) continue;
        if (a.state === "windup" || a.state === "strike") {
          a.state = "stagger";
          a.t = 1.5;
          a.age = 0;
          this.emit("stagger", a, { text: "Interrupted!" });
        } else if (a.spec.role === "prey") this.scare(a, 3);
        else if (a.spec.power < this.tier + 1 && a.spec.role !== "armour" && a.state !== "recover") {
          a.state = "return";
          a.t = 3;
          a.age = 0;
        }
      }
    } else {
      const T = this.dino === "raptor" ? 0.32 : 0.5;
      const D = this.dino === "raptor" ? 5.0 : 7.0;
      p.action = p.actionLen = T;
      p.dashX = (Math.cos(p.face) * D) / T;
      p.dashY = (Math.sin(p.face) * D) / T;
      p.invuln = Math.max(p.invuln, T + 0.1);
      this.emit("pounce", p, { dir: p.face, text: this.dino === "raptor" ? "Pounce!" : "Charge!" });
    }
  }
  private resolveSkillHit() {
    if (this.dino === "rex") return;
    const p = this.player,
      st = this.stats;
    for (const a of this.actors) {
      if (a.state === "dead") continue;
      if (dist(a, p) < st.reach + a.spec.r + 0.8) {
        if (a.spec.role === "armour" && this.dino === "trike") {
          a.state = "stagger";
          a.t = 1.2;
          this.emit("stagger", a, { text: "Knocked back" });
        } else this.hitActor(a, st.damage * 1.4, p.face);
      }
    }
  }
  hurt(amount: number, from: Point) {
    const p = this.player;
    if (p.invuln > 0 || p.hp <= 0) return false;
    p.hp -= amount * (this.save.assist ? 0.6 : 1);
    p.invuln = 0.9;
    p.pose = "hurt";
    p.action = p.actionLen = 0.25;
    p.dashX = p.dashY = 0;
    const a = heading(from, p);
    this.moveBody(p, Math.cos(a) * 1.1, Math.sin(a) * 1.1, this.radius);
    this.emit("hurt", p, { dir: a });
    return true;
  }
  private defeat() {
    this.defeatedAt = this.time;
    const region = byRegion(this.save.snapshot.nest);
    const home = this.world.grid.nearestWalkable(region.nest.x + 1.5, region.nest.y + 1.5, this.radius);
    const p = this.player;
    p.x = home.x;
    p.y = home.y;
    p.hp = MAX_HP;
    p.invuln = 2;
    p.pose = "idle";
    p.action = 0;
    for (const a of this.actors) {
      if (a.state === "dead") continue;
      if (a.spec.role !== "prey" && a.state !== "idle") {
        a.state = "return";
        a.t = 4;
      }
      if (a.rival) a.hp = a.maxHp;
    }
    this.emit("defeat", p, { text: "Back at the nest · your growth and discoveries are safe" });
  }

  // ---------------------------------------------------------------- world updates
  private updateRegion() {
    const r = regionAt(this.player);
    if (!r || r.id === this.region) return;
    this.region = r.id;
    if (!this.save.regions.includes(r.id)) {
      this.save.regions.push(r.id);
      this.emit("discovery", this.player, { text: r.name, reward: 2 });
      this.gain(2, this.player);
    }
  }
  private updateDiscoveries(_dt: number) {
    const p = this.player;
    const region = regionAt(p);
    if (region && dist(p, region.nest) < NEST_SAFE && !this.save.nests.includes(region.id)) {
      this.save.nests.push(region.id);
      this.emit("nest", region.nest, { text: `${region.name} refuge found · a safe place to return` });
    }
    if (region && dist(p, region.nest) < NEST_SAFE + 3) this.save.snapshot.nest = region.id;
    for (const d of DISCOVERIES) {
      if (dist(p, d) > 1.9) continue;
      if (d.kind === "forage") {
        if (this.time > (this.forageAt.get(d.id) ?? -1)) {
          this.forageAt.set(d.id, this.time + 40);
          p.hp = Math.min(MAX_HP, p.hp + 1);
          this.emit("forage", d, { text: "Sweet fern · health restored" });
        }
        continue;
      }
      if (this.save.discoveries.includes(d.id)) continue;
      this.save.discoveries.push(d.id);
      this.emit("discovery", d, { text: d.name, reward: d.reward });
      this.gain(d.reward, d);
    }
  }
  interact() {
    const r = regionAt(this.player);
    if (r && dist(this.player, r.nest) < NEST_SAFE + 0.5) {
      this.emit("nest", r.nest, { text: "Rest, change species or keep exploring" });
      return true;
    }
    return false;
  }
  switchSpecies(dino: Dino) {
    if (!this.save.species.includes(dino) || !this.nearNest) return false;
    this.save.snapshot.dino = dino;
    this.stageApplied = this.stageFor(dino);
    this.player.hp = MAX_HP;
    this.player.action = 0;
    this.player.pose = "idle";
    this.biteCooldown = this.dodgeCooldown = this.skillCooldown = 0;
    this.pendingGrow = false;
    this.emit("grow", this.player, { stage: this.stageApplied, text: `${DINOS[dino].name} · growth preserved` });
    return true;
  }

  // ---------------------------------------------------------------- creatures
  private attackers() {
    return this.actors.filter((a) => a.state === "windup" || a.state === "strike").length;
  }
  private goto(a: Actor, tx: number, ty: number, speed: number, dt: number) {
    const h = Math.atan2(ty - a.y, tx - a.x);
    a.face = h;
    a.speedNow = speed;
    this.moveBody(a, Math.cos(h) * speed * dt, Math.sin(h) * speed * dt, a.spec.r);
  }
  private setState(a: Actor, s: ActorState, t = 0) {
    a.state = s;
    a.t = t;
    a.age = 0;
  }
  private updateActor(a: Actor, dt: number) {
    const p = this.player;
    a.flash = Math.max(0, a.flash - dt);
    a.cooldown = Math.max(0, a.cooldown - dt);
    a.provoked = Math.max(0, a.provoked - dt);
    a.speedNow = 0;
    if (a.state === "dead") {
      if (this.time >= a.respawnAt && dist(a.home, p) > 14) {
        a.state = "idle";
        a.hp = a.maxHp;
        a.x = a.home.x;
        a.y = a.home.y;
        a.t = 1;
      }
      return;
    }
    a.age += dt;
    a.t -= dt;
    const d = dist(a, p);
    if (d > 70) return; // far from the player: asleep (bounded AI cost)
    if (!this.save.studied.includes(a.spec.id) && d < 7) {
      this.save.studied.push(a.spec.id);
      this.emit("discovery", a, { text: `${a.spec.name} · added to your book` });
    }
    if (a.spec.role === "prey") return this.updatePrey(a, dt, d);
    if (a.spec.role === "armour" && a.provoked <= 0 && a.state !== "stagger" && a.state !== "windup" && a.state !== "strike" && a.state !== "recover") return this.updateGrazer(a, dt);
    this.updatePredator(a, dt, d);
  }
  private updateGrazer(a: Actor, dt: number) {
    if (a.t <= 0) {
      if (a.state === "feed" || a.state === "stagger" || a.state === "idle") {
        a.wander = this.rng.range(0, Math.PI * 2);
        this.setState(a, "return", this.rng.range(1, 2.5));
      } else this.setState(a, "feed", this.rng.range(2, 5));
    }
    if (a.state === "return") {
      const tx = a.x + Math.cos(a.wander) * 3,
        ty = a.y + Math.sin(a.wander) * 3;
      if (dist(a.home, { x: tx, y: ty }) < 8) this.goto(a, tx, ty, a.spec.speed * 0.4, dt);
    }
  }
  private updatePrey(a: Actor, dt: number, d: number) {
    const p = this.player;
    const spec = a.spec;
    // Stalking: creeping shrinks the distance at which prey notices you; running is loud.
    const loud = Math.min(1, p.speedNow / (this.stats.speed * 0.9));
    const noticeR = spec.sense * (0.35 + 0.65 * loud) * (a.state === "feed" ? 0.75 : 1) * (this.safe ? 0.3 : 1);
    if (a.state !== "flee") {
      if (d < noticeR) a.alert = Math.min(1, a.alert + dt * (d < noticeR * 0.55 ? 2.4 : 1.1));
      else a.alert = Math.max(0, a.alert - dt * 0.6);
      if (a.alert >= 1) {
        this.setState(a, "flee", this.rng.range(2.2, 3.4));
        this.emit("notice", a, { actor: a.id });
      }
    }
    if (a.state === "flee") {
      const away = heading(p, a) + Math.sin(a.age * 6 + a.id) * 0.5;
      a.face = away;
      a.speedNow = spec.speed * (spec.speed > 3 ? 1.05 : 1.4);
      this.moveBody(a, Math.cos(away) * a.speedNow * dt, Math.sin(away) * a.speedNow * dt, spec.r);
      if (a.t <= 0) {
        a.alert = 0.3;
        this.setState(a, "idle", this.rng.range(1, 2));
      }
      return;
    }
    if (a.t <= 0) {
      if (a.state === "feed") {
        a.wander = a.face + this.rng.range(-1.6, 1.6);
        this.setState(a, "idle", this.rng.range(0.9, 2.2));
      } else {
        this.setState(a, "feed", this.rng.range(1.4, 3.4));
      }
    }
    if (a.state === "idle") {
      const tx = a.x + Math.cos(a.wander) * 2,
        ty = a.y + Math.sin(a.wander) * 2;
      if (dist(a.home, { x: tx, y: ty }) < 9) this.goto(a, tx, ty, spec.speed * 0.45, dt);
      else a.wander = heading(a, a.home);
    }
  }
  private updatePredator(a: Actor, dt: number, d: number) {
    const p = this.player,
      spec = a.spec;
    const hostile = !this.safe && p.hp > 0 && (spec.role !== "armour" || a.provoked > 0);
    const reach = spec.reach ?? 4;
    const leash = a.sentinel ? 22 : 30;
    // leave the fight if the player escapes or reaches safety
    if (a.state !== "return" && a.state !== "idle" && a.state !== "recover" && a.state !== "stagger" && a.state !== "windup" && a.state !== "strike") {
      if (!hostile || d > spec.sense * 2.2 || dist(a, a.home) > leash) this.setState(a, "return", 6);
    }
    switch (a.state) {
      case "idle": {
        if (a.t <= 0) {
          a.wander = this.rng.range(0, Math.PI * 2);
          a.t = this.rng.range(1.5, 3.5);
        }
        const tx = a.x + Math.cos(a.wander) * 1.5,
          ty = a.y + Math.sin(a.wander) * 1.5;
        if (dist(a.home, { x: tx, y: ty }) < 3.5) this.goto(a, tx, ty, spec.speed * 0.2, dt);
        else a.wander = heading(a, a.home);
        if (hostile && d < spec.sense && this.world.grid.clearLine(a.x, a.y, p.x, p.y)) {
          a.face = heading(a, p);
          this.setState(a, "alert", 0.55);
          this.emit("notice", a, { actor: a.id });
        }
        break;
      }
      case "alert":
        a.face = heading(a, p);
        if (a.t <= 0) this.setState(a, "stalk", 0);
        break;
      case "stalk": {
        a.face = heading(a, p);
        const want = reach * 0.85;
        if (d > want + 0.8) this.goto(a, p.x, p.y, spec.speed * 0.8, dt);
        else if (d < want * 0.55) this.goto(a, a.x - Math.cos(a.face) * 2, a.y - Math.sin(a.face) * 2, spec.speed * 0.5, dt);
        else {
          // circle: strafe perpendicular so the player cannot just stand still
          const side = a.face + (Math.PI / 2) * a.strafe;
          this.goto(a, a.x + Math.cos(side), a.y + Math.sin(side), spec.speed * 0.45, dt);
          a.face = heading(a, p);
          if (this.rng.next() < dt * 0.25) a.strafe *= -1;
        }
        if (a.cooldown <= 0 && d < reach * 1.05 && this.attackers() < (a.rival ? 2 : 1) + (spec.role === "sweeper" ? 0 : 1) && this.world.grid.clearLine(a.x, a.y, p.x, p.y)) {
          a.dir = heading(a, p);
          a.hit = false;
          this.setState(a, "windup", (spec.windup ?? 0.8) * (this.save.assist ? 1.3 : 1));
          this.emit("tell", a, { dir: a.dir, actor: a.id, text: spec.role === "sweeper" ? "Tail sweep" : spec.role === "armour" ? "Charge" : "Lunge" });
        }
        break;
      }
      case "windup": {
        // track for the first part of the windup, then commit: the lane locks 0.25s before the strike
        const total = (spec.windup ?? 0.8) * (this.save.assist ? 1.3 : 1);
        if (a.t > 0.25 && a.age < total * 0.55) {
          const target = heading(a, p);
          const turn = Math.max(-5 * dt, Math.min(5 * dt, angleDelta(target, a.dir)));
          a.dir += turn;
        }
        a.face = a.dir;
        if (a.t <= 0) {
          this.setState(a, "strike", spec.strike ?? 0.36);
          a.hit = false;
          if (spec.role === "sweeper") this.sweepHit(a);
        }
        break;
      }
      case "strike": {
        if (spec.role !== "sweeper") {
          const sp = spec.lungeSpeed ?? 11;
          a.speedNow = sp;
          this.moveBody(a, Math.cos(a.dir) * sp * dt, Math.sin(a.dir) * sp * dt, spec.r);
          if (!a.hit && d < spec.r + this.radius + 0.35) {
            a.hit = true;
            this.hurt(spec.damage ?? 1, a);
          }
        }
        if (a.t <= 0) {
          this.setState(a, "recover", (spec.recover ?? 1.2) * (this.save.assist ? 1.25 : 1));
          a.cooldown = (spec.cooldown ?? 1.4) + 0.4;
        }
        break;
      }
      case "recover":
      case "stagger":
        if (a.t <= 0) this.setState(a, hostile ? "stalk" : "return", 4);
        break;
      case "return": {
        this.goto(a, a.home.x, a.home.y, spec.speed * 0.55, dt);
        a.hp = Math.min(a.maxHp, a.hp + dt * 6);
        if (dist(a, a.home) < 1.2) this.setState(a, "idle", 1.5);
        else if (a.t <= 0 && hostile && d < spec.sense * 0.8 && dist(a, a.home) < leash * 0.6) this.setState(a, "alert", 0.4);
        break;
      }
      default:
        break;
    }
  }
  private sweepHit(a: Actor) {
    const p = this.player;
    const spec = a.spec;
    const d = dist(a, p) - this.radius;
    if (d < (spec.reach ?? 5) && Math.abs(angleDelta(heading(a, p), a.dir)) < (spec.arc ?? 1.5)) {
      a.hit = true;
      this.hurt(spec.damage ?? 1.5, a);
    }
  }

  // ---------------------------------------------------------------- persistence
  checkpoint(at = Date.now()) {
    this.save.snapshot.at = at;
    this.save.updated = at;
    return validateAdventure(this.save);
  }
}
export { CREATURES };
