import type { Dino, RegionId, Point } from "./data";
import {
  REGIONS,
  CREATURES,
  DISCOVERIES,
  RIVALS,
  byRegion,
  earnedSpecies,
  OBJECTIVES, GATES, PORTALS, WORLD_BOUNDS,
} from "./data";
/** World 2 uses unit coordinates; earlier saves keep earned progress and resume at a safe nest. */
export const WORLD_VERSION = 2;
export interface AdventureSave {
  version: 1;
  world: 2;
  xp: Record<Dino, number>;
  species: Dino[];
  discoveries: string[];
  regions: RegionId[];
  nests: RegionId[];
  rivals: string[];
  studied: string[];
  challenges: string[];
  gates: string[];
  mastery: Record<string, number>;
  elapsed: number;
  forage: Record<string, number>;
  snapshot: { dino: Dino; position: Point; nest: RegionId; at: number };
  updated: number;
  assist: boolean;
}
export const freshAdventure = (): AdventureSave => ({
  version: 1,
  world: 2,
  xp: { rex: 0, raptor: 0, trike: 0 },
  species: ["rex"],
  discoveries: [],
  regions: ["hollow"],
  nests: ["hollow"],
  rivals: [],
  studied: [],
  challenges: [],
  gates: [],
  mastery: {}, elapsed: 0, forage: {},
  snapshot: {
    dino: "rex",
    position: { ...byRegion("hollow").nest },
    nest: "hollow",
    at: 0,
  },
  updated: 0,
  assist: false,
});
const ids = ["rex", "raptor", "trike"] as Dino[];
const regionIds: RegionId[] = [
  "hollow",
  "river",
  "marsh",
  "dunes",
  "ember",
  "caves",
];
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
  const raw = record(value);
  // Preserve earned progress across world versions; only legacy coordinates are discarded.
  const p = raw,
    xp = record(p.xp),
    snap = record(p.snapshot),
    pos = record(snap.position),
    a = freshAdventure();
  a.xp = { rex: num(xp.rex), raptor: num(xp.raptor), trike: num(xp.trike) };
  a.species = [...new Set(["rex", ...list(p.species, ids)])] as Dino[];
  a.discoveries = list(
    p.discoveries,
    DISCOVERIES.map((x) => x.id).concat(
      Array.isArray(p.discoveries)
        ? p.discoveries.filter(
            (id): id is string => typeof id === "string" && id.length <= 100,
          )
        : [],
    ),
  );
  a.regions = [
    ...new Set(["hollow", ...list(p.regions, regionIds)]),
  ] as RegionId[];
  a.nests = [...new Set(["hollow", ...list(p.nests, regionIds)])] as RegionId[];
  a.rivals = list(
    p.rivals,
    RIVALS.map((r) => r.id).concat(["marsh-pack", "basalt-matriarch"]),
  );
  a.studied = list(
    p.studied,
    CREATURES.map((c) => c.id),
  );
  a.species = [
    ...new Set([...a.species, ...earnedSpecies(a.discoveries, a.studied)]),
  ];
  a.challenges = list(p.challenges, [
    'first-hunt',
    ...OBJECTIVES.map(o => o.id),
    "clean-river-hunter",
    "clean-marsh-pack",
    "clean-basalt-matriarch",
    "egg-rescue",
    "trail-hollow",
    "trail-river",
    "trail-marsh",
    "trail-dunes",
    "trail-ember",
    "trail-caves",
  ]);
  a.gates = list(p.gates, [
    ...GATES.map(g => g.id), ...PORTALS.map(g => g.id),
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
  const gateAliases: Record<string,string> = { 'Shallow ford':'river-ford', 'Fallen log':'marsh-log', 'Fractured basalt':'ember-basalt', 'Deep chamber':'cave-ember', 'Cave tunnel':'cave-dunes', 'Dune shortcut':'cave-dunes', 'Root passage':'raptor-roots', 'Rubble route':'trike-rubble' };
  a.gates = [...new Set(a.gates.flatMap(id => gateAliases[id] ? [id,gateAliases[id]] : [id]))];
  a.elapsed = num(p.elapsed);
  const mastery = record(p.mastery), forage = record(p.forage);
  for (const o of OBJECTIVES) a.mastery[o.id] = num(mastery[o.id], 1000);
  for (const [legacy,current] of [['clean-river-hunter','read-river'],['clean-basalt-matriarch','basalt-mastery']]) if (a.challenges.includes(legacy)) { if (!a.challenges.includes(current)) a.challenges.push(current); a.mastery[current]=1; }
  for (const d of DISCOVERIES.filter(d => d.kind === 'forage')) if (typeof forage[d.id] === 'number') a.forage[d.id] = num(forage[d.id]);
  const dino =
    ids.includes(snap.dino as Dino) && a.species.includes(snap.dino as Dino)
      ? (snap.dino as Dino)
      : "rex";
  const savedNest =
    a.nests.includes(snap.nest as RegionId) &&
    REGIONS.some((r) => r.id === snap.nest && r.built)
      ? (snap.nest as RegionId)
      : "hollow";
  a.snapshot = {
    dino,
    nest: savedNest,
    position:
      raw.world === WORLD_VERSION &&
      typeof pos.x === "number" &&
      typeof pos.y === "number" &&
      Number.isFinite(pos.x) &&
      Number.isFinite(pos.y) &&
      pos.x >= WORLD_BOUNDS[0] &&
      pos.x <= WORLD_BOUNDS[2] &&
      pos.y >= WORLD_BOUNDS[1] &&
      pos.y <= WORLD_BOUNDS[3]
        ? { x: pos.x, y: pos.y }
        : { ...byRegion(savedNest).nest },
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
  const maximum = (x: Record<string, number>, y: Record<string, number>) => Object.fromEntries([...new Set([...Object.keys(x), ...Object.keys(y)])].map(k => [k, Math.max(x[k] ?? 0, y[k] ?? 0)]));
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
    mastery: maximum(a.mastery ?? {}, b.mastery ?? {}), forage: maximum(a.forage ?? {}, b.forage ?? {}), elapsed: Math.max(a.elapsed ?? 0,b.elapsed ?? 0),
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
