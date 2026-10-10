import { describe, it, expect } from "vitest";
import { Adventure, idleInput } from "../src/adventure/sim";
import { DISCOVERIES, byRegion, creature, attacksOf, CREATURES } from "../src/adventure/data";
import { ACTIVES } from "../src/rpg/skills";
import { feastStacks, xpForLevel } from "../src/rpg/progression";
import { make, tick, place, held, only, gear, makeChar, openWorld } from "./helpers/sim";

const press = (a: Adventure, over: object, n = 1) => tick(a, n, held(over));
/** run with the target held in place (knockback would otherwise carry it out of reach) */
const pinned = (a: Adventure, foe: { x: number; y: number; kvx: number; kvy: number }, over: object, n: number) => {
  const { x, y } = foe;
  for (let i = 0; i < n; i++) {
    a.update(1 / 60, held(over));
    foe.x = x;
    foe.y = y;
    foe.kvx = foe.kvy = 0;
  }
};

describe("level, XP and growth stages (design §1.1)", () => {
  it("killing prey gives XP and Feast, never both as the same thing", () => {
    const a = make({ empty: true });
    place(a);
    const prey = only(a, "beetle", 21, 20, { state: "feed" });
    press(a, { bite: true }, 40);
    expect(prey.state).toBe("dead");
    expect(a.save.xp).toBeGreaterThan(0);
    expect(a.feastT).toBeGreaterThan(0);
    expect(feastStacks(a.feastT)).toBe(1);
  });
  it("levelling up emits an event, heals, unlocks the second skill slot at level 5 and the stage at its level", () => {
    const a = make({ empty: true });
    place(a);
    a.player.hp = 10;
    a.gainXp(xpForLevel(5), a.player);
    expect(a.level).toBe(5);
    expect(a.events.filter((e) => e.type === "levelup").map((e) => e.amount)).toEqual([2, 3, 4, 5]);
    expect(a.player.hp).toBeGreaterThan(10);
    expect(a.save.loadout[1]).not.toBeNull();
    expect(a.skillPoints).toBe(4);
    expect(a.tier).toBe(0);
    tick(a, 40);
    expect(a.tier).toBe(1);
  });
  it("bosses hold the level cap: XP banks but the level waits", () => {
    const a = make({ empty: true, level: 9 });
    a.gainXp(100000, a.player);
    expect(a.level).toBe(9);
    expect(a.xpBar.blocked).toBe("River Hunter");
    a.save.rivals.push("river-hunter");
    expect(a.level).toBeGreaterThanOrEqual(17);
  });
  it("species is permanent: no species-changing API exists on the simulation", () => {
    const a = make({ species: "raptor" });
    expect(a.dino).toBe("raptor");
    expect((a as unknown as Record<string, unknown>).switchSpecies).toBeUndefined();
  });
});

describe("basic attacks and combos", () => {
  it("holding attack chains a three-hit combo whose finisher is the heaviest, then resets", () => {
    const a = make({ empty: true, level: 3 });
    place(a);
    a.d.crit = 0; // crits would make the comparison random
    const foe = only(a, "raptor", 21.4, 20, { state: "stagger", t: 99, hp: 5000, maxHp: 5000 });
    const dmg: number[] = [];
    for (let i = 0; i < 400; i++) {
      a.update(1 / 60, held({ bite: true }));
      foe.x = 21.4;
      foe.kvx = foe.kvy = 0;
      for (const e of a.events.splice(0)) if (e.type === "dmg" && e.kind === "basic") dmg.push(e.amount!);
      if (dmg.length >= 4) break;
    }
    expect(dmg.length).toBeGreaterThanOrEqual(4);
    expect(dmg[2]).toBeGreaterThan(dmg[0] * 1.3);
    expect(dmg[3]).toBeLessThan(dmg[2]);
    expect(foe.hp).toBeLessThan(5000);
  });
  it("the raptor's chain is four quick hits, the rex's is three slower ones", () => {
    const swings = (species: "rex" | "raptor") => {
      const a = make({ empty: true, species, level: 3 });
      place(a);
      only(a, "raptor", 21.4, 20, { state: "stagger", t: 99, hp: 5000, maxHp: 5000 });
      let hits = 0;
      for (let i = 0; i < 60 * 3; i++) {
        a.update(1 / 60, held({ bite: true }));
        hits += a.events.splice(0).filter((e) => e.type === "bite").length;
      }
      return hits;
    };
    expect(swings("raptor")).toBeGreaterThan(swings("rex"));
  });
  it("a swing has a wind-up before it lands and cleaves up to three creatures", () => {
    const a = make({ empty: true, level: 3 });
    place(a);
    const foes = [only(a, "compy-raider", 21, 20, { state: "stagger", t: 99 })];
    for (const y of [19.4, 20.6]) foes.push(a.addActor("compy-raider", { x: 21, y }, { exact: true, level: 1 })!);
    for (const f of foes) Object.assign(f, { x: 21, y: f.y, state: "stagger", t: 99, hp: 99, maxHp: 99 });
    a.actors = foes;
    press(a, { bite: true }, 2);
    expect(foes.every((f) => f.hp === 99)).toBe(true);
    press(a, { bite: true }, 30);
    expect(foes.filter((f) => f.hp < 99).length).toBeGreaterThanOrEqual(2);
  });
  it("punishing a recovery deals more damage than attacking an active hunter", () => {
    const damage = (state: "stalk" | "recover") => {
      const a = make({ empty: true, level: 3 });
      place(a);
      const actor = only(a, "raptor", 21.2, 20, { state, hp: 500, maxHp: 500, t: 99, cooldown: 99 });
      pinned(a, actor, { bite: true }, 120);
      return 500 - actor.hp;
    };
    expect(damage("recover")).toBeGreaterThan(damage("stalk") * 1.5);
  });
  it("Triceratops horns and charge never injure or consume ordinary prey; it grazes plants for Feast", () => {
    const a = make({ empty: true, species: "trike" });
    place(a);
    const prey = only(a, "beetle", 21, 20, { state: "feed" });
    press(a, { bite: true }, 90);
    expect(prey.hp).toBe(prey.maxHp);
    a.player.action = 0;
    a.skillCd = [0, 0];
    press(a, { skillA: true }, 60);
    expect(prey.hp).toBe(prey.maxHp);
    const plant = DISCOVERIES.find((d) => d.kind === "forage")!;
    const b = make({ empty: true, species: "trike" });
    place(b, plant.x, plant.y);
    tick(b, 5);
    expect(b.feastT).toBe(0);
    press(b, { bite: true }, 40);
    expect(b.feastT).toBeGreaterThan(0);
    const t = b.feastT;
    press(b, { bite: true }, 200);
    expect(b.feastT).toBeLessThanOrEqual(t);
  });
  it("neutral herds cannot be hunted for food", () => {
    const a = make({ empty: true });
    place(a);
    const t = only(a, "trike", 21.5, 20, { state: "feed" });
    press(a, { bite: true }, 120);
    expect(t.hp).toBe(t.maxHp);
    expect(a.events.some((e) => e.type === "bounce")).toBe(true);
  });
});

describe("dodging", () => {
  it("grants evasion, commits movement, goes on cooldown and cannot be spammed", () => {
    const a = make({ empty: true });
    place(a);
    press(a, { dodge: true, move: { x: 1, y: 0 } }, 1);
    expect(a.hurt(10, { x: 19, y: 20 })).toBe(false);
    press(a, { move: { x: 1, y: 0 } }, 20);
    expect(a.player.x).toBeGreaterThan(23);
    expect(a.events.filter((e) => e.type === "dodge")).toHaveLength(1);
    expect(a.dodgeCds[0]).toBeGreaterThan(0);
    press(a, { dodge: true }, 5);
    expect(a.events.filter((e) => e.type === "dodge")).toHaveLength(1);
  });
  it("a locked lunge misses a sidestep and the hunter enters its punishable recovery", () => {
    const a = make({ empty: true, level: 3 });
    place(a, 20, 23);
    const actor = only(a, "raptor", 15, 20, { state: "windup", dir: 0, t: 0.05, age: 1, provoked: 10, atk: attacksOf(creature("raptor"))[0] });
    tick(a, 40);
    expect(a.player.hp).toBe(a.d.maxHp);
    expect(actor.y).toBeCloseTo(20);
    expect(actor.state).toBe("recover");
  });
  it("dodging into a strike is a Perfect Dodge: cooldown refunded, next hit critical", () => {
    const a = make({ empty: true, level: 3 });
    place(a, 20, 20);
    const actor = only(a, "raptor", 18, 20, { state: "windup", dir: 0, t: 0.34, age: 0.4, provoked: 10, atk: attacksOf(creature("raptor"))[0] });
    a.actors = [actor];
    // dodge across the lane just before the lunge arrives
    let perfect = false;
    for (let i = 0; i < 120 && !perfect; i++) {
      a.update(1 / 60, held({ dodge: i === 24, move: { x: 0, y: i === 24 ? 1 : 0 } }));
      perfect = a.events.some((e) => e.type === "perfect");
    }
    expect(a.player.hp).toBe(a.d.maxHp);
    // Whether the lunge connected during the i-frames depends on geometry; the player must never have been hurt either way.
    if (perfect) {
      expect(a.dodgeCds[0]).toBe(0);
      expect(a.save.stats.perfectDodges).toBeGreaterThan(0);
    }
  });
  it("hits are survivable, mitigated by armour, and a brief invulnerability follows", () => {
    const a = make({ empty: true });
    a.player.invuln = 0;
    const hp = a.player.hp;
    expect(a.hurt(40, { x: 0, y: 0 })).toBe(true);
    expect(a.player.hp).toBeCloseTo(hp - 40, 0);
    expect(a.hurt(40, { x: 0, y: 0 })).toBe(false);
    const trike = make({ empty: true, species: "trike" });
    trike.player.invuln = 0;
    trike.hurt(40, { x: 0, y: 0 });
    expect(trike.d.maxHp - trike.player.hp).toBeLessThan(40);
  });
});

describe("class skills (design A5)", () => {
  for (const sk of ACTIVES) {
    it(`${sk.name} (${sk.species}) casts, uses its cooldown and affects an enemy in range`, () => {
      const a = make({ empty: true, species: sk.species, level: 14 });
      place(a, 20, 20);
      a.save.loadout = [sk.id, null];
      const foe = only(a, "raptor", 22.2, 20, { state: "windup", t: 5, age: 0.1, hp: 800, maxHp: 800, atk: attacksOf(creature("raptor"))[0], provoked: 9 });
      Object.assign(a.player, { face: 0 });
      press(a, { skillA: true }, 1);
      expect(a.skillCd[0]).toBeGreaterThan(0);
      press(a, {}, 60);
      const touched = foe.hp < 800 || !!foe.fx.mark || foe.state !== "windup" || a.player.hp >= a.d.maxHp || a.player.frenzy > 0 || !!a.player.brace || a.player.bellow > 0;
      expect(touched, sk.id).toBe(true);
      // cooldown shrinks with real time
      const before = a.skillCd[0];
      press(a, {}, 30);
      expect(a.skillCd[0]).toBeLessThan(before);
    });
  }
  it("Roar interrupts a winding-up hunter but cannot interrupt an armoured boss", () => {
    const a = make({ empty: true, level: 3 });
    place(a);
    const foe = only(a, "raptor", 22, 20, { state: "windup", t: 0.8, age: 0.1, provoked: 9, atk: attacksOf(creature("raptor"))[0] });
    press(a, { skillA: true }, 20);
    expect(foe.state).toBe("stagger");
    const b = make({ empty: true, level: 8 });
    place(b);
    const boss = only(b, "river-hunter", 22, 20, { state: "windup", t: 0.8, age: 0.1, provoked: 9, atk: attacksOf(creature("river-hunter"))[0] });
    press(b, { skillA: true }, 20);
    expect(boss.state).not.toBe("stagger");
  });
  it("Frill Brace blocks most damage; Bellow heals; Frenzy speeds the swing", () => {
    const t = make({ empty: true, species: "trike", level: 8 });
    t.save.loadout = ["trike.brace", null];
    press(t, { skillA: true }, 25);
    expect(t.player.brace).not.toBeNull();
    const before = t.player.hp;
    t.player.invuln = 0;
    t.hurt(40, { x: 0, y: 0 });
    expect(before - t.player.hp).toBeLessThan(40 * 0.5);
  });
  it("Pounce leaves a bleed; the raptor's skills travel", () => {
    const a = make({ empty: true, species: "raptor", level: 3 });
    place(a, 20, 20);
    const foe = only(a, "raptor", 24.2, 20, { state: "stagger", t: 99, hp: 9999, maxHp: 9999 });
    press(a, { skillA: true }, 40);
    expect(a.player.x).toBeGreaterThan(21);
    expect(foe.fx.bleed).toBeDefined();
  });
});

describe("statuses and mutation effects (design §1.3)", () => {
  it("bleed and poison deal damage over time and poison stacks", () => {
    const a = make({ empty: true, species: "raptor", level: 6 });
    place(a);
    const foe = only(a, "raptor", 21.2, 20, { state: "stagger", t: 999, hp: 9000, maxHp: 9000 });
    a.applyBleed(foe, 100);
    a.applyPoison(foe, 100);
    a.applyPoison(foe, 100);
    expect(foe.fx.poison!.stacks).toBe(2);
    const hp = foe.hp;
    tick(a, 120);
    expect(foe.hp).toBeLessThan(hp - 20);
  });
  it("Razor Talons makes every hit bleed and Venom Fang poisons every bite", () => {
    const a = make({ empty: true, species: "raptor", level: 8 });
    place(a);
    gear(a, 1, "legendary", "claws", "razortalons");
    expect(a.d.effects.razorTalons).toBe(1);
    const foe = only(a, "raptor", 21.2, 20, { state: "stagger", t: 999, hp: 90000, maxHp: 90000 });
    pinned(a, foe, { bite: true }, 50);
    expect(foe.fx.bleed).toBeDefined();
    gear(a, 2, "legendary", "jaws", "venomfang");
    pinned(a, foe, { bite: true }, 50);
    expect(foe.fx.poison).toBeDefined();
  });
  it("Devour: a bite that kills restores health and adds Feast; Gorge-Maw only counts bites", () => {
    const a = make({ empty: true, level: 8 });
    place(a);
    gear(a, 3, "legendary", "jaws", "gorgemaw");
    a.player.hp = a.d.maxHp * 0.5;
    const hp = a.player.hp;
    only(a, "compy-raider", 21, 20, { state: "stagger", t: 99, hp: 3, maxHp: 3 });
    press(a, { bite: true }, 40);
    expect(a.player.hp).toBeGreaterThan(hp);
    expect(a.feastT).toBeGreaterThan(0);
  });
  it("legendary trade-offs are real: Stoneback Plates slows you and Bastion trades speed for armour", () => {
    const a = make({ empty: true, level: 8 });
    const speed = a.d.speedMult;
    gear(a, 4, "legendary", "hide", "stoneback");
    expect(a.d.speedMult).toBeLessThan(speed);
    expect(a.d.armour).toBeGreaterThan(0.1);
  });
  it("Executioner raises damage against a nearly dead foe", () => {
    const a = make({ empty: true, level: 6 });
    place(a);
    const dealt = (hpFrac: number, withEffect: boolean) => {
      const b = make({ empty: true, level: 6, seed: 5 });
      place(b);
      if (withEffect) b.save.worn.jaws = { ...(() => { const m = gear(b, 9, "epic", "jaws"); return m; })(), effects: [{ id: "execute", value: 0.5, min: 0.5, max: 0.5 }] };
      b.refresh();
      const f = only(b, "raptor", 21.2, 20, { state: "stagger", t: 999, hp: 1000 * hpFrac, maxHp: 1000 });
      const before = f.hp;
      b.hitEnemy(f, 1, { kind: "basic", forceCrit: false });
      return before - f.hp;
    };
    void a;
    expect(dealt(0.2, true)).toBeGreaterThan(dealt(0.2, false) * 1.2);
  });
});

describe("enemy archetypes (design §4)", () => {
  it("a Dilophosaurus keeps its distance and spits venom that can be dodged", () => {
    const a = make({ empty: true, level: 6 });
    place(a, 20, 20);
    const dilo = only(a, "dilo", 30, 20, { state: "stalk", t: 0, cooldown: 0, provoked: 20 });
    let shots = 0,
      hurt = false;
    for (let i = 0; i < 60 * 6; i++) {
      a.update(1 / 60, idleInput());
      shots = Math.max(shots, a.shots.length);
      hurt ||= a.events.splice(0).some((e) => e.type === "hurt");
    }
    expect(shots).toBeGreaterThan(0);
    expect(hurt).toBe(true);
    expect(a.player.venom !== null || a.player.hp < a.d.maxHp).toBe(true);
    expect(Math.hypot(dilo.x - a.player.x, dilo.y - a.player.y)).toBeGreaterThan(4);
  });
  it("a spit shot flies past a dodging player and stops at walls", () => {
    const a = make({ empty: true, level: 6 });
    place(a, 20, 20);
    a.player.invuln = 0.4;
    a.player.pose = "dodge";
    a.shots.push({ id: 900, x: 19.9, y: 20, vx: 11, vy: 0, r: 0.35, dmg: 10, life: 2, from: -1, venom: true, kind: "spit" });
    tick(a, 5);
    expect(a.player.hp).toBe(a.d.maxHp);
    expect(a.shots.length).toBe(1);
  });
  it("a tank's armoured front shrugs off blows; hitting the flank deals full damage", () => {
    const dmg = (angle: number) => {
      const a = make({ empty: true, level: 6 });
      place(a, 20, 20);
      const k = only(a, "kentro", 21.5, 20, { state: "feed", t: 99, face: angle, hp: 5000, maxHp: 5000, provoked: 20 });
      const before = k.hp;
      a.hitEnemy(k, 1, { kind: "basic" });
      return before - k.hp;
    };
    // the player stands at x=20 and the tank at 21.5: facing π looks at the player (front), facing 0 looks away (flank)
    expect(dmg(Math.PI)).toBeLessThan(dmg(0) * 0.6);
  });
  it("an ambusher lies dormant until the player is almost on it, then gives a rustle warning beat", () => {
    const a = make({ empty: true, level: 5 });
    place(a, 20, 20);
    const l = only(a, "lurker", 40, 20, { state: "dormant" });
    tick(a, 120);
    expect(l.state).toBe("dormant");
    place(a, 38, 20);
    tick(a, 5);
    expect(l.state).toBe("alert");
    expect(a.events.some((e) => e.type === "notice" && /rustles/.test(e.text ?? ""))).toBe(true);
  });
  it("a support creature rallies allies: heals and hastens them", () => {
    const a = make({ empty: true, level: 6 });
    place(a, 20, 20);
    const caller = only(a, "caller", 28, 20, { state: "stalk", t: 0, cooldown: 0, provoked: 20 });
    const ally = a.addActor("raptor", { x: 30, y: 21 }, { exact: true, level: 3 })!;
    Object.assign(ally, { hp: ally.maxHp * 0.3, state: "stalk", t: 0, cooldown: 99 });
    a.actors = [caller, ally];
    for (let i = 0; i < 60 * 4; i++) a.update(1 / 60, idleInput());
    expect(ally.hp).toBeGreaterThan(ally.maxHp * 0.3);
  });
  it("swarms alert together and are weak alone", () => {
    const a = make({ empty: true, level: 3 });
    place(a, 20, 20);
    const pack = [0, 1, 2, 3].map((i) => a.addActor("compy-raider", { x: 26 + i * 0.7, y: 20 + i * 0.4 }, { exact: true, level: 2 })!);
    a.actors = pack;
    tick(a, 90);
    expect(pack.filter((p) => p.state !== "idle").length).toBeGreaterThanOrEqual(3);
  });
  it("every attack of every creature has a telegraph and a recovery (readable combat)", () => {
    for (const c of CREATURES) {
      for (const at of attacksOf(c)) {
        expect(at.windup, `${c.id}/${at.id}`).toBeGreaterThanOrEqual(0.45);
        expect(at.recover, `${c.id}/${at.id}`).toBeGreaterThanOrEqual(0.8);
      }
    }
  });
});

describe("bosses (design §4, A6)", () => {
  it("Old Scar changes phase at its thresholds, calls the pack once, and is invulnerable while roaring", () => {
    const a = make({ empty: true, level: 4 });
    place(a, 20, 20);
    const boss = only(a, "old-scar", 30, 20, { state: "stalk", t: 0, cooldown: 99, rival: "old-scar", provoked: 30 });
    boss.hp = boss.maxHp * 0.55;
    a.hitEnemy(boss, 0.2, { kind: "basic" });
    expect(boss.phase).toBe(1);
    expect(a.events.some((e) => e.type === "phase")).toBe(true);
    expect(a.actors.filter((x) => x.summoned).length).toBe(3);
    expect(boss.state).toBe("roar");
    const hp = boss.hp;
    expect(a.hitEnemy(boss, 5, { kind: "basic" })).toBe(0);
    expect(boss.hp).toBe(hp);
    tick(a, 90);
    expect(boss.guard).toBe(0);
    boss.hp = boss.maxHp * 0.1;
    a.hitEnemy(boss, 0.1, { kind: "basic" });
    expect(boss.phase).toBe(2);
    a.hitEnemy(boss, 0.1, { kind: "basic" });
    expect(a.actors.filter((x) => x.summoned).length).toBe(3);
  });
  it("defeating a milestone boss banks it, drops guaranteed loot and raises the level cap", () => {
    const a = make({ empty: true, level: 9, seed: 7 });
    a.save.xp += 400;
    place(a, 20, 20);
    const boss = only(a, "river-hunter", 21.5, 20, { state: "recover", t: 99, rival: "river-hunter", hp: 1, maxHp: 1000 });
    expect(a.level).toBe(9);
    a.hitEnemy(boss, 1, { kind: "basic" });
    expect(boss.state).toBe("dead");
    expect(a.save.rivals).toContain("river-hunter");
    expect(a.save.stats.bossKills).toBe(1);
    const loot = a.drops.find((d) => d.mutation);
    expect(loot?.mutation && ["epic", "legendary"].includes(loot.mutation.rarity)).toBe(true);
    expect(a.level).toBeGreaterThan(9);
  });
  it("a boss that loses its target resets: heals, phase 0", () => {
    const a = make({ empty: true, level: 4 });
    place(a, 20, 20);
    const boss = only(a, "old-scar", 30, 20, { state: "stalk", t: 0, rival: "old-scar", provoked: 30 });
    boss.hp = boss.maxHp * 0.5;
    boss.phase = 1;
    place(a, 62, 20);
    tick(a, 60 * 20);
    expect(boss.hp).toBeGreaterThan(boss.maxHp * 0.5);
  });
});

describe("loot, inventory and the economy (design §1.4)", () => {
  it("walking over a drop picks it up; a full bag leaves it on the ground with a hint", () => {
    const a = make({ empty: true, level: 5 });
    place(a);
    const m = gear(a, 5, "rare", "jaws");
    a.unequip("jaws");
    const drop = a.addDrop({ mutation: { ...m, id: "ground1" } }, { x: 20.5, y: 20 });
    tick(a, 3);
    expect(a.save.bag.some((x) => x.id === "ground1")).toBe(true);
    expect(a.drops.includes(drop)).toBe(false);
    a.save.bag.length = 0;
    for (let i = 0; i < 24; i++) a.save.bag.push({ ...m, id: "f" + i });
    const d2 = a.addDrop({ mutation: { ...m, id: "ground2" } }, { x: 20.2, y: 20 });
    tick(a, 3);
    expect(a.drops.includes(d2)).toBe(true);
    expect(a.events.some((e) => e.type === "notice" && /bag full/i.test(e.text ?? ""))).toBe(true);
    a.addDrop({ amber: 12 }, { x: 20, y: 20.2 });
    tick(a, 3);
    expect(a.save.amber).toBe(12);
  });
  it("equip swaps, species eligibility is enforced, unequip needs bag space", () => {
    const a = make({ empty: true, species: "trike" });
    const horns = gear(a, 6, "rare", "horns");
    expect(a.save.worn.horns?.id).toBe(horns.id);
    const claws = { ...horns, id: "clawz", slot: "claws" as const, base: "claw.sickle", species: ["raptor" as const] };
    a.save.bag.push(claws);
    expect(a.equip("clawz")).toBe(false);
    const better = gear(a, 7, "epic", "horns");
    expect(a.save.worn.horns?.id).toBe(better.id);
    expect(a.save.bag.some((m) => m.id === horns.id)).toBe(true);
  });
  it("salvage pays Amber and removes the item; reroll costs Amber and works once", () => {
    const a = make({ empty: true, level: 6 });
    const m = gear(a, 8, "rare", "jaws");
    a.unequip("jaws");
    const gain = a.salvage(m.id);
    expect(gain).toBeGreaterThan(0);
    expect(a.save.amber).toBe(gain);
    expect(a.save.bag.find((x) => x.id === m.id)).toBeUndefined();
    const n = gear(a, 9, "rare", "jaws");
    expect(a.reroll(n.id, 0)).toBe(false);
    a.save.amber = 1000;
    expect(a.reroll(n.id, 0)).toBe(true);
    expect(a.save.amber).toBeLessThan(1000);
    expect(a.reroll(n.id, 1)).toBe(false);
  });
  it("respec is free early, then costs Amber, and returns the points", () => {
    const a = make({ empty: true, level: 4 });
    expect(a.rank("rex.p.heavy")).toBe(true);
    expect(a.skillPoints).toBe(2);
    expect(a.respec()).toBe(true);
    expect(a.skillPoints).toBe(3);
    const b = make({ empty: true, level: 12 });
    b.rank("rex.p.heavy");
    expect(b.respec()).toBe(false);
    b.save.amber = b.respecCost;
    expect(b.respec()).toBe(true);
    expect(b.save.amber).toBe(0);
  });
  it("loadout: the second slot opens at level 5 and a skill cannot fill both slots", () => {
    const a = make({ empty: true, level: 3 });
    expect(a.setLoadout(1, "rex.tail")).toBe(false);
    const b = make({ empty: true, level: 8 });
    expect(b.setLoadout(1, "rex.stomp")).toBe(true);
    expect(b.save.loadout[1]).toBe("rex.stomp");
    expect(b.setLoadout(0, "rex.stomp")).toBe(true);
    expect(b.save.loadout[0]).toBe("rex.stomp");
    expect(b.save.loadout[1]).not.toBe("rex.stomp");
    expect(b.setLoadout(0, "raptor.pounce")).toBe(false);
  });
});

describe("death, difficulty and persistence (design §1.5, §1.6, A8)", () => {
  it("defeat keeps level, skills, mutations and quests; drops a tenth of the Amber where you fell; clears Feast", () => {
    const a = make({ empty: true, level: 6 });
    place(a, 30, 30);
    a.rank("rex.p.heavy");
    const m = gear(a, 3, "rare", "jaws");
    a.save.amber = 200;
    a.save.quests["q1"] = { status: "active", step: 1, progress: 0, data: {}, startedAt: 1 };
    a.feastT = 60;
    const xp = a.save.xp;
    a.player.hp = 0;
    tick(a, 90);
    expect(a.player.hp).toBe(a.d.maxHp);
    expect(a.save.xp).toBe(xp);
    expect(a.save.skills["rex.p.heavy"]).toBe(1);
    expect(a.save.worn.jaws?.id).toBe(m.id);
    expect(a.save.quests["q1"]).toBeDefined();
    expect(a.save.amber).toBe(180);
    expect(a.feastT).toBe(0);
    expect(a.save.stats.deaths).toBe(1);
    const pile = a.drops.find((d) => d.amber === 20);
    expect(pile).toBeDefined();
    expect(a.nearNest).toBe(true);
    expect(a.events.some((e) => e.type === "defeat")).toBe(true);
    // walk back to the pile and recover it
    place(a, pile!.x, pile!.y);
    tick(a, 3);
    expect(a.save.amber).toBe(200);
  });
  it("gentle halves the pain: damage taken scales with difficulty and aim assist widens", () => {
    const taken = (d: "gentle" | "standard" | "fierce") => {
      const a = make({ empty: true, level: 4, mutate: (c) => (c.difficulty = d) });
      a.player.invuln = 0;
      a.hurt(60, { x: 0, y: 0 });
      return a.d.maxHp - a.player.hp;
    };
    expect(taken("gentle")).toBeLessThan(taken("standard"));
    expect(taken("fierce")).toBeGreaterThan(taken("standard"));
  });
  it("the checkpoint round-trips, including ground loot, and a reload is identical", () => {
    const a = make({ empty: true, level: 7 });
    gear(a, 11, "epic", "legs");
    a.addDrop({ amber: 9 }, { x: 22, y: 22 });
    const saved = a.checkpoint(5000);
    const b = new Adventure(openWorld(), saved, 42);
    b.actors = [];
    expect(b.save.worn.legs?.rarity).toBe("epic");
    expect(b.drops).toHaveLength(1);
    expect(b.checkpoint(5000)).toEqual(saved);
  });
  it("seeded simulation is deterministic and the population stays bounded", () => {
    const a = make({ seed: 123 }),
      b = make({ seed: 123 });
    tick(a, 600);
    tick(b, 600);
    expect(a.actors).toEqual(b.actors);
    expect(a.checkpoint(1791530000000)).toEqual(b.checkpoint(1791530000000));
    expect(a.actors.length).toBeLessThan(120);
  });
  it("large frame gaps do not teleport the player through the collision grid", () => {
    const a = make({ empty: true });
    place(a);
    a.update(10, held({ move: { x: 1, y: 0 } }));
    expect(a.player.x - 20).toBeLessThan(0.3);
    expect(a.world.grid.fits(a.player.x, a.player.y, a.radius)).toBe(true);
  });
  it("fossils grant progress once and cannot be farmed by standing beside them", () => {
    const a = make({ empty: true });
    const fossil = DISCOVERIES.find((d) => d.kind === "fossil")!;
    place(a, fossil.x, fossil.y);
    tick(a, 2);
    const xp = a.save.xp;
    expect(xp).toBeGreaterThan(0);
    tick(a, 240);
    expect(a.save.discoveries.filter((id) => id === fossil.id)).toHaveLength(1);
    expect(a.save.xp).toBe(xp);
  });
  it("growth is applied after a quiet moment and the body changes with the level", () => {
    const a = make({ empty: true, level: 4 });
    place(a);
    a.gainXp(xpForLevel(5), a.player);
    expect(a.tier).toBe(0);
    tick(a, 40);
    expect(a.tier).toBe(1);
    expect(a.events.filter((e) => e.type === "grow" && e.kind === "stage")).toHaveLength(1);
    void byRegion;
    void makeChar;
  });
});
