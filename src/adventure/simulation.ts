import {
  CREATURES,
  DISCOVERIES,
  GROWTH,
  PASSAGES,
  REGIONS,
  RIVALS,
  SIZE,
  TERRAIN,
  byRegion,
  center,
  creature,
  nest,
  regionAt,
  type Point,
  type Dino,
  type RegionId,
  type Creature,
} from "./content";
import { type AdventureSave, validateAdventure } from "./save";
import { Random } from "../game/random";
export interface Actor extends Point {
  id: number;
  home: Point;
  spec: Creature;
  hp: number;
  face: number;
  state: "idle" | "tell" | "attack" | "recover" | "dead";
  timer: number;
  intent: number;
  rival?: string;
  hit: boolean;
  respawn: number;
  engagementDamage: number;
}
export interface AdventureEvent extends Point {
  type:
    | "bite"
    | "eat"
    | "hurt"
    | "dodge"
    | "roar"
    | "grow"
    | "discovery"
    | "nest"
    | "defeat"
    | "tell"
    | "victory"
    | "gate";
  text?: string;
  reward?: number;
}
export interface AdventureInput {
  move: Point;
  bite: boolean;
  dodge: boolean;
  skill: boolean;
  interact: boolean;
}
export const idleInput = (): AdventureInput => ({
  move: { x: 0, y: 0 },
  bite: false,
  dodge: false,
  skill: false,
  interact: false,
});
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDelta = (a: number, b: number) =>
  Math.atan2(Math.sin(a - b), Math.cos(a - b));
export class Adventure {
  save: AdventureSave;
  player: Point & {
    face: number;
    hp: number;
    invuln: number;
    action: number;
    pose: string;
  };
  actors: Actor[] = [];
  events: AdventureEvent[] = [];
  time = 0;
  biteCooldown = 0;
  dodgeCooldown = 0;
  skillCooldown = 0;
  region: RegionId = "hollow";
  moving = false;
  gateHint = "";
  private random: Random;
  private nextId = 1;
  private defeatedAt = -99;
  private forageAt = new Map<string, number>();
  private gateAt = 0;
  constructor(data: AdventureSave, seed = 42) {
    this.save = validateAdventure(data);
    this.random = new Random(seed);
    const p = this.save.snapshot.position;
    this.player = {
      ...p,
      face: -Math.PI / 4,
      hp: 3,
      invuln: 1,
      action: 0,
      pose: "idle",
    };
    this.region = regionAt(p)?.id ?? "hollow";
    for (const r of REGIONS) {
      const ids =
        r.id === "hollow"
          ? ["beetle", "beetle", "dragonfly", "compy", "compy", "raptor"]
          : r.id === "river"
            ? ["beetle", "hypsi", "hypsi", "ovi", "raptor", "raptor"]
            : r.id === "marsh"
              ? ["beetle", "galli", "dilo", "raptor", "raptor", "kentro"]
              : r.id === "dunes"
                ? ["galli", "galli", "dilo", "trike", "rex"]
                : r.id === "ember"
                  ? ["galli", "dilo", "rex", "gigano"]
                  : ["beetle", "dragonfly", "ovi", "kentro", "dilo"];
      ids.forEach((id, i) =>
        this.addActor(id, {
          x: r.x * SIZE + 370 + (i % 3) * 150,
          y: r.y * SIZE + 390 + Math.floor(i / 3) * 190,
        }),
      );
    }
    for (const rival of RIVALS)
      if (!this.save.rivals.includes(rival.id)) {
        const r = byRegion(rival.region);
        this.addActor(
          rival.species,
          { x: r.x * SIZE + 640, y: r.y * SIZE + 430 },
          rival.id,
        );
      }
  }
  get dino(): Dino {
    return this.save.snapshot.dino;
  }
  get tier() {
    let t = GROWTH.filter((x) => this.save.xp[this.dino] >= x).length - 1;
    if (this.dino === "rex") {
      if (t >= 2 && !this.save.rivals.includes("river-hunter")) t = 1;
      if (t >= 3 && !this.save.rivals.includes("marsh-pack")) t = 2;
    }
    return t;
  }
  get radius() {
    return [14, 20, 29, 39][this.tier];
  }
  get speed() {
    return (
      (this.dino === "raptor" ? 155 : this.dino === "trike" ? 97 : 120) -
      this.tier * 4
    );
  }
  get damage() {
    return (
      [12, 22, 37, 55][this.tier] *
      (this.dino === "raptor" ? 0.8 : this.dino === "trike" ? 1.1 : 1)
    );
  }
  get objective() {
    if (!this.save.regions.includes("river"))
      return "Follow the creek to Riverbend";
    if (this.tier === 0) return "Feed and discover to grow Juvenile";
    if (!this.save.rivals.includes("river-hunter"))
      return "Outsmart the River Hunter";
    if (!this.save.nests.includes("marsh"))
      return "Cross the ford · discover the marsh nest";
    if (this.tier === 1) return "Hunt, explore and grow into a Hunter";
    if (!this.save.rivals.includes("marsh-pack"))
      return "Separate the pack · beat the Reed Stalker";
    if (this.tier === 2) return "Earn Apex growth · open the basalt route";
    if (!this.save.rivals.includes("basalt-matriarch"))
      return "Claim the basalt nest";
    return "Explore species routes · complete your fossil collection";
  }
  get nearby() {
    return DISCOVERIES.filter(
      (d) =>
        distance(d, this.player) < 65 &&
        d.tier <= this.tier &&
        !this.save.discoveries.includes(d.id),
    )[0];
  }
  private addActor(id: string, p: Point, rival?: string) {
    const spec = creature(id);
    this.actors.push({
      id: this.nextId++,
      home: { ...p },
      ...p,
      spec,
      hp: spec.hp * (rival ? 1.6 : 1),
      face: this.random.range(0, Math.PI * 2),
      state: "idle",
      timer: 1,
      intent: 0,
      rival,
      hit: false,
      respawn: 0,
      engagementDamage: 0,
    });
  }
  private emit(
    type: AdventureEvent["type"],
    text?: string,
    reward?: number,
    p: Point = this.player,
  ) {
    this.events.push({ ...p, type, text, reward });
  }
  private gain(n: number) {
    const before = this.tier;
    this.save.xp[this.dino] += n;
    if (this.tier > before)
      this.emit(
        "grow",
        `${["Hatchling", "Juvenile", "Hunter", "Apex"][this.tier]} · new routes await`,
      );
  }
  private safe() {
    return REGIONS.some(
      (r) =>
        this.save.nests.includes(r.id) && distance(this.player, nest(r)) < 100,
    );
  }
  private allowed(a: Point, b: Point): boolean {
    const from = regionAt(a),
      to = regionAt(b);
    if (!from || !to) return false;
    if (from.id === to.id) return true;
    const route = PASSAGES.find(
      (g) =>
        (g.a === from.id && g.b === to.id) ||
        (g.b === from.id && g.a === to.id),
    );
    if (!route) return false;
    const transverse = from.x === to.x ? b.x % SIZE : b.y % SIZE;
    if (Math.abs(transverse - SIZE / 2) > 125) return false;
    if (this.save.gates.includes(route.name)) return true;
    if (this.tier < route.tier) {
      if (this.time > this.gateAt) {
        this.gateAt = this.time + 3;
        this.gateHint = `${route.name} · ${["Hatchling", "Juvenile", "Hunter", "Apex"][route.tier]} required`;
        this.emit("gate", this.gateHint);
      }
      return false;
    }
    if (
      route.tier >= 2 &&
      this.player.pose !== "bite" &&
      this.player.pose !== "skill"
    ) {
      if (this.time > this.gateAt) {
        this.gateAt = this.time + 3;
        this.emit("gate", `${route.name} · bite to break through`);
      }
      return false;
    }
    this.save.gates.push(route.name);
    if (route.tier >= 2) this.emit("gate", `${route.name} opened`);
    return true;
  }
  private movePlayer(dx: number, dy: number) {
    // Sweep longer skill moves so they cannot skip a rock or narrow boundary.
    const steps = Math.ceil(Math.hypot(dx, dy) / 12);
    if (steps > 1) {
      for (let i = 0; i < steps; i++) this.movePlayer(dx / steps, dy / steps);
      return;
    }
    const p = this.player;
    const b = {
      x: Math.max(30, Math.min(SIZE * 3 - 30, p.x + dx)),
      y: Math.max(30, Math.min(SIZE * 2 - 30, p.y + dy)),
    };
    const free = (q: Point) =>
      !TERRAIN.some(
        (t) => t.radius > 0 && distance(t, q) < t.radius + this.radius * 0.7,
      );
    if (this.allowed(p, b) && free(b)) {
      p.x = b.x;
      p.y = b.y;
    } else {
      const x = { x: b.x, y: p.y };
      if (this.allowed(p, x) && free(x)) p.x = x.x;
      const y = { x: p.x, y: b.y };
      if (this.allowed(p, y) && free(y)) p.y = y.y;
    }
  }
  update(dt: number, input: AdventureInput) {
    dt = Math.max(0, Math.min(dt, 1 / 30));
    this.time += dt;
    const p = this.player;
    p.invuln = Math.max(0, p.invuln - dt);
    p.action = Math.max(0, p.action - dt);
    this.biteCooldown = Math.max(0, this.biteCooldown - dt);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - dt);
    this.skillCooldown = Math.max(0, this.skillCooldown - dt);
    const len = Math.hypot(input.move.x, input.move.y);
    this.moving = len > 0.05;
    if (this.moving) {
      p.face = Math.atan2(input.move.y, input.move.x);
      const s =
        this.speed *
        dt *
        (p.pose === "dodge" && p.action > 0
          ? 2.9
          : p.pose === "bite" && p.action > 0
            ? 0.7
            : 1);
      this.movePlayer(
        (input.move.x / Math.max(1, len)) * s,
        (input.move.y / Math.max(1, len)) * s,
      );
    }
    if (p.action <= 0) p.pose = this.moving ? "run" : "idle";
    if (input.dodge && this.dodgeCooldown === 0) {
      p.pose = "dodge";
      p.action = 0.26;
      p.invuln = Math.max(p.invuln, 0.2);
      this.dodgeCooldown = 0.95;
      this.emit("dodge");
      if (!this.moving)
        this.movePlayer(Math.cos(p.face) * 35, Math.sin(p.face) * 35);
    }
    if (input.bite && this.biteCooldown === 0 && p.pose !== "dodge")
      this.bite();
    if (
      input.skill &&
      this.skillCooldown === 0 &&
      (this.tier >= 1 || this.dino !== "rex")
    )
      this.skill();
    for (const a of this.actors) this.updateActor(a, dt);
    const r = regionAt(p)!;
    if (r.id !== this.region) {
      this.region = r.id;
      if (!this.save.regions.includes(r.id)) {
        this.save.regions.push(r.id);
        this.gain(12);
        this.emit("discovery", r.name);
      }
    }
    if (distance(p, nest(r)) < 65) {
      if (!this.save.nests.includes(r.id)) {
        this.save.nests.push(r.id);
        this.emit("nest", `${r.name} nest found · a safe return`);
        this.gain(20);
      }
      this.save.snapshot.nest = r.id;
      if (p.hp > 0) p.hp = Math.min(3, p.hp + dt * 0.65);
    }
    for (const d of DISCOVERIES)
      if (p.hp > 0 && distance(p, d) < 43 && d.tier <= this.tier) {
        if (d.kind === "forage") {
          if (this.time > (this.forageAt.get(d.id) ?? -1)) {
            this.forageAt.set(d.id, this.time + 30);
            p.hp = Math.min(3, p.hp + 0.5);
            if (this.dino === "trike") {
              this.gain(this.save.discoveries.includes(d.id) ? 2 : d.reward);
              if (!this.save.discoveries.includes(d.id))
                this.save.discoveries.push(d.id);
            }
            this.emit("eat", "Sweet fern · health restored");
          }
          continue;
        }
        if (!this.save.discoveries.includes(d.id)) {
          this.save.discoveries.push(d.id);
          this.gain(d.reward);
          this.emit("discovery", d.name, d.reward);
          if (d.kind === "egg") {
            const sp: Dino = d.region === "marsh" ? "raptor" : "trike";
            if (!this.save.species.includes(sp)) {
              this.save.species.push(sp);
              this.emit(
                "discovery",
                `${sp === "raptor" ? "Raptor" : "Triceratops"} unlocked · switch at a nest`,
              );
            }
          }
          if (d.kind === "tracks") {
            this.save.challenges.push("trail-" + d.region);
          }
        }
      }
    if (input.interact) this.interact();
    if (p.hp <= 0 && this.time - this.defeatedAt > 1) {
      this.defeatedAt = this.time;
      const home = nest(byRegion(this.save.snapshot.nest));
      p.x = home.x;
      p.y = home.y;
      p.hp = 3;
      p.invuln = 2;
      p.action = 0;
      for (const a of this.actors)
        if (a.rival) {
          a.hp = a.spec.hp * 1.6;
          a.state = "idle";
          a.engagementDamage = 0;
        }
      this.emit(
        "defeat",
        "Back at the nest · your growth and discoveries are safe",
      );
    }
    this.save.snapshot.position = { x: p.x, y: p.y };
  }
  bite() {
    const p = this.player;
    const candidates = this.actors
      .filter(
        (a) =>
          a.state !== "dead" &&
          distance(a, p) < 100 + this.radius &&
          Math.abs(angleDelta(Math.atan2(a.y - p.y, a.x - p.x), p.face)) < 1.1,
      )
      .sort((a, b) => distance(a, p) - distance(b, p));
    const aim = candidates[0];
    if (aim) p.face = Math.atan2(aim.y - p.y, aim.x - p.x);
    p.pose = "bite";
    p.action = 0.32;
    this.biteCooldown = this.dino === "raptor" ? 0.37 : 0.5;
    this.emit("bite");
    if (aim) {
      if (aim.spec.pattern === "armour" || aim.spec.id === "trike") {
        this.emit("gate", "Armour · leave this neighbour in peace");
        return;
      }
      const disadvantage = aim.spec.tier > this.tier ? 0.4 : 1;
      const recovery = aim.state === "recover" ? 1.65 : 1;
      aim.hp -= this.damage * disadvantage * recovery;
      if (aim.hp <= 0) this.feed(aim);
    }
  }
  private feed(a: Actor) {
    a.state = "dead";
    a.respawn = this.time + 35;
    if (!this.save.studied.includes(a.spec.id))
      this.save.studied.push(a.spec.id);
    const n = Math.round(a.spec.reward * (a.spec.tier < this.tier ? 0.25 : 1));
    this.gain(n);
    if (this.dino === "trike")
      this.emit("victory", a.spec.name + " driven off", n, a);
    else {
      this.player.hp = Math.min(3, this.player.hp + 0.18);
      this.emit("eat", a.spec.name, n, a);
    }
    if (a.rival && !this.save.rivals.includes(a.rival)) {
      this.save.rivals.push(a.rival);
      this.gain(70);
      this.emit(
        "victory",
        RIVALS.find((r) => r.id === a.rival)!.name + " defeated",
      );
      const key =
        a.rival === "river-hunter"
          ? "clean-river"
          : a.rival === "marsh-pack"
            ? "clean-marsh"
            : "clean-ember";
      if (a.engagementDamage === 0) this.save.challenges.push(key);
    }
  }
  skill() {
    const p = this.player;
    this.skillCooldown = this.dino === "raptor" ? 4 : 7;
    p.pose = "skill";
    p.action = 0.45;
    this.emit(
      "roar",
      this.dino === "rex"
        ? "Roar!"
        : this.dino === "raptor"
          ? "Pounce!"
          : "Charge!",
    );
    if (this.dino === "rex") {
      for (const a of this.actors)
        if (a.state !== "dead" && distance(a, p) < 170) {
          if (a.state === "tell") {
            a.state = "recover";
            a.timer = 1.3;
          } else if (a.spec.tier < this.tier) {
            a.state = "recover";
            a.timer = 1;
          }
        }
    } else {
      const old = { x: p.x, y: p.y };
      this.movePlayer(Math.cos(p.face) * 120, Math.sin(p.face) * 120);
      p.invuln = 0.35;
      for (const a of this.actors)
        if (
          a.state !== "dead" &&
          (distance(a, p) < 100 || distance(a, old) < 70)
        ) {
          if (a.spec.pattern === "armour") continue;
          a.hp -= this.damage * 1.5;
          if (a.hp <= 0) this.feed(a);
          else {
            a.state = "recover";
            a.timer = 1;
          }
        }
    }
  }
  interact() {
    const r = byRegion(this.region);
    if (distance(this.player, nest(r)) < 100)
      this.emit("nest", "Rest, change species or continue exploring");
    // A physical cave doorway connects the authored underground loop; never a level-select menu.
    const doorway = {
      x: byRegion("caves").x * SIZE + 750,
      y: byRegion("caves").y * SIZE + 750,
    };
    const other = {
      x: byRegion("dunes").x * SIZE + 190,
      y: byRegion("dunes").y * SIZE + 710,
    };
    if (
      this.tier >= 2 &&
      (distance(this.player, doorway) < 90 || distance(this.player, other) < 90)
    ) {
      const dest = distance(this.player, doorway) < 90 ? other : doorway;
      Object.assign(this.player, dest);
      if (!this.save.gates.includes("Cave tunnel"))
        this.save.gates.push("Cave tunnel");
      this.emit("gate", "Echo passage · the world loops back");
    }
  }
  switchSpecies(dino: Dino) {
    const r = byRegion(this.region);
    if (
      !this.save.species.includes(dino) ||
      distance(this.player, nest(r)) > 100
    )
      return false;
    this.save.snapshot.dino = dino;
    this.player.hp = 3;
    this.player.action = 0;
    this.player.pose = "idle";
    this.biteCooldown = this.dodgeCooldown = this.skillCooldown = 0;
    this.emit(
      "grow",
      `${dino === "trike" ? "Triceratops" : dino === "raptor" ? "Raptor" : "Rex"} · growth preserved`,
    );
    return true;
  }
  private updateActor(a: Actor, dt: number) {
    if (a.state === "dead") {
      if (!a.rival && this.time >= a.respawn) {
        a.state = "idle";
        a.hp = a.spec.hp;
        Object.assign(a, a.home);
      }
      return;
    }
    if (distance(a, this.player) > 600) return;
    const p = this.player;
    const d = distance(a, p);
    a.timer -= dt;
    if (!this.save.studied.includes(a.spec.id) && d < 120) {
      this.save.studied.push(a.spec.id);
      this.emit("discovery", `${a.spec.name} · added to the book`);
    }
    if (this.safe() && d < 190) {
      a.state = "idle";
      a.face = Math.atan2(a.home.y - a.y, a.home.x - a.x);
      a.x += Math.cos(a.face) * a.spec.speed * 0.4 * dt;
      a.y += Math.sin(a.face) * a.spec.speed * 0.4 * dt;
      return;
    }
    if (a.state === "tell") {
      if (a.timer <= 0) {
        a.state = "attack";
        a.timer = a.spec.pattern === "sweep" ? 0.32 : 0.5;
        a.hit = false;
      }
      return;
    }
    if (a.state === "attack") {
      if (a.spec.pattern !== "sweep") {
        a.x += Math.cos(a.intent) * a.spec.speed * 2.3 * dt;
        a.y += Math.sin(a.intent) * a.spec.speed * 2.3 * dt;
      }
      const reach = a.spec.pattern === "sweep" ? 145 : 40 + this.radius;
      if (
        !a.hit &&
        distance(a, p) < reach &&
        Math.abs(angleDelta(Math.atan2(p.y - a.y, p.x - a.x), a.intent)) <
          (a.spec.pattern === "sweep" ? 1.5 : 0.8)
      ) {
        a.hit = true;
        if (p.invuln <= 0) {
          p.hp -= this.save.assist ? 0.45 : 0.8;
          p.invuln = 0.8;
          p.pose = "hurt";
          p.action = 0.2;
          a.engagementDamage++;
          this.emit("hurt", undefined, undefined, p);
        }
      }
      if (a.timer <= 0) {
        a.state = "recover";
        a.timer = a.spec.pattern === "charge" ? 1.7 : 1.1;
      }
      return;
    }
    if (a.state === "recover") {
      if (a.timer <= 0) {
        a.state = "idle";
        a.timer = 1;
      }
      return;
    }
    if (a.spec.pattern === "prey" || (a.spec.tier < this.tier && !a.rival)) {
      if (d < 140) {
        a.face = Math.atan2(a.y - p.y, a.x - p.x);
        a.x += Math.cos(a.face) * a.spec.speed * 0.62 * dt;
        a.y += Math.sin(a.face) * a.spec.speed * 0.62 * dt;
      } else if (a.timer <= 0) {
        a.face = this.random.range(0, Math.PI * 2);
        a.timer = this.random.range(1, 3);
      }
    } else if (a.spec.pattern !== "armour" && d < 250 && a.timer <= 0) {
      const active = this.actors.filter(
        (x) =>
          x !== a &&
          (x.state === "tell" || x.state === "attack") &&
          distance(x, p) < 300,
      ).length;
      if (active < 2) {
        a.intent = Math.atan2(p.y - a.y, p.x - a.x);
        a.face = a.intent;
        a.state = "tell";
        a.timer =
          (this.save.assist ? 1.05 : 0.75) +
          (a.spec.pattern === "sweep" ? 0.25 : 0);
        this.emit(
          "tell",
          a.spec.pattern === "charge"
            ? "Charge"
            : a.spec.pattern === "sweep"
              ? "Tail sweep"
              : "Lunge",
          undefined,
          a,
        );
      }
    } else if (d < 340 && a.spec.pattern !== "armour") {
      a.face = Math.atan2(p.y - a.y, p.x - a.x);
      if (d > 125) {
        a.x += Math.cos(a.face) * a.spec.speed * 0.55 * dt;
        a.y += Math.sin(a.face) * a.spec.speed * 0.55 * dt;
      }
    } else {
      a.x += Math.cos(a.face) * a.spec.speed * 0.15 * dt;
      a.y += Math.sin(a.face) * a.spec.speed * 0.15 * dt;
      if (a.timer <= 0) {
        a.face = this.random.range(0, Math.PI * 2);
        a.timer = this.random.range(1, 3);
      }
    }
    const r = regionAt(a.home)!;
    a.x = Math.max(r.x * SIZE + 70, Math.min((r.x + 1) * SIZE - 70, a.x));
    a.y = Math.max(r.y * SIZE + 90, Math.min((r.y + 1) * SIZE - 90, a.y));
  }
  checkpoint(at = Date.now()) {
    this.save.snapshot.at = at;
    this.save.updated = at;
    return validateAdventure(this.save);
  }
}
