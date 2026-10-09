import type { Dino, RegionId, Point } from "./content";
import { REGIONS, CREATURES, DISCOVERIES, nest, byRegion } from "./content";
export interface AdventureSave {
  version: 1;
  xp: Record<Dino, number>;
  species: Dino[];
  discoveries: string[];
  regions: RegionId[];
  nests: RegionId[];
  rivals: string[];
  studied: string[];
  challenges: string[];
  gates: string[];
  snapshot: { dino: Dino; position: Point; nest: RegionId; at: number };
  updated: number;
  assist: boolean;
}
export const freshAdventure = (): AdventureSave => ({
  version: 1,
  xp: { rex: 0, raptor: 0, trike: 0 },
  species: ["rex"],
  discoveries: [],
  regions: ["hollow"],
  nests: ["hollow"],
  rivals: [],
  studied: [],
  challenges: [],
  gates: [],
  snapshot: {
    dino: "rex",
    position: nest(byRegion("hollow")),
    nest: "hollow",
    at: 0,
  },
  updated: 0,
  assist: false,
});
const ids = ["rex", "raptor", "trike"] as Dino[];
const list = (v: unknown, allowed: string[]) =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.filter(
            (x): x is string => typeof x === "string" && allowed.includes(x),
          ),
        ),
      ]
    : [];
const num = (v: unknown, max = 1e9) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.min(v, max))
    : 0;
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export function validateAdventure(value: unknown): AdventureSave {
  const p = record(value),
    xp = record(p.xp),
    snap = record(p.snapshot),
    pos = record(snap.position),
    a = freshAdventure();
  a.xp = { rex: num(xp.rex), raptor: num(xp.raptor), trike: num(xp.trike) };
  a.species = [...new Set(["rex", ...list(p.species, ids)])] as Dino[];
  a.discoveries = list(
    p.discoveries,
    DISCOVERIES.map((x) => x.id),
  );
  a.regions = [
    ...new Set([
      "hollow",
      ...list(
        p.regions,
        REGIONS.map((r) => r.id),
      ),
    ]),
  ] as RegionId[];
  a.nests = [
    ...new Set([
      "hollow",
      ...list(
        p.nests,
        REGIONS.map((r) => r.id),
      ),
    ]),
  ] as RegionId[];
  a.rivals = list(p.rivals, ["river-hunter", "marsh-pack", "basalt-matriarch"]);
  a.studied = list(
    p.studied,
    CREATURES.map((c) => c.id),
  );
  a.challenges = list(p.challenges, [
    "clean-river",
    "clean-marsh",
    "clean-ember",
    "egg-rescue",
    "trail-hollow",
    "trail-river",
    "trail-marsh",
    "trail-dunes",
    "trail-ember",
    "trail-caves",
  ]);
  a.gates = list(p.gates, [
    "Creek trail",
    "Shallow ford",
    "Cave mouth",
    "Fallen log",
    "Fractured basalt",
    "Deep chamber",
    "Cave tunnel",
    "Dune shortcut",
    "Root passage",
    "Rubble route",
  ]);
  const dino =
    ids.includes(snap.dino as Dino) && a.species.includes(snap.dino as Dino)
      ? (snap.dino as Dino)
      : "rex";
  const savedNest = a.nests.includes(snap.nest as RegionId)
    ? (snap.nest as RegionId)
    : "hollow";
  a.snapshot = {
    dino,
    nest: savedNest,
    position:
      typeof pos.x === "number" &&
      typeof pos.y === "number" &&
      Number.isFinite(pos.x) &&
      Number.isFinite(pos.y) &&
      pos.x >= 25 &&
      pos.x <= 2675 &&
      pos.y >= 25 &&
      pos.y <= 1775
        ? { x: pos.x, y: pos.y }
        : nest(byRegion(savedNest)),
    at: num(snap.at, Number.MAX_SAFE_INTEGER),
  };
  a.updated = num(p.updated, Number.MAX_SAFE_INTEGER);
  a.assist = p.assist === true;
  return a;
}
export function mergeAdventure(
  a: AdventureSave,
  b: AdventureSave,
): AdventureSave {
  const union = <T>(x: T[], y: T[]) => [...new Set([...x, ...y])];
  const latest = b.snapshot.at > a.snapshot.at ? b : a;
  return validateAdventure({
    ...latest,
    xp: {
      rex: Math.max(a.xp.rex, b.xp.rex),
      raptor: Math.max(a.xp.raptor, b.xp.raptor),
      trike: Math.max(a.xp.trike, b.xp.trike),
    },
    species: union(a.species, b.species),
    discoveries: union(a.discoveries, b.discoveries),
    regions: union(a.regions, b.regions),
    nests: union(a.nests, b.nests),
    rivals: union(a.rivals, b.rivals),
    studied: union(a.studied, b.studied),
    challenges: union(a.challenges, b.challenges),
    gates: union(a.gates, b.gates),
    updated: Math.max(a.updated, b.updated),
  });
}
export class AdventureStore {
  available = true;
  read(id: string): AdventureSave {
    for (const suffix of ["", "_backup"]) {
      try {
        const value = JSON.parse(
          localStorage.getItem("trex_adventure_v1_" + id + suffix) || "null",
        );
        if (value?.version === 1) return validateAdventure(value);
      } catch {}
    }
    return freshAdventure();
  }
  write(id: string, data: AdventureSave) {
    const merged = mergeAdventure(this.read(id), data);
    try {
      const key = "trex_adventure_v1_" + id;
      const old = localStorage.getItem(key);
      if (old) {
        try {
          if (JSON.parse(old)?.version === 1)
            localStorage.setItem(key + "_backup", old);
        } catch {}
      }
      localStorage.setItem(key, JSON.stringify(merged));
    } catch {
      this.available = false;
    }
    return merged;
  }
}
