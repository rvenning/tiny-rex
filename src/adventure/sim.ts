import {
  CREATURES,
  DINOS,
  DISCOVERIES,
  REGIONS,
  RIVALS,
  SPAWNS,
  STAGES,
  byRegion,
  creature,
  regionAt,
  GATES,
  PORTALS,
  OBJECTIVES,
  SENTINELS,
  type AttackDef,
  type CreatureSpec,
  type Dino,
  type Point,
  type RegionId,
} from "./data";
import { Random } from "../game/random";
import type { World } from "../world/world";
import { DIFFICULTY, type DiffSettings, FEAST_MAX, FEAST_PER_MEAL, blockedBy, effectiveLevel, enemyDamage, enemyHp, enemyXp, feastBonus, feastStacks, stageForLevel, xpDamping, xpForLevel, xpToNext } from "../rpg/progression";
import { deriveStats, type Derived } from "../rpg/stats";
import { activeById, availablePoints, canRank, defaultLoadout, rankUp, respecCost, unlockedActives } from "../rpg/skills";
import { BAG_LIMIT, canWear, rerollAffix, rerollCost, salvageValue } from "../rpg/mutations";
import { rollDrop, type Archetype as LootArchetype } from "../rpg/loot";
import { validateCharacter, type Character } from "../rpg/character";
import type { Drop, Mutation, Slot } from "../rpg/types";
import type { Actor, AdventureEvent, AdventureInput, Decoy, Hazard, Player, Shot } from "./sim-types";
import { updateActor as aiUpdateActor, updateShots, triggerPhaseIfNeeded } from "./ai";
import { beginSkill, castSkill } from "./skill-impl";
import { HAZARDS } from "./hazards";

export type { Actor, AdventureEvent, AdventureInput, ActorState, Player, PlayerPose, Shot } from "./sim-types";
export { idleInput } from "./sim-types";

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const heading = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);
const NEST_SAFE = 5.5;
/** typical level range of each region; spawns that do not state a level interpolate inside it */
export const REGION_LEVELS: Record<RegionId, [number, number]> = { hollow: [1, 5], river: [5, 10], marsh: [9, 14], dunes: [13, 19], ember: [17, 24], caves: [20, 28] };
const MASTERY_XP = 12;
const DISCOVERY_XP = 9;
const hash2 = (x: number, y: number) => {
  let h = Math.imul(Math.floor(x * 7) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(y * 7) ^ 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

export interface SpawnOptions {
  level?: number;
  rival?: string;
  elite?: boolean;
  summoned?: boolean;
  npc?: string;
  dormant?: boolean;
  exact?: boolean;
}

export class Adventure {
  save: Character;
  player: Player;
  actors: Actor[] = [];
  events: AdventureEvent[] = [];
  shots: Shot[] = [];
  decoys: Decoy[] = [];
  hazards: Hazard[] = [];
  drops: Drop[] = [];
  time = 0;
  region: RegionId = "hollow";
  stageApplied: number;
  pendingGrow = false;
  /** seconds with no live threat near the player */
  quiet = 0;
  /** seconds since the player last dealt or took damage */
  combatT = 99;
  gateHint = "";
  d!: Derived;
  feastT = 0;
  skillCd: [number, number] = [0, 0];
  skillMax: [number, number] = [1, 1];
  dodgeCds: number[] = [0];
  levelShown = 1;
  rng: Random;
  lootRng: Random;
  nextId = 1;
  defeatedAt = -99;
  forageAt = new Map<string, number>();
  hintAt = 0;
  eatenRecent: string[] = [];
  rivalHits = new Map<string, number>();
  creeping = 0;
  escortStarted = false;
  watched = new Map<number, number>();
  inputPrev = { bite: false, dodge: false, skillA: false, skillB: false };
  dodgeBuffer = 0;
  skillBuffer: [number, number] = [0, 0];
  frontalHint = -99;
  bagFullHint = -99;
  /** extra listeners (quest engine, tests) that want to see every event as it is emitted */
  listeners: ((e: AdventureEvent) => void)[] = [];
  diff: DiffSettings = DIFFICULTY.standard;

  constructor(
    readonly world: World,
    data: Character,
    seed = 42,
  ) {
    this.save = validateCharacter(data) ?? data;
    this.time = this.save.elapsed;
    this.forageAt = new Map(Object.entries(this.save.forage));
    this.rng = new Random(seed);
    this.lootRng = new Random(this.save.lootSeed);
    this.diff = DIFFICULTY[this.save.difficulty];
    this.levelShown = this.level;
    this.stageApplied = stageForLevel(this.level);
    this.refresh(true);
    const p = this.world.grid.nearestWalkable(this.save.snapshot.position.x, this.save.snapshot.position.y, this.stats.r);
    if (!regionAt(p)) Object.assign(p, this.world.grid.nearestWalkable(byRegion(this.save.snapshot.nest).nest.x, byRegion(this.save.snapshot.nest).nest.y, this.stats.r));
    this.player = {
      x: p.x,
      y: p.y,
      face: 0,
      hp: this.d.maxHp,
      invuln: 1,
      pose: "idle",
      action: 0,
      actionLen: 0,
      dashX: 0,
      dashY: 0,
      speedNow: 0,
      biteHit: false,
      grow: 0,
      combo: 0,
      comboT: 0,
      swing: 0,
      finisher: false,
      skillId: "",
      skillSlot: 0,
      skillStep: 0,
      dodgeAge: 9,
      stillT: 0,
      momentum: 0,
      momentumT: 0,
      venom: null,
      slow: null,
      brace: null,
      frenzy: 0,
      bellow: 0,
      lastStandT: 0,
      lastStandCd: 0,
      immortalCd: 0,
      nextCrit: false,
      perfectT: 0,
      stampede: 0,
      chargeHit: new Set(),
      hitsThisAction: new Set(),
      hitBuffer: 0,
    };
    this.region = regionAt(p)?.id ?? "hollow";
    this.populate();
    this.hazards = HAZARDS.map((h) => ({ ...h }));
    for (const dr of this.save.drops) if (dr.expires > this.time) this.drops.push({ ...dr });
  }

  // ---------------------------------------------------------------- derived state
  get dino(): Dino {
    return this.save.species;
  }
  get level() {
    return effectiveLevel(this.save.xp, this.save.rivals);
  }
  /** current body stage as applied to size, reach and gates; changes only in quiet moments */
  get tier() {
    return this.stageApplied;
  }
  get stats() {
    return DINOS[this.dino].stages[this.tier];
  }
  get radius() {
    return this.stats.r * (1 + feastBonus(this.feastT).scale * 0.35);
  }
  get maxHp() {
    return this.d.maxHp;
  }
  get safe() {
    return this.save.nests.some((id) => {
      const region = byRegion(id);
      return region?.built && dist(this.player, region.nest) < NEST_SAFE;
    });
  }
  get nearNest() {
    const r = regionAt(this.player);
    if (!r?.built) return false;
    return dist(this.player, r.nest) < NEST_SAFE + 0.5;
  }
  get feast() {
    return feastBonus(this.feastT);
  }
  /** for the HUD: level bar of the current level; blocked names the boss holding further growth */
  get xpBar() {
    const lvl = this.level;
    const base = xpForLevel(lvl);
    const need = xpToNext(lvl);
    const blocked = blockedBy(this.save.xp, this.save.rivals);
    return { level: lvl, have: Math.min(need, Math.max(0, this.save.xp - base)), need: Number.isFinite(need) ? need : 1, blocked: blocked ? (RIVALS.find((r) => r.id === blocked)?.name ?? blocked) : null, maxed: !Number.isFinite(need) };
  }
  get skillPoints() {
    return availablePoints(this.level, this.save.skills);
  }
  /** recompute everything combat reads from the character; call after any equipment/skill/level change */
  refresh(first = false) {
    const prevMax = this.d?.maxHp ?? 0;
    this.d = deriveStats({ species: this.save.species, level: this.level, skills: this.save.skills, worn: this.save.worn }, this.feastT);
    const charges = this.d.effects.windSplit ? 2 : 1;
    while (this.dodgeCds.length < charges) this.dodgeCds.push(0);
    this.dodgeCds.length = charges;
    if (!first && this.player) {
      if (this.d.maxHp > prevMax) this.player.hp += this.d.maxHp - prevMax;
      this.player.hp = Math.min(this.player.hp, this.d.maxHp);
    }
  }
  private lastFeastStacks = 0;
  hasFlag(id: string) {
    return this.save.flags.includes(id);
  }
  setFlag(id: string) {
    if (this.hasFlag(id)) return false;
    this.save.flags.push(id);
    this.emit("world", this.player, { id });
    return true;
  }
  levelFor(spec: CreatureSpec, at: Point, exact?: number) {
    if (exact) return exact;
    if (spec.archetype === "boss" || spec.archetype === "miniboss" || spec.role === "prey") {
      const region = regionAt(at)?.id ?? "hollow";
      const [lo, hi] = REGION_LEVELS[region];
      if (spec.archetype === "prey") return Math.max(1, Math.min(spec.level, hi));
      return spec.level;
    }
    const region = regionAt(at)?.id ?? "hollow";
    const [lo, hi] = REGION_LEVELS[region];
    const t = Math.min(1, spec.power / 4 * 0.55 + hash2(at.x, at.y) * 0.45);
    return Math.max(1, Math.round(lo + (hi - lo) * t));
  }

  // ---------------------------------------------------------------- population
  private populate() {
    for (const region of REGIONS) {
      if (!region.built) continue;
      for (const [id, x, y, lvl] of SPAWNS[region.id] as [string, number, number, number?][]) {
        if (RIVALS.some((r) => r.species === id && [r.home, ...(r.companions ?? [])].some((p) => p.x === x && p.y === y))) continue;
        this.addActor(id, { x, y }, { level: lvl });
      }
    }
    for (const rival of RIVALS) {
      if (this.save.rivals.includes(rival.id) || !byRegion(rival.region).built) continue;
      this.addActor(rival.species, rival.home, { rival: rival.id });
      for (const companion of rival.companions ?? []) this.addActor(rival.species, companion, { rival: rival.id });
    }
  }
  emit(type: AdventureEvent["type"], at: Point, extra: Partial<AdventureEvent> = {}) {
    const e = { type, x: at.x, y: at.y, ...extra } as AdventureEvent;
    this.events.push(e);
    for (const l of this.listeners) l(e);
  }
  addActor(id: string, p: Point, o: SpawnOptions = {}) {
    const spec = creature(id);
    if (!spec) return undefined;
    const sentinel = SENTINELS.has(`${id}@${p.x},${p.y}`);
    const region = regionAt(p)?.id;
    const valid = (q: Point) => regionAt(q)?.id === region && this.world.grid.fits(q.x, q.y, spec.r);
    let spawn = this.world.grid.nearestWalkable(p.x, p.y, spec.r);
    if (sentinel && region && !valid(p)) {
      const toward = heading(p, byRegion(region).nest);
      const approach = this.world.grid.nearestWalkable(p.x + Math.cos(toward) * 5, p.y + Math.sin(toward) * 5, spec.r);
      let found: Point | undefined;
      for (let ring = 1; ring < 32 && !found; ring++)
        for (let i = 0; i < 32; i++) {
          const offset = ((i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * Math.PI) / 32,
            angle = toward + offset,
            distance = ring * this.world.grid.cell * 2;
          const candidate = { x: p.x + Math.cos(angle) * distance, y: p.y + Math.sin(angle) * distance };
          if (valid(candidate) && this.world.grid.clearLine(candidate.x, candidate.y, approach.x, approach.y)) {
            found = candidate;
            break;
          }
        }
      if (found) spawn = found;
    }
    if (!valid(spawn)) {
      let found: Point | undefined;
      for (let ring = 1; ring < 80 && !found; ring++)
        for (let i = 0; i < 32; i++) {
          const angle = (i / 32) * Math.PI * 2,
            distance = ring * this.world.grid.cell * 2;
          const candidate = { x: p.x + Math.cos(angle) * distance, y: p.y + Math.sin(angle) * distance };
          if (valid(candidate)) {
            found = candidate;
            break;
          }
        }
      if (!found) return undefined;
      spawn = found;
    }
    const level = this.levelFor(spec, spawn, o.level);
    const hostile = spec.role !== "prey" && !o.npc && spec.archetype !== "neutral";
    const elite = o.elite ?? (hostile && !o.rival && !o.summoned && !o.exact && spec.archetype !== "swarm" && level >= 4 && hash2(spawn.x + 3, spawn.y - 5) < 0.1);
    const hp = enemyHp(spec.hp, level) * this.diff.enemyHp * (elite ? 1.8 : 1);
    const a: Actor = {
      id: this.nextId++,
      spec,
      level,
      x: spawn.x,
      y: spawn.y,
      home: { ...spawn },
      face: this.rng.range(0, Math.PI * 2),
      hp,
      maxHp: hp,
      state: o.dormant || spec.archetype === "ambusher" ? "dormant" : "idle",
      t: this.rng.range(0.4, 2),
      age: 0,
      alert: 0,
      dir: 0,
      cooldown: this.rng.range(0.5, 2),
      hit: false,
      respawnAt: 0,
      rival: o.rival,
      sentinel,
      provoked: 0,
      wander: 0,
      flash: 0,
      speedNow: 0,
      strafe: this.rng.next() < 0.5 ? -1 : 1,
      phase: 0,
      fx: {},
      npc: o.npc,
      elite,
      kvx: 0,
      kvy: 0,
      acd: {},
      speedMul: 1,
      cdMul: 1,
      summoned: o.summoned,
      lure: null,
      lureT: 0,
      guard: 0,
      count: 0,
      unaware: true,
      dotAcc: 0,
      dotAt: -9,
    };
    this.actors.push(a);
    return a;
  }

  // ---------------------------------------------------------------- progression
  /** XP from any source, with difficulty and mutation multipliers; may level up */
  gainXp(n: number, at: Point, quiet = false) {
    if (n <= 0) return 0;
    const got = Math.max(1, Math.round(n * this.diff.xp * this.d.xpMult));
    const before = this.level;
    this.save.xp += got;
    if (!quiet) this.emit("xp", at, { amount: got });
    const after = this.level;
    if (after > before) {
      for (let l = before + 1; l <= after; l++) this.emit("levelup", this.player, { amount: l, text: `Level ${l}` });
      this.levelShown = after;
      const unlocked = unlockedActives(this.dino, after).filter((s) => s.unlock > before && s.unlock <= after);
      for (const s of unlocked) this.emit("notice", this.player, { text: `New skill · ${s.name}` });
      const [a, b] = this.save.loadout;
      if (!b && after >= 5) this.save.loadout = [a, unlockedActives(this.dino, after).find((s) => s.id !== a)?.id ?? null];
      this.refresh();
      this.player.hp = Math.min(this.d.maxHp, this.player.hp + this.d.maxHp * 0.5);
      this.checkGrowth();
    } else if (blockedBy(this.save.xp, this.save.rivals) && !this.hasFlag("hint-blocked")) {
      this.setFlag("hint-blocked");
    }
    return got;
  }
  /** eating: Feast is temporary body growth, never XP */
  eat(at: Point) {
    const add = FEAST_PER_MEAL * this.d.feastMult;
    const cap = FEAST_MAX * this.d.feastMult;
    this.feastT = Math.min(cap, this.feastT + add);
    this.refresh();
    const n = feastStacks(this.feastT);
    if (n !== this.lastFeastStacks) {
      this.lastFeastStacks = n;
      this.emit("grow", at, { text: n >= 5 ? "Stuffed · Feast at full" : `Feast ×${n}`, kind: "feast", stage: this.tier });
    }
  }
  private checkGrowth() {
    this.pendingGrow = stageForLevel(this.level) > this.stageApplied;
  }
  private applyGrowth() {
    const to = stageForLevel(this.level);
    if (to <= this.stageApplied) return;
    this.stageApplied = to;
    this.pendingGrow = false;
    this.player.invuln = Math.max(this.player.invuln, 1.6);
    this.player.grow = 1.6;
    this.player.hp = this.d.maxHp;
    this.player.pose = "idle";
    this.player.action = 0;
    if (!this.world.grid.fits(this.player.x, this.player.y, this.radius)) {
      const q = this.world.grid.nearestWalkable(this.player.x, this.player.y, this.radius);
      const at = this.canTravel(this.player, q) ? q : this.world.grid.nearestWalkable(byRegion(this.save.snapshot.nest).nest.x, byRegion(this.save.snapshot.nest).nest.y, this.radius);
      Object.assign(this.player, at);
    }
    this.emit("grow", this.player, { stage: to, text: `${STAGES[to]} ${DINOS[this.dino].name}`, kind: "stage" });
  }

  // ---------------------------------------------------------------- character management API (used by the UI)
  equip(id: string): boolean {
    const i = this.save.bag.findIndex((m) => m.id === id);
    if (i < 0) return false;
    const m = this.save.bag[i];
    if (!canWear(m, this.dino)) return false;
    const prev = this.save.worn[m.slot];
    this.save.bag.splice(i, 1);
    if (prev) this.save.bag.push(prev);
    this.save.worn[m.slot] = { ...m, fresh: undefined };
    this.refresh();
    return true;
  }
  unequip(slot: Slot): boolean {
    const m = this.save.worn[slot];
    if (!m || this.save.bag.length >= BAG_LIMIT) return false;
    delete this.save.worn[slot];
    this.save.bag.push(m);
    this.refresh();
    return true;
  }
  /** Salvage a bag item (never a worn one) for Amber; returns the Amber gained or -1 */
  salvage(id: string): number {
    const i = this.save.bag.findIndex((m) => m.id === id);
    if (i < 0) return -1;
    const m = this.save.bag[i];
    const dup = m.unique ? [...this.save.bag, ...Object.values(this.save.worn)].some((x) => x && x.id !== m.id && x.unique === m.unique) : false;
    const gain = Math.round(salvageValue(m, dup) * this.d.amberMult);
    this.save.bag.splice(i, 1);
    this.save.amber += gain;
    this.emit("salvage", this.player, { amount: gain, text: m.name });
    return gain;
  }
  reroll(id: string, index: number): boolean {
    const m = this.save.bag.find((x) => x.id === id) ?? Object.values(this.save.worn).find((x) => x?.id === id);
    if (!m || this.save.amber < rerollCost(m)) return false;
    const next = rerollAffix(m, index, this.dino);
    if (!next) return false;
    this.save.amber -= rerollCost(m);
    Object.assign(m, next);
    this.refresh();
    return true;
  }
  rank(id: string): boolean {
    const next = rankUp(this.dino, this.level, this.save.skills, id);
    if (!next) return false;
    this.save.skills = next;
    this.refresh();
    return true;
  }
  canRank(id: string) {
    return canRank(this.dino, this.level, this.save.skills, id);
  }
  get respecCost() {
    return respecCost(this.level);
  }
  respec(): boolean {
    const cost = this.respecCost;
    if (this.save.amber < cost || !Object.keys(this.save.skills).length) return false;
    this.save.amber -= cost;
    this.save.skills = {};
    this.refresh();
    return true;
  }
  setLoadout(slot: 0 | 1, skillId: string | null): boolean {
    if (skillId && !unlockedActives(this.dino, this.level).some((s) => s.id === skillId)) return false;
    if (slot === 1 && this.level < 5) return false;
    const next: [string, string | null] = [...this.save.loadout];
    if (slot === 0 && !skillId) return false;
    if (slot === 0) next[0] = skillId as string;
    else next[1] = skillId;
    if (next[0] === next[1]) {
      // swapping: the other slot takes the skill this slot gave up
      if (slot === 0) next[1] = this.save.loadout[0];
      else next[0] = this.save.loadout[1] ?? next[0];
    }
    if (!next[0]) return false;
    this.save.loadout = next;
    this.skillCd = [0, 0];
    return true;
  }
  setDifficulty(d: Character["difficulty"]) {
    this.save.difficulty = d;
    this.diff = DIFFICULTY[d];
  }
  /** current skill for loadout slot 0 or 1 */
  skillAt(slot: 0 | 1) {
    const id = this.save.loadout[slot];
    return id ? activeById(id) : undefined;
  }
  get skillUnlockedB() {
    return this.level >= 5 && !!this.save.loadout[1];
  }

  // ---------------------------------------------------------------- movement helpers
  moveBody(b: Point, dx: number, dy: number, r: number) {
    const q = this.world.grid.move(b.x, b.y, dx, dy, r);
    if (b === this.player && !this.canTravel(b, q)) return;
    b.x = q.x;
    b.y = q.y;
  }
  wading(b: Point) {
    return this.world.grid.inWater(b.x, b.y);
  }
  canTravel(from: Point, to: Point) {
    for (const gate of GATES.filter((g) => g.optional)) {
      const nx = gate.normal[0],
        ny = gate.normal[1],
        a = (from.x - gate.x) * nx + (from.y - gate.y) * ny,
        b = (to.x - gate.x) * nx + (to.y - gate.y) * ny;
      const tangent = Math.abs((to.x - gate.x) * ny - (to.y - gate.y) * nx);
      if (a * b <= 0 && a !== b && tangent <= gate.width / 2 + this.radius && !this.save.gates.includes(gate.id)) {
        if (gate.species !== this.dino || gate.id === "trike-rubble") return false;
        this.save.gates.push(gate.id);
      }
    }
    const source = regionAt(from),
      destination = regionAt(to);
    if (!source || !destination) return false;
    if (source.id === destination.id) return true;
    const pair = [source.id, destination.id].sort().join(":");
    if (pair === "hollow:river" || pair === "caves:hollow") return true;
    const gate = GATES.find((g) => (g.fromRegion === source.id && g.toRegion === destination.id) || (g.fromRegion === destination.id && g.toRegion === source.id));
    const roots = pair === "caves:marsh" ? GATES.find((g) => g.id === "raptor-roots") : undefined;
    const route = gate ?? roots;
    if (!route || dist(to, route) > route.width + 2) return false;
    if (route.species && this.dino !== route.species) return false;
    if (this.save.gates.includes(route.id)) return true;
    if (this.tier < route.requiredStage || route.kind === "breakable") {
      if (this.time >= this.hintAt) {
        this.emit("notice", from, { text: this.tier < route.requiredStage ? `${STAGES[route.requiredStage]} needed · ${route.name}` : `Bite to open ${route.name}` });
        this.hintAt = this.time + 3;
      }
      return false;
    }
    this.save.gates.push(route.id);
    this.emit("gate", to, { text: route.name + " opened" });
    return true;
  }
  openNearbyGate() {
    const gate = GATES.find((g) => g.kind === "breakable" && !this.save.gates.includes(g.id) && dist(this.player, g) < this.stats.reach * this.d.reachMult + this.radius + 1 && Math.abs(angleDelta(heading(this.player, g), this.player.face)) < 1.2);
    if (!gate) return false;
    if (this.tier < gate.requiredStage) {
      this.emit("bounce", gate, { text: `${STAGES[gate.requiredStage]} needed · ${gate.name}` });
      return true;
    }
    this.save.gates.push(gate.id);
    this.emit("gate", gate, { text: gate.name + " cleared · route stays open" });
    return true;
  }
  get nearPortal() {
    return PORTALS.find((p) => dist(this.player, p) < 2.5 || (p.bidirectional && dist(this.player, p.to) < 2.5));
  }
  get rematchRival() {
    return RIVALS.find((r) => this.save.rivals.includes(r.id) && dist(this.player, r.home) < 5 && !this.actors.some((a) => a.rival === r.id && a.state !== "dead"));
  }
  get nearNpc() {
    return this.actors.find((a) => a.npc && a.state !== "dead" && dist(a, this.player) < a.spec.r + this.radius + 1.6);
  }
  get interactLabel() {
    const n = this.nearNpc;
    if (n) return `Talk to ${n.spec.name}`;
    return this.nearPortal ? this.nearPortal.name : this.nearNest ? "Rest at refuge" : this.rematchRival ? `Challenge ${this.rematchRival.name} again` : null;
  }

  // ---------------------------------------------------------------- mastery (carried over from the connected world)
  progressObjective(id: string, amount: number) {
    const o = OBJECTIVES.find((o) => o.id === id);
    if (!o || this.save.challenges.includes(id)) return;
    const required = o.count ?? o.seconds ?? 1;
    this.save.mastery[id] = Math.min(required, (this.save.mastery[id] ?? 0) + amount);
    if (this.save.mastery[id] + 1e-6 >= required) {
      this.save.challenges.push(id);
      this.gainXp(o.reward * MASTERY_XP, this.player);
      this.emit("discovery", this.player, { text: `Mastery · ${o.name}`, reward: o.reward * MASTERY_XP });
    }
  }
  huntMastery(a: Actor, recovery: boolean) {
    const region = regionAt(a)?.id;
    for (const o of OBJECTIVES) {
      if (o.region !== region || o.target !== a.spec.id) continue;
      if (o.kind === "slow-hunt" && this.creeping > 0.35) this.progressObjective(o.id, 1);
      if (o.kind === "settled-hunt" && a.alert < 0.4 && this.player.speedNow < 1) this.progressObjective(o.id, 1);
      if (o.kind === "recovery-hunt" && recovery) this.progressObjective(o.id, 1);
    }
    const packmates = this.actors.filter((other) => other.rival === a.rival && other !== a && other.state !== "dead");
    if (a.rival === "marsh-pack" && packmates.length > 0 && packmates.every((other) => dist(a, other) >= 8)) this.save.mastery["split-pack"] = 1;
  }
  private updateMastery(dt: number) {
    for (const a of this.actors) {
      if (a.escort || a.npc || a.state === "dead" || a.state === "dormant" || this.save.studied.includes(a.spec.id)) continue;
      const visible = this.player.speedNow < 1 && dist(a, this.player) < 12 && a.state !== "strike" && this.world.grid.clearLine(this.player.x, this.player.y, a.x, a.y);
      const watched = visible ? (this.watched.get(a.id) ?? 0) + dt : 0;
      this.watched.set(a.id, watched);
      if (watched > 3) {
        this.save.studied.push(a.spec.id);
        this.emit("discovery", a, { text: `Studied · ${a.spec.name}` });
      }
    }
    for (const o of OBJECTIVES) {
      if (this.save.challenges.includes(o.id) || o.region !== this.region) continue;
      if (o.kind === "regional-fossils") {
        const count = DISCOVERIES.filter((d) => d.region === o.target && d.kind === "fossil" && this.save.discoveries.includes(d.id)).length;
        this.progressObjective(o.id, Math.max(0, count - (this.save.mastery[o.id] ?? 0)));
      }
      if (o.kind === "deliver-discovery" && this.save.discoveries.includes(o.target!) && DISCOVERIES.some((d) => d.id === o.destination && dist(this.player, d) < 3)) this.progressObjective(o.id, 1);
      if (o.kind === "observe-neutral" && this.player.speedNow < 1 && this.actors.some((a) => a.spec.id === o.target && a.provoked <= 0 && a.state !== "dead" && dist(a, this.player) < 10 && this.world.grid.clearLine(this.player.x, this.player.y, a.x, a.y))) this.progressObjective(o.id, dt);
      if (o.kind === "escort" && o.from && o.to) {
        if (!this.escortStarted && dist(this.player, o.from) < 5) {
          const hatchling = this.addActor("compy", o.from, { exact: true });
          if (hatchling) {
            hatchling.escort = true;
            this.escortStarted = true;
            this.emit("notice", hatchling, { text: "A lost hatchling follows · lead it to the marsh refuge" });
          }
        }
        const hatchling = this.actors.find((a) => a.escort);
        if (!hatchling) continue;
        if (dist(hatchling, o.to) < 3) {
          this.progressObjective(o.id, 1);
          hatchling.escort = false;
          hatchling.state = "dead";
          hatchling.respawnAt = 1e9;
        } else if (dist(hatchling, this.player) < 9 && dist(hatchling, this.player) > 2 && !this.actorsNear(hatchling, 8).some((a) => !a.escort && (a.state === "windup" || a.state === "strike"))) {
          const dir = heading(hatchling, this.player);
          this.moveBody(hatchling, Math.cos(dir) * 3 * dt, Math.sin(dir) * 3 * dt, hatchling.spec.r);
          hatchling.face = dir;
          hatchling.speedNow = 3;
        } else hatchling.speedNow = 0;
      }
    }
  }
  actorsNear(p: Point, r: number) {
    return this.actors.filter((a) => a.state !== "dead" && dist(a, p) < r);
  }

  // ---------------------------------------------------------------- update
  update(dt: number, input: AdventureInput) {
    dt = Math.max(0, Math.min(dt, 1 / 30));
    this.time += dt;
    this.save.elapsed = this.time;
    const p = this.player;
    const len = Math.hypot(input.move.x, input.move.y);
    this.creeping = len > 0 && len <= 0.45 ? this.creeping + dt : 0;
    p.invuln = Math.max(0, p.invuln - dt);
    p.grow = Math.max(0, p.grow - dt);
    p.comboT = Math.max(0, p.comboT - dt);
    p.dodgeAge += dt;
    p.perfectT = Math.max(0, p.perfectT - dt);
    p.lastStandT = Math.max(0, p.lastStandT - dt);
    p.lastStandCd = Math.max(0, p.lastStandCd - dt);
    p.immortalCd = Math.max(0, p.immortalCd - dt);
    p.frenzy = Math.max(0, p.frenzy - dt);
    p.bellow = Math.max(0, p.bellow - dt);
    p.hitBuffer = Math.max(0, p.hitBuffer - dt);
    this.combatT += dt;
    this.dodgeBuffer = Math.max(0, this.dodgeBuffer - dt);
    this.skillBuffer = [Math.max(0, this.skillBuffer[0] - dt), Math.max(0, this.skillBuffer[1] - dt)];
    this.skillCd = [Math.max(0, this.skillCd[0] - dt), Math.max(0, this.skillCd[1] - dt)];
    this.dodgeCds = this.dodgeCds.map((c) => Math.max(0, c - dt));
    if (p.momentumT > 0) {
      p.momentumT -= dt;
      if (p.momentumT <= 0) p.momentum = 0;
    }
    if (p.brace) {
      p.brace.t -= dt;
      if (p.brace.t <= 0) p.brace = null;
    }
    if (p.slow) {
      p.slow.t -= dt;
      if (p.slow.t <= 0) p.slow = null;
    }
    if (p.venom) {
      p.venom.t -= dt;
      p.hp -= p.venom.dps * dt;
      if (p.venom.t <= 0) p.venom = null;
    }
    // Feast decays; Glowheart keeps it alive in combat
    if (this.feastT > 0 && !(this.d.feastGlow && this.combatT < 8)) {
      const before = feastStacks(this.feastT);
      this.feastT = Math.max(0, this.feastT - dt);
      if (feastStacks(this.feastT) !== before) {
        this.lastFeastStacks = feastStacks(this.feastT);
        this.refresh();
      }
    }
    // --- input edges
    const edge = { bite: input.bite && !this.inputPrev.bite, dodge: input.dodge && !this.inputPrev.dodge, skillA: input.skillA && !this.inputPrev.skillA, skillB: input.skillB && !this.inputPrev.skillB };
    this.inputPrev = { bite: input.bite, dodge: input.dodge, skillA: input.skillA, skillB: input.skillB };
    if (edge.dodge) this.dodgeBuffer = 0.18;
    if (edge.skillA) this.skillBuffer[0] = 0.2;
    if (edge.skillB) this.skillBuffer[1] = 0.2;
    // --- committed actions
    const st = this.stats;
    if (p.action > 0) {
      const wasAction = p.action;
      p.action = Math.max(0, p.action - dt);
      void wasAction;
      if (p.pose === "dodge" || (p.pose === "skill" && (p.dashX || p.dashY))) this.moveBody(p, p.dashX * dt, p.dashY * dt, this.radius);
      else if (p.pose === "bite" && (p.dashX || p.dashY) && !this.blockedByCreature(p.dashX * dt, p.dashY * dt)) this.moveBody(p, p.dashX * dt, p.dashY * dt, this.radius);
      if (p.pose === "bite" && !p.biteHit && p.actionLen - p.action >= p.actionLen * (p.finisher ? 0.42 : 0.34)) {
        p.biteHit = true;
        this.resolveSwing();
      }
      if (p.pose === "skill") castSkill(this, p, dt);
      if (p.action === 0) {
        if (p.pose === "bite") p.comboT = p.finisher ? 0 : 0.55;
        if (p.pose === "bite" || p.pose === "skill") p.dashX = p.dashY = 0;
        p.pose = "idle";
        p.chargeHit.clear();
      }
    }
    const mag = Math.min(1, len);
    const free = p.action === 0 || p.pose === "bite";
    if (free && len > 0.05) {
      const aim = Math.atan2(input.move.y, input.move.x);
      if (p.pose !== "bite") p.face = aim;
      const slow = (this.wading(p) ? 0.7 : p.pose === "bite" ? 0.4 : 1) * (p.slow ? 1 - p.slow.m : 1) * (p.brace ? 0.5 : 1) * (1 + p.stampede * 0.04);
      const sp = st.speed * this.d.speedMult * mag * slow;
      this.moveBody(p, (input.move.x / len) * sp * dt, (input.move.y / len) * sp * dt, this.radius);
      p.speedNow = sp;
      if (p.action === 0) p.pose = "run";
      p.stillT = 0;
    } else {
      p.speedNow = 0;
      if (p.action === 0) p.pose = "idle";
      p.stillT += dt;
    }
    if (p.pose === "hurt" && p.action === 0) p.pose = "idle";
    if (p.pose !== "dodge" && !(p.pose === "skill" && (p.dashX || p.dashY))) this.separate(dt);
    // --- new actions (input buffered for a few frames)
    if (this.dodgeBuffer > 0 && (p.action === 0 || p.pose === "bite" || p.pose === "hurt") && p.grow < 1) {
      if (this.startDodge(input)) this.dodgeBuffer = 0;
    }
    const attackFree = p.action === 0 || (p.pose === "bite" && p.action < p.actionLen * 0.28);
    if (input.bite && attackFree && p.grow < 1.2) this.startAttack();
    for (const slot of [0, 1] as const) {
      const buffered = this.skillBuffer[slot] > 0 || (slot === 0 ? input.skillA : input.skillB);
      if (buffered && p.action === 0 && this.skillCd[slot] === 0 && (slot === 0 || this.skillUnlockedB)) {
        if (this.startSkill(slot)) this.skillBuffer[slot] = 0;
      }
    }
    // --- world
    for (const a of this.actors) aiUpdateActor(this, a, dt);
    updateShots(this, dt);
    this.updateDecoys(dt);
    this.updateHazards(dt);
    this.trackThreats(dt);
    this.updateRegion();
    this.updateDiscoveries();
    this.updateMastery(dt);
    this.updateDrops(dt);
    if (this.pendingGrow && this.quiet > 0.5) this.applyGrowth();
    // regeneration: fast at a refuge, gentle in calm, and a little from Feast / mutations in combat
    const maxHp = this.d.maxHp;
    if (p.hp > 0 && p.hp < maxHp) {
      if (this.safe) p.hp = Math.min(maxHp, p.hp + dt * maxHp * 0.22);
      else if (this.combatT > 3 || this.d.regen > 0) p.hp = Math.min(maxHp, p.hp + dt * maxHp * (this.d.regen + (this.combatT > 3 ? 0.006 : 0)));
    }
    if (p.hp <= 0 && this.time - this.defeatedAt > 1) this.defeat();
    this.save.snapshot.position = { x: p.x, y: p.y };
  }
  private trackThreats(dt: number) {
    const hot = this.actors.some((a) => (a.state === "windup" || a.state === "strike" || a.state === "stalk") && a.spec.role !== "prey" && !a.npc && dist(a, this.player) < 16);
    this.quiet = hot ? 0 : this.quiet + dt;
  }
  private updateDecoys(dt: number) {
    for (const d of this.decoys) d.t -= dt;
    this.decoys = this.decoys.filter((d) => d.t > 0);
  }
  private updateHazards(dt: number) {
    const p = this.player;
    for (const h of this.hazards) {
      if (h.offFlag && this.hasFlag(h.offFlag)) continue;
      if (h.kind === "steam") {
        const period = h.period ?? 6,
          warn = h.warn ?? 1.2;
        const ph = (this.time + (h.phase ?? 0)) % period;
        const prev = (this.time - dt + (h.phase ?? 0) + period) % period;
        if (ph < prev) this.emit("hazard", h, { kind: "steam-burst", radius: h.r });
        if (ph >= period - warn && prev < period - warn) this.emit("hazard", h, { kind: "steam-warn", radius: h.r });
        if (ph < prev && dist(p, h) < h.r && p.invuln <= 0) this.hurtFraction(h.dmg, h, "Steam vent");
      } else if (dist(p, h) < h.r) {
        if (h.kind === "quicksand") {
          p.slow = { t: 0.4, m: 0.35 };
          continue;
        }
        const dps = h.dmg * this.d.maxHp;
        p.hp -= dps * dt;
        this.combatT = 0;
        if (this.time - this.hazardAt > 2.5) {
          this.hazardAt = this.time;
          this.emit("hazard", h, { kind: h.kind, text: h.kind === "toxic" ? "Toxic gas · move out" : h.kind === "mutagen" ? "Raw mutagen · it burns" : "Hot embers" });
        }
      }
    }
  }
  private hazardAt = -9;
  private hurtFraction(frac: number, at: Point, label: string) {
    const p = this.player;
    p.hp -= this.d.maxHp * frac * (1 - this.d.armour * 0.5) * this.diff.taken;
    p.invuln = Math.max(p.invuln, 0.5);
    this.combatT = 0;
    this.emit("hurt", p, { dir: heading(at, p), text: label });
  }

  // ---------------------------------------------------------------- player actions
  /** Hostile and neutral bodies are solid to the player: overlap is pushed apart (dashes pass through on their i-frames) */
  private separate(dt: number) {
    const p = this.player;
    for (const a of this.actors) {
      if (a.state === "dead" || a.state === "dormant" || a.escort || a.spec.role === "prey") continue;
      const rr = a.spec.r + this.radius * 0.85;
      const dx = p.x - a.x,
        dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= rr) continue;
      const push = Math.min(rr - d, 6 * dt + 0.02);
      const nx = d > 0.001 ? dx / d : 1,
        ny = d > 0.001 ? dy / d : 0;
      const q = this.world.grid.move(p.x, p.y, nx * push, ny * push, this.radius);
      p.x = q.x;
      p.y = q.y;
    }
  }
  /** a swing's lunge step stops at a creature in the way instead of carrying the player through it */
  blockedByCreature(dx: number, dy: number) {
    const p = this.player;
    for (const a of this.actors) {
      if (a.state === "dead" || a.escort || a.state === "dormant") continue;
      const gap = dist(a, p) - a.spec.r - this.radius;
      if (gap < 0.12 && dist(a, { x: p.x + dx, y: p.y + dy }) < dist(a, p)) return true;
    }
    return false;
  }
  pickTargets(reach: number, arc: number, cap = 9) {
    const p = this.player;
    const out: { a: Actor; d: number }[] = [];
    for (const a of this.actors) {
      if (a.state === "dead" || a.escort || a.npc || a.state === "dormant" && false) continue;
      if (this.dino === "trike" && a.spec.role === "prey") continue;
      const d = dist(a, p) - a.spec.r;
      if (d > reach + this.radius) continue;
      if (Math.abs(angleDelta(heading(p, a), p.face)) > arc / 2) continue;
      out.push({ a, d });
    }
    return out.sort((x, y) => x.d - y.d).slice(0, cap);
  }
  private startAttack() {
    const p = this.player,
      st = this.stats;
    // generous aim assist: snap toward the nearest target in a wide cone
    const assist = this.diff.aim;
    const reachNow = st.reach * this.d.reachMult;
    // anything right on top of you is swung at whichever way you were facing; otherwise the cone assist applies
    const near = this.pickTargets(reachNow * 0.9, Math.PI * 2, 1)[0]?.a ?? this.pickTargets(reachNow * 1.9, assist * 2, 1)[0]?.a;
    if (near) p.face = heading(p, near);
    const chain = this.d.chain;
    const chaining = p.pose === "bite" && p.action > 0;
    p.combo = p.comboT > 0 || chaining ? (p.combo + 1) % chain : 0;
    p.finisher = p.combo === chain - 1;
    p.swing = p.combo;
    let T = this.d.swing * (p.frenzy > 0 ? 0.75 : 1) * (p.finisher ? 1.5 : 1);
    T = Math.max(0.12, T);
    p.pose = "bite";
    p.action = p.actionLen = T;
    p.biteHit = false;
    // step into the swing
    const step = p.finisher ? 0.95 : 0.4;
    p.dashX = (Math.cos(p.face) * step) / (T * 0.5);
    p.dashY = (Math.sin(p.face) * step) / (T * 0.5);
    p.hitsThisAction.clear();
    this.emit("bite", p, { dir: p.face, kind: p.finisher ? "finisher" : "swing", hits: p.combo });
  }
  /** the strike frame of a basic attack: a cone that cleaves up to three enemies, a finisher hits harder and wider */
  private resolveSwing() {
    const p = this.player,
      st = this.stats;
    if (this.openNearbyGate()) return;
    if (this.dino === "trike" && this.graze()) return;
    const fin = p.finisher;
    const arc = (fin ? 3.1 : 2.1) * (this.diff.aim > 0.8 ? 1.12 : 1);
    const reach = st.reach * this.d.reachMult + (fin ? 0.5 : 0.2);
    const targets = this.pickTargets(reach, arc, fin ? 6 : 3);
    const chain = this.d.chain;
    const mults = chain === 4 ? [0.8, 0.9, 1, 1.5] : [1, 1.1, 1.7];
    let mult = mults[Math.min(p.combo, mults.length - 1)];
    if (fin) mult *= 1 + (this.d.effects.finisher ?? 0);
    if (this.d.effects.stampede && p.stampede > 0) mult *= 1 + p.stampede * 0.1;
    if (!targets.length) return;
    let hit = 0;
    for (const { a } of targets) {
      const dealt = this.hitEnemy(a, mult, { kind: "basic", finisher: fin, knock: fin ? 1.6 : 0.3, dir: p.face });
      if (dealt > 0) hit++;
    }
    if (hit) {
      p.stampede = 0;
      this.combatT = 0;
      p.momentum = Math.min(8, p.momentum + 1);
      p.momentumT = 2;
      this.save.stats.maxCombo = Math.max(this.save.stats.maxCombo, p.combo + 1);
      if (fin) this.emit("combo", p, { text: "Finisher", hits: hit });
    }
    if (this.d.effects.earthsplit && fin) this.lineShock(p, p.face, 7, mult * 0.8);
  }
  /** Earthsplitter: a shockwave line ahead of the player */
  lineShock(from: Point, dir: number, length: number, mult: number) {
    this.emit("slam", from, { dir, kind: "line", radius: length });
    for (const a of this.actors) {
      if (a.state === "dead" || a.npc || a.escort) continue;
      const rel = { x: a.x - from.x, y: a.y - from.y };
      const along = rel.x * Math.cos(dir) + rel.y * Math.sin(dir);
      const across = Math.abs(-rel.x * Math.sin(dir) + rel.y * Math.cos(dir));
      if (along > 0.5 && along < length && across < 1.2 + a.spec.r) this.hitEnemy(a, mult, { kind: "skill", knock: 1.2, dir });
    }
  }
  /** player damage against one enemy. Returns the damage actually dealt (0 = nothing happened) */
  hitEnemy(a: Actor, mult: number, o: { kind?: "basic" | "skill" | "dot" | "arc" | "reflect"; finisher?: boolean; knock?: number; stun?: number; dir?: number; noEcho?: boolean; forceCrit?: boolean; interrupt?: boolean; noBleed?: boolean; apply?: "bleed" } = {}): number {
    const p = this.player;
    if (a.escort || a.npc || a.state === "dead" || a.guard > 0) return 0;
    if (this.dino === "trike" && a.spec.role === "prey" && o.kind !== "dot") return 0;
    if (a.spec.archetype === "neutral") {
      a.flash = 0.2;
      this.emit("bounce", a, { text: "Leave it in peace" });
      if (a.state === "idle" || a.state === "feed") a.provoked = 15;
      return 0;
    }
    const e = this.d.effects;
    const vulnerable = a.state === "recover" || a.state === "stagger" || !!a.fx.stun;
    let dmg = this.d.damage * mult;
    if (a.unaware && e.openingPounce && o.kind !== "dot") dmg *= 1 + e.openingPounce;
    let crit = !!o.forceCrit || p.nextCrit || p.perfectT > 0 || this.rng.next() < this.d.crit;
    if (o.kind === "dot") crit = false;
    if (crit && o.kind !== "dot") {
      dmg *= this.d.critMult;
      p.nextCrit = false;
      p.perfectT = 0;
    }
    if (a.spec.role !== "prey") dmg *= vulnerable ? 1.6 : 0.85;
    if (a.spec.frontal && !vulnerable && o.kind !== "dot") {
      const front = Math.abs(angleDelta(heading(a, p), a.face)) < 1.15;
      if (front) {
        dmg *= a.spec.frontal;
        if (this.time - this.frontalHint > 3) {
          this.frontalHint = this.time;
          this.emit("bounce", a, { text: "Armoured front · hit the flank" });
        }
      }
    }
    if (e.execute && a.hp / a.maxHp < 0.25) dmg *= 1 + e.execute;
    if (e.momentum && p.momentum) dmg *= 1 + e.momentum * p.momentum;
    if (a.fx.mark) dmg *= 1 + a.fx.mark.m + (e.markBoost ?? 0);
    dmg = Math.max(1, Math.round(dmg));
    a.hp -= dmg;
    a.flash = 0.18;
    a.unaware = false;
    if (o.kind !== "dot") this.combatT = 0;
    this.emit("dmg", a, { amount: dmg, crit, actor: a.id, kind: o.kind });
    if (o.kind !== "dot" && o.kind !== "arc") this.emit("hit", a, { dir: o.dir, actor: a.id, crit });
    // life on hit
    const ls = this.d.lifesteal + (p.frenzy > 0 ? 0.12 : 0);
    if (ls > 0 && o.kind !== "dot") this.heal(dmg * ls * (this.d.maxHp / Math.max(60, this.d.damage * 10)), a);
    // statuses
    if (o.kind !== "dot" && o.kind !== "arc") {
      const bleedChance = e.razorTalons ? 1 : (e.bleed ?? 0);
      if ((o.apply === "bleed" || (bleedChance > 0 && this.rng.next() < bleedChance)) && !o.noBleed) this.applyBleed(a, dmg);
      const poisonChance = e.venomBurst ? 1 : (e.poison ?? 0);
      if (poisonChance > 0 && this.rng.next() < poisonChance) this.applyPoison(a, dmg);
      if (crit && e.shock) this.shockArc(a, dmg * e.shock);
      const kb = (o.knock ?? 0) + (e.knockback ?? 0);
      if (kb > 0 && a.spec.archetype !== "boss") this.knock(a, o.dir ?? heading(this.player, a), kb);
      else if (kb > 0) this.knock(a, o.dir ?? heading(this.player, a), kb * 0.15);
      if (o.stun) this.stun(a, o.stun);
      if (e.echo && !o.noEcho && this.rng.next() < e.echo) this.hitEnemy(a, mult * 0.6, { ...o, noEcho: true });
    }
    if (a.spec.role !== "prey" && !vulnerable) a.provoked = Math.max(a.provoked, 12);
    // only skills interrupt a winding-up attacker; ordinary hits cost the player their window instead
    if (o.interrupt && a.state === "windup" && !a.spec.boss?.armoured) this.stagger(a, 1.1, "Interrupted!");
    if (a.hp <= 0) {
      this.huntMastery(a, a.state === "recover");
      this.kill(a, o.kind === "basic" && this.dino !== "trike");
      return dmg;
    }
    triggerPhaseIfNeeded(this, a);
    if (a.spec.role === "prey") this.scare(a, 3.5);
    return dmg;
  }
  applyBleed(a: Actor, hit: number) {
    const stack = this.d.effects.razorTalons ? 3 : 1;
    const dps = (hit * 0.22 * (1 + (this.d.effects.bleedTick ?? 0))) * (this.d.effects.razorTalons ? 2 : 1);
    const cur = a.fx.bleed;
    a.fx.bleed = { t: 4, dps: Math.max(dps, cur?.dps ?? 0), stacks: Math.min(stack, (cur?.stacks ?? 0) + 1) };
    if (!cur) this.emit("status", a, { kind: "bleed", actor: a.id });
  }
  applyPoison(a: Actor, hit: number) {
    const cur = a.fx.poison;
    const max = 5 + (this.d.effects.poisonMax ?? 0);
    a.fx.poison = { t: 3.5, dps: Math.max(cur?.dps ?? 0, hit * 0.12), stacks: Math.min(max, (cur?.stacks ?? 0) + 1) };
    if (!cur) this.emit("status", a, { kind: "poison", actor: a.id });
  }
  private shockArc(from: Actor, dmg: number) {
    let n = 0;
    for (const a of this.actors) {
      if (a === from || a.state === "dead" || a.npc || a.escort || dist(a, from) > 4.2) continue;
      this.emit("status", a, { kind: "shock", actor: a.id });
      this.arcHit(a, dmg);
      if (++n >= 2) break;
    }
  }
  private arcHit(a: Actor, dmg: number) {
    if (a.hp <= 0) return;
    const d = Math.max(1, Math.round(dmg));
    a.hp -= d;
    a.flash = 0.12;
    this.emit("dmg", a, { amount: d, actor: a.id, kind: "arc" });
    if (a.hp <= 0) this.kill(a, false);
  }
  knock(a: Actor, dir: number, force: number) {
    const heavy = a.spec.r > 1.4 ? 0.5 : 1;
    a.kvx += Math.cos(dir) * force * 6 * heavy;
    a.kvy += Math.sin(dir) * force * 6 * heavy;
  }
  stun(a: Actor, t: number) {
    // armoured bosses cannot be stunned mid-attack; once they are exposed the window simply lengthens
    if (a.spec.boss?.armoured && a.state !== "recover" && a.state !== "stagger") return;
    if (a.spec.archetype === "boss") t *= 0.35;
    a.fx.stun = { t: Math.max(a.fx.stun?.t ?? 0, t) };
    if (a.state === "windup" || a.state === "strike") this.stagger(a, t, "");
  }
  stagger(a: Actor, t: number, text: string) {
    a.state = "stagger";
    a.t = Math.max(a.t, t);
    a.age = 0;
    if (text) this.emit("stagger", a, { text });
  }
  heal(amount: number, at: Point) {
    const p = this.player;
    const n = Math.min(this.d.maxHp - p.hp, amount);
    if (n <= 0.4) return;
    p.hp += n;
    this.emit("heal", at, { amount: Math.round(n) });
  }
  private scare(a: Actor, t: number) {
    a.state = "flee";
    a.t = t;
    a.age = 0;
    a.alert = 1;
  }
  scareActor(a: Actor, t: number) {
    this.scare(a, t);
  }
  private startDodge(input: AdventureInput) {
    const p = this.player,
      st = this.stats;
    const idx = this.dodgeCds.findIndex((c) => c === 0);
    if (idx < 0) return false;
    const len = Math.hypot(input.move.x, input.move.y);
    const d = len > 0.2 ? Math.atan2(input.move.y, input.move.x) : p.face;
    const T = 0.25;
    p.pose = "dodge";
    p.action = p.actionLen = T;
    const dist2 = st.dodgeDist * (this.d.effects.windSplit ? 1.1 : 1);
    p.dashX = (Math.cos(d) * dist2) / T;
    p.dashY = (Math.sin(d) * dist2) / T;
    p.face = d;
    p.invuln = Math.max(p.invuln, 0.22);
    p.dodgeAge = 0;
    p.combo = 0;
    p.comboT = 0;
    this.dodgeCds[idx] = this.d.dodgeCd;
    this.emit("dodge", p, { dir: d });
    const e = this.d.effects;
    if (e.dust) for (const a of this.actorsNear(p, 3.2)) a.fx.slow = { t: 2, m: e.dust };
    if (e.quakeTail) {
      this.emit("slam", p, { kind: "quake", radius: 3 });
      for (const a of this.actorsNear(p, 3.4)) this.hitEnemy(a, 1.1, { kind: "skill", knock: 1.5, stun: 0.3, dir: heading(p, a) });
    }
    return true;
  }
  /** called by the damage pipeline when a telegraphed attack would have landed during a dodge */
  perfectDodge(from: Point) {
    const p = this.player;
    if (this.time - this.lastPerfect < 0.25) return;
    this.lastPerfect = this.time;
    this.save.stats.perfectDodges++;
    p.perfectT = 1.6;
    for (let i = 0; i < this.dodgeCds.length; i++) this.dodgeCds[i] = 0;
    this.emit("perfect", p, { text: "Perfect dodge!" });
    const e = this.d.effects;
    if (e.mirage) {
      this.decoys.push({ x: p.x, y: p.y, t: 3 });
      this.emit("decoy", p, {});
    }
    if (e.perfectCrit) for (const a of this.actorsNear(p, 4)) this.stagger(a, 0.9, "");
    void from;
  }
  private lastPerfect = -9;
  private startSkill(slot: 0 | 1): boolean {
    const sk = this.skillAt(slot);
    const p = this.player;
    if (!sk) return false;
    p.pose = "skill";
    p.skillId = sk.id;
    p.skillSlot = slot;
    p.skillStep = 0;
    p.biteHit = false;
    p.hitsThisAction.clear();
    p.chargeHit.clear();
    p.dashX = p.dashY = 0;
    const e = this.d.effects;
    let cd = sk.cd * this.d.skillCdMult;
    if (sk.id === "rex.roar" && e.thunderlung) cd *= 1.3;
    this.skillCd[slot] = this.skillMax[slot] = cd;
    p.combo = 0;
    p.comboT = 0;
    this.emit("skill", p, { id: sk.id, text: sk.name, dir: p.face });
    beginSkill(this, p, sk.id);
    return true;
  }
  /** damage taken by the player in HP. `from` may be an Actor (melee) or any point (projectiles, hazards) */
  hurt(amount: number, from: Point, o: { venom?: boolean; knock?: number; ranged?: boolean } = {}) {
    const p = this.player;
    if (p.hp <= 0) return false;
    const attacker = from as Actor;
    if (p.invuln > 0) {
      if (p.pose === "dodge" && p.dodgeAge < 0.3 && attacker.spec) this.perfectDodge(from);
      return false;
    }
    if (attacker.rival) this.rivalHits.set(attacker.rival, (this.rivalHits.get(attacker.rival) ?? 0) + 1);
    const raw = amount;
    let taken = amount * this.diff.taken * (1 - this.d.armour);
    if (p.brace) taken *= 0.35;
    if (p.bellow > 0) taken *= 0.7;
    if (p.lastStandT > 0) taken *= 1 - (this.d.effects.lastStand ?? 0);
    if (this.d.effects.stoneback && p.stillT > 1) taken *= 0.75;
    taken = Math.max(1, Math.round(taken));
    // thorns, brace reflection
    if (attacker.spec && !o.ranged) {
      const reflect = (p.brace ? p.brace.reflect : 0) * raw + this.d.thorns * raw;
      if (reflect > 0 && attacker.hp > 0) this.hitEnemy(attacker, reflect / Math.max(1, this.d.damage), { kind: "reflect", noEcho: true, noBleed: true });
    }
    if (p.hp - taken <= 0 && this.d.effects.immortal && p.immortalCd <= 0) {
      taken = Math.max(0, p.hp - 1);
      p.immortalCd = 60;
      this.emit("notice", p, { text: "Unbowed! Hanging on by a claw" });
    }
    if (this.d.effects.lastStand && p.hp - taken < this.d.maxHp * 0.3 && p.lastStandCd <= 0) {
      p.lastStandT = 5;
      p.lastStandCd = 60;
      this.emit("notice", p, { text: "Last Stand!" });
    }
    p.hp -= taken;
    this.combatT = 0;
    p.invuln = 0.75;
    const heavy = taken >= this.d.maxHp * 0.12 || !!o.knock;
    if (heavy && !p.brace && !(p.pose === "skill" && p.skillId === "trike.charge")) {
      p.pose = "hurt";
      p.action = p.actionLen = 0.25;
      p.dashX = p.dashY = 0;
      p.combo = 0;
      p.comboT = 0;
      const a = heading(from, p);
      this.moveBody(p, Math.cos(a) * (o.knock ?? 1.1), Math.sin(a) * (o.knock ?? 1.1), this.radius);
    }
    if (o.venom) p.venom = { t: 3, dps: this.d.maxHp * 0.018 };
    this.emit("hurt", p, { dir: heading(from, p), amount: taken });
    this.emit("dmg", p, { amount: taken, kind: "taken" });
    return true;
  }
  kill(a: Actor, bitten: boolean) {
    if (a.state === "dead") return;
    const p = this.player;
    const prey = a.spec.role === "prey";
    if (prey && !this.save.challenges.includes("first-hunt")) this.save.challenges.push("first-hunt");
    a.state = "dead";
    a.fx = {};
    a.respawnAt = this.time + (a.rival || a.summoned ? 1e9 : prey ? 45 : a.elite ? 150 : 90);
    if (!this.save.studied.includes(a.spec.id)) this.save.studied.push(a.spec.id);
    this.save.stats.kills++;
    const stale = this.eatenRecent.filter((x) => x === a.spec.id).length;
    let xp = 0;
    if (!a.summoned) {
      xp = enemyXp(a.level, a.spec.power) * (a.elite ? 2 : 1) * Math.max(0.3, 1 - stale * 0.12) * xpDamping(this.level, a.level);
      if (a.rival || a.spec.archetype === "boss" || a.spec.archetype === "miniboss") xp *= 3;
      if (a.rival) xp = this.save.rivals.includes(a.rival) || this.actors.some((other) => other.rival === a.rival && other.state !== "dead") ? 0 : xp * (1 + (RIVALS.find((r) => r.id === a.rival)?.companions?.length ?? 0));
    }
    this.eatenRecent.push(a.spec.id);
    if (this.eatenRecent.length > 14) this.eatenRecent.shift();
    if (prey) {
      this.heal(this.d.maxHp * 0.04, a);
      this.eat(a);
    }
    const kills = this.d.effects;
    if (kills.devour && bitten) {
      this.heal(this.d.maxHp * 0.08, a);
      this.eat(a);
    }
    if (kills.bloodMend) this.heal(this.d.maxHp * kills.bloodMend, a);
    if (kills.venomBurst && a.fx.poison === undefined && false) void 0;
    const wasPoisoned = !!a.fx.poison;
    void wasPoisoned;
    const got = xp > 0 ? this.gainXp(xp, a) : 0;
    this.emit(this.dino === "trike" ? "victory" : "eat", a, { reward: got, text: this.dino === "trike" ? a.spec.name + " driven away" : a.spec.name, actor: a.id });
    this.rollLoot(a);
    if (a.rival) {
      if (!this.actors.some((other) => other.rival === a.rival && other.state !== "dead")) {
        const first = !this.save.rivals.includes(a.rival);
        if (first) this.save.rivals.push(a.rival);
        const r = RIVALS.find((x) => x.id === a.rival)!;
        this.save.stats.bossKills += first ? 1 : 0;
        this.emit("victory", a, { text: r.name + " defeated", id: r.id, kind: "boss" });
        if (a.rival === "marsh-pack" && this.save.mastery["split-pack"] >= 1) this.progressObjective("split-pack", 0);
        if ((this.rivalHits.get(a.rival) ?? 0) === 0 && !this.save.challenges.includes("clean-" + a.rival)) this.save.challenges.push("clean-" + a.rival);
        for (const o of OBJECTIVES) if (o.kind === "clean-rival" && o.target === a.rival && (this.rivalHits.get(a.rival) ?? 0) === 0) this.progressObjective(o.id, 1);
        if (first) this.checkGrowth();
        this.refresh();
      }
    }
    this.signalKill(a);
    this.checkGrowth();
  }
  /** quest engine and tests observe kills through the generic event stream */
  private signalKill(a: Actor) {
    this.emit("kill", a, { id: a.spec.id, actor: a.id, text: a.rival ?? "", kind: a.spec.archetype });
  }
  private rollLoot(a: Actor) {
    if (a.summoned || a.npc || a.spec.archetype === "neutral") return;
    const archetype = a.spec.archetype as LootArchetype;
    const firstBoss = !!a.rival && !this.save.rivals.includes(a.rival);
    const drop = rollDrop({
      level: a.level,
      archetype,
      elite: a.elite,
      firstKill: firstBoss && (a.spec.archetype === "boss" || a.spec.archetype === "miniboss"),
      species: this.dino,
      luck: this.d.luck,
      lootMult: this.diff.loot,
      amberMult: this.d.amberMult,
      pity: this.save.pity,
      counter: this.save.lootCounter++,
      lootSeed: this.save.lootSeed,
      at: Math.floor(this.time),
    });
    this.save.pity = drop.pity;
    const spot = (i: number): Point => {
      for (let k = 0; k < 10; k++) {
        const ang = this.rng.range(0, Math.PI * 2),
          r = this.rng.range(0.7, 1.7) + i * 0.4;
        const q = { x: a.x + Math.cos(ang) * r, y: a.y + Math.sin(ang) * r };
        if (this.world.grid.fits(q.x, q.y, 0.3)) return q;
      }
      return { x: a.x, y: a.y };
    };
    if (drop.amber > 0) this.addDrop({ amber: drop.amber }, spot(0));
    if (drop.mutation) {
      this.save.stats.mutationsFound++;
      this.addDrop({ mutation: drop.mutation }, spot(1));
      this.emit("loot", a, { rarity: drop.mutation.rarity, text: drop.mutation.name });
    }
  }
  addDrop(content: { amber?: number; mutation?: Mutation }, at: Point, seconds = 150) {
    const d: Drop = { id: `d${this.nextId++}`, x: at.x, y: at.y, ...content, expires: this.time + seconds };
    this.drops.push(d);
    if (this.drops.length > 40) this.drops.shift();
    return d;
  }
  private updateDrops(_dt: number) {
    const p = this.player;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (d.expires < this.time) {
        this.drops.splice(i, 1);
        continue;
      }
      if (dist(d, p) > 1.7 + this.radius * 0.5 || p.hp <= 0) continue;
      if (d.amber) {
        this.save.amber += d.amber;
        this.emit("pickup", d, { amount: d.amber, kind: "amber" });
        this.drops.splice(i, 1);
      } else if (d.mutation) {
        if (this.save.bag.length >= BAG_LIMIT) {
          if (this.time - this.bagFullHint > 4) {
            this.bagFullHint = this.time;
            this.emit("notice", d, { text: "Mutation bag full · salvage something from the menu" });
          }
          continue;
        }
        this.save.bag.push({ ...d.mutation, fresh: true, at: Math.floor(this.time) });
        this.emit("pickup", d, { kind: "mutation", rarity: d.mutation.rarity, text: d.mutation.name, id: d.mutation.id });
        this.drops.splice(i, 1);
      }
    }
  }

  // ---------------------------------------------------------------- death
  private defeat() {
    this.defeatedAt = this.time;
    this.rivalHits.clear();
    this.save.stats.deaths++;
    const region = byRegion(this.save.snapshot.nest);
    const p = this.player;
    // small, recoverable penalty: the Feast fades and a tenth of the Amber is dropped where you fell
    const lost = Math.floor(this.save.amber * 0.1);
    if (lost > 0) {
      this.save.amber -= lost;
      this.addDrop({ amber: lost }, { x: p.x, y: p.y }, 180);
    }
    this.feastT = 0;
    this.lastFeastStacks = 0;
    this.refresh();
    const home = this.world.grid.nearestWalkable(region.nest.x + 1.5, region.nest.y + 1.5, this.radius);
    p.x = home.x;
    p.y = home.y;
    p.hp = this.d.maxHp;
    p.invuln = 2;
    p.pose = "idle";
    p.action = 0;
    p.venom = null;
    p.slow = null;
    p.brace = null;
    p.combo = 0;
    this.shots.length = 0;
    for (const a of this.actors) {
      if (a.state === "dead" && a.rival && !this.save.rivals.includes(a.rival) && !a.summoned) {
        a.state = "return";
        a.hp = a.maxHp;
      }
      if (a.state === "dead") continue;
      if (a.summoned) {
        a.state = "dead";
        a.respawnAt = 1e9;
        continue;
      }
      if (a.spec.role !== "prey" && a.state !== "idle" && a.state !== "dormant") {
        a.state = "return";
        a.t = 4;
        a.fx = {};
      }
      if (a.rival || a.spec.archetype === "boss" || a.spec.archetype === "miniboss") {
        a.hp = a.maxHp;
        a.phase = 0;
        a.speedMul = 1;
        a.cdMul = 1;
      }
    }
    this.emit("defeat", p, { text: lost > 0 ? `Back at the nest · ${lost} Amber waits where you fell` : "Back at the nest · your growth and discoveries are safe", amount: lost });
  }

  // ---------------------------------------------------------------- world updates
  private updateRegion() {
    const r = regionAt(this.player);
    if (!r || !r.built || r.id === this.region) return;
    this.region = r.id;
    if (!this.save.regions.includes(r.id)) {
      this.save.regions.push(r.id);
      const xp = 30 + REGION_LEVELS[r.id][0] * 6;
      this.emit("discovery", this.player, { text: r.name, reward: xp });
      this.gainXp(xp, this.player);
    }
    this.emit("world", this.player, { kind: "region", id: r.id });
  }
  private updateDiscoveries() {
    const p = this.player;
    const located = regionAt(p);
    const region = located?.built ? located : undefined;
    if (region && dist(p, region.nest) < NEST_SAFE && !this.save.nests.includes(region.id)) {
      this.save.nests.push(region.id);
      this.emit("nest", region.nest, { text: `${region.name} refuge found · a safe place to return`, id: region.id });
    }
    if (region && dist(p, region.nest) < NEST_SAFE + 3) this.save.snapshot.nest = region.id;
    for (const d of DISCOVERIES) {
      if (dist(p, d) > 1.9) continue;
      if (d.kind === "forage") {
        // Trike must choose to graze; merely walking through food does not eat it.
        if (this.dino === "trike") continue;
        if (this.time > (this.forageAt.get(d.id) ?? -1)) {
          this.forageAt.set(d.id, this.time + 40);
          this.save.forage[d.id] = this.time + 40;
          this.heal(this.d.maxHp * 0.3, d);
          this.emit("forage", d, { text: "Sweet fern · health restored" });
        }
        continue;
      }
      if (this.save.discoveries.includes(d.id)) continue;
      this.save.discoveries.push(d.id);
      this.emit("discovery", d, { text: d.name, reward: d.reward * DISCOVERY_XP, id: d.id, kind: d.kind });
      this.gainXp(d.reward * DISCOVERY_XP, d);
    }
  }
  private graze() {
    const plant = DISCOVERIES.find((d) => d.kind === "forage" && dist(this.player, d) <= 2.2);
    if (!plant) return false;
    if (this.time <= (this.forageAt.get(plant.id) ?? -1)) {
      this.emit("forage", plant, { text: "This patch is regrowing · try another fern" });
      return true;
    }
    this.forageAt.set(plant.id, this.time + 40);
    this.save.forage[plant.id] = this.time + 40;
    this.heal(this.d.maxHp * 0.3, plant);
    this.eat(plant);
    this.emit("forage", plant, { text: "Tender fronds · health restored, Feast grows" });
    return true;
  }
  /** Enter: portal, nest, talk, rematch. Returns what happened so the scene can open the right menu */
  interact(): "nest" | "portal" | "talk" | "rematch" | "" {
    const npc = this.nearNpc;
    if (npc) {
      npc.face = heading(npc, this.player);
      this.emit("dialogue", npc, { id: npc.npc, actor: npc.id });
      return "talk";
    }
    const portal = this.nearPortal;
    if (portal) {
      if (this.tier < portal.requiredStage || ("species" in portal && this.dino !== portal.species)) {
        this.emit("notice", this.player, { text: "species" in portal ? "A Raptor fits through these roots" : `${STAGES[portal.requiredStage]} needed for this tunnel` });
        return "";
      }
      const atExit = dist(this.player, portal.to) < 2.5;
      const dest = atExit ? portal : portal.to;
      const p = this.world.grid.nearestWalkable(dest.x, dest.y, this.radius);
      Object.assign(this.player, p, { action: 0, pose: "idle", invuln: 1 });
      if (!this.save.gates.includes(portal.id)) this.save.gates.push(portal.id);
      this.updateRegion();
      this.emit("gate", p, { text: portal.name });
      return "portal";
    }
    const r = regionAt(this.player);
    if (r?.built && dist(this.player, r.nest) < NEST_SAFE + 0.5) {
      this.emit("nest", r.nest, { text: "Rest, change loadout or keep exploring", kind: "rest" });
      return "nest";
    }
    const rival = this.rematchRival;
    if (rival) {
      this.rivalHits.delete(rival.id);
      this.addActor(rival.species, rival.home, { rival: rival.id });
      for (const p of rival.companions ?? []) this.addActor(rival.species, p, { rival: rival.id });
      this.emit("notice", this.player, { text: `${rival.name} rematch · practice mastery, no repeat growth reward` });
      return "rematch";
    }
    return "";
  }

  // ---------------------------------------------------------------- guidance (legacy objective chain, replaced by the quest log when present)
  /** set by the quest engine; returns the line shown in the HUD and the world point to guide to */
  questLine: (() => { text: string; target: Point | null } | null) | null = null;
  get objective() {
    const q = this.questLine?.();
    if (q) return q.text;
    return "Explore the valley and read the creatures around you";
  }
  get objectiveTarget(): Point | null {
    const q = this.questLine?.();
    if (q) return q.target;
    return null;
  }

  // ---------------------------------------------------------------- persistence
  checkpoint(at = Date.now()): Character {
    this.save.snapshot.at = at;
    this.save.updated = at;
    this.save.drops = this.drops.filter((d) => d.expires > this.time).slice(-12).map((d) => ({ ...d }));
    return validateCharacter(this.save) ?? this.save;
  }
}
export { CREATURES };
export type { AttackDef };
