import { describe, it, expect } from "vitest";
import { HAZARDS } from "../src/adventure/hazards";
import { make, tick, place } from "./helpers/sim";

describe("hazards", () => {
  it("toxic gas hurts only while you stand in it, and falls silent once its flag is set", () => {
    const toxic = HAZARDS.find((h) => h.kind === "toxic" && h.offFlag)!;
    expect(toxic).toBeDefined();
    const a = make({ empty: true, level: 10 });
    place(a, toxic.x, toxic.y);
    a.player.invuln = 0;
    const hp = a.player.hp;
    tick(a, 120);
    expect(a.player.hp).toBeLessThan(hp);
    place(a, toxic.x + toxic.r + 6, toxic.y);
    const outside = a.player.hp;
    tick(a, 60);
    expect(a.player.hp).toBeGreaterThanOrEqual(outside);
    a.setFlag(toxic.offFlag!);
    place(a, toxic.x, toxic.y);
    const safe = a.player.hp;
    tick(a, 120);
    expect(a.player.hp).toBeGreaterThanOrEqual(safe);
  });
  it("steam vents warn before they burst and burst on a cycle", () => {
    const vent = HAZARDS.find((h) => h.kind === "steam")!;
    expect(vent.warn).toBeGreaterThan(0.8);
    const a = make({ empty: true, level: 20 });
    place(a, vent.x, vent.y);
    a.player.invuln = 0;
    let bursts = 0,
      warns = 0;
    a.listeners.push((e) => {
      if (e.type === "hazard" && e.kind === "steam-burst") bursts++;
      if (e.type === "hazard" && e.kind === "steam-warn") warns++;
    });
    tick(a, 60 * 16);
    expect(warns).toBeGreaterThanOrEqual(2);
    expect(bursts).toBeGreaterThanOrEqual(2);
    expect(Math.abs(warns - bursts)).toBeLessThanOrEqual(2);
  });
  it("every hazard has a sane radius and damage", () => {
    for (const h of HAZARDS) {
      expect(h.r).toBeGreaterThan(0.5);
      expect(h.r).toBeLessThan(6);
      if (h.kind !== "quicksand") expect(h.dmg).toBeGreaterThan(0);
      expect(h.dmg).toBeLessThan(0.3);
    }
  });
});
