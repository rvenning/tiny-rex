import { Random } from "../game/random";
export type Dino = "rex" | "raptor" | "trike";
export type RegionId =
  "hollow" | "river" | "marsh" | "dunes" | "ember" | "caves";
export interface Point {
  x: number;
  y: number;
}
export interface Region {
  id: RegionId;
  name: string;
  x: number;
  y: number;
  color: number;
  edge: number;
  required: number;
  description: string;
}
export const SIZE = 900;
export const STAGES = ["Hatchling", "Juvenile", "Hunter", "Apex"];
export const GROWTH = [0, 80, 340, 900];
export const REGIONS: Region[] = [
  {
    id: "hollow",
    name: "Fern Hollow",
    x: 0,
    y: 0,
    color: 0x819b4f,
    edge: 0x314a32,
    required: 0,
    description: "Learn the hunt. Follow the creek.",
  },
  {
    id: "river",
    name: "Riverbend",
    x: 1,
    y: 0,
    color: 0xaaae6b,
    edge: 0x466a56,
    required: 0,
    description: "Read the river hunter’s lunge.",
  },
  {
    id: "marsh",
    name: "Reed Marsh",
    x: 2,
    y: 0,
    color: 0x678569,
    edge: 0x29433e,
    required: 1,
    description: "Separate the pack. Find the refuge.",
  },
  {
    id: "caves",
    name: "Echo Caves",
    x: 0,
    y: 1,
    color: 0x74767c,
    edge: 0x363c48,
    required: 0,
    description: "Listen for echoes. Explore deeper as you grow.",
  },
  {
    id: "ember",
    name: "Ember Basin",
    x: 1,
    y: 1,
    color: 0x786354,
    edge: 0x332d37,
    required: 3,
    description: "Claim the basalt nest.",
  },
  {
    id: "dunes",
    name: "Sunscar dunes",
    x: 2,
    y: 1,
    color: 0xcdb275,
    edge: 0x8b6844,
    required: 2,
    description: "Let the charge pass. Take the flank.",
  },
];
export interface Passage {
  a: RegionId;
  b: RegionId;
  tier: number;
  name: string;
}
export const PASSAGES: Passage[] = [
  { a: "hollow", b: "river", tier: 0, name: "Creek trail" },
  { a: "river", b: "marsh", tier: 1, name: "Shallow ford" },
  { a: "hollow", b: "caves", tier: 0, name: "Cave mouth" },
  { a: "marsh", b: "dunes", tier: 2, name: "Fallen log" },
  { a: "dunes", b: "ember", tier: 3, name: "Fractured basalt" },
  { a: "caves", b: "ember", tier: 3, name: "Deep chamber" },
];
export const center = (r: Region): Point => ({
  x: r.x * SIZE + SIZE / 2,
  y: r.y * SIZE + SIZE / 2,
});
export const regionAt = (p: Point) =>
  REGIONS.find(
    (r) =>
      p.x >= r.x * SIZE &&
      p.x < (r.x + 1) * SIZE &&
      p.y >= r.y * SIZE &&
      p.y < (r.y + 1) * SIZE,
  );
export const byRegion = (id: RegionId) => REGIONS.find((r) => r.id === id)!;
export const nest = (r: Region): Point => ({
  x: r.x * SIZE + 270,
  y: r.y * SIZE + 320,
});
export const project = (p: Point) => ({
  x: (p.x - p.y) * 0.8,
  y: (p.x + p.y) * 0.46,
});
export const unproject = (p: Point) => ({
  x: p.x / 0.8 / 2 + p.y / 0.46 / 2,
  y: p.y / 0.46 / 2 - p.x / 0.8 / 2,
});
export interface Creature {
  id: string;
  name: string;
  model: string;
  tint: number;
  tier: number;
  hp: number;
  speed: number;
  reward: number;
  pattern: "prey" | "lunge" | "charge" | "sweep" | "armour";
  fact: string;
}
export const CREATURES: Creature[] = [
  {
    id: "beetle",
    name: "Giant beetle",
    model: "bug",
    tint: 0xd9a66a,
    tier: 0,
    hp: 1,
    speed: 55,
    reward: 5,
    pattern: "prey",
    fact: "Watch its antennae: it feeds, then pauses.",
  },
  {
    id: "dragonfly",
    name: "Meganeura",
    model: "bug",
    tint: 0x79d9ce,
    tier: 0,
    hp: 1,
    speed: 100,
    reward: 7,
    pattern: "prey",
    fact: "Wait for a landing, then close the gap.",
  },
  {
    id: "compy",
    name: "Compsognathus",
    model: "raptor-2",
    tint: 0xbacd6a,
    tier: 0,
    hp: 12,
    speed: 95,
    reward: 12,
    pattern: "prey",
    fact: "Small, quick and happier in a group.",
  },
  {
    id: "hypsi",
    name: "Hypsilophodon",
    model: "raptor-2",
    tint: 0xc9b178,
    tier: 1,
    hp: 20,
    speed: 112,
    reward: 20,
    pattern: "prey",
    fact: "Get close before it spots you.",
  },
  {
    id: "ovi",
    name: "Oviraptor",
    model: "raptor-2",
    tint: 0xf2bc72,
    tier: 1,
    hp: 25,
    speed: 85,
    reward: 22,
    pattern: "lunge",
    fact: "Its name came from a mistaken interpretation of a nest.",
  },
  {
    id: "raptor",
    name: "Velociraptor",
    model: "raptor-2",
    tint: 0xffffff,
    tier: 1,
    hp: 40,
    speed: 115,
    reward: 35,
    pattern: "lunge",
    fact: "Turkey-sized in life; feathered, with a hooked claw on each foot.",
  },
  {
    id: "kentro",
    name: "Kentrosaurus",
    model: "trike-2",
    tint: 0xcac2db,
    tier: 1,
    hp: 60,
    speed: 50,
    reward: 0,
    pattern: "armour",
    fact: "Its spikes make it a neighbour to leave in peace.",
  },
  {
    id: "galli",
    name: "Gallimimus",
    model: "raptor-2",
    tint: 0xdcc6a0,
    tier: 2,
    hp: 45,
    speed: 130,
    reward: 45,
    pattern: "prey",
    fact: "Built for running. Use the terrain to close in.",
  },
  {
    id: "dilo",
    name: "Dilophosaurus",
    model: "rex-2",
    tint: 0xc9d58e,
    tier: 2,
    hp: 65,
    speed: 100,
    reward: 50,
    pattern: "lunge",
    fact: "The real animal had two thin crests, and no evidence of a neck frill.",
  },
  {
    id: "trike",
    name: "Triceratops",
    model: "trike-2",
    tint: 0xffffff,
    tier: 2,
    hp: 100,
    speed: 75,
    reward: 0,
    pattern: "charge",
    fact: "A three-horned plant-eater. Leave room for its warning charge.",
  },
  {
    id: "rex",
    name: "Tyrannosaurus",
    model: "rex-3",
    tint: 0xb6d2a0,
    tier: 3,
    hp: 140,
    speed: 90,
    reward: 85,
    pattern: "sweep",
    fact: "Its powerful jaws mattered more than its small arms.",
  },
  {
    id: "gigano",
    name: "Giganotosaurus",
    model: "rex-3",
    tint: 0xd88d79,
    tier: 3,
    hp: 180,
    speed: 100,
    reward: 110,
    pattern: "sweep",
    fact: "A giant southern predator with a long skull.",
  },
];
export const creature = (id: string) => CREATURES.find((s) => s.id === id)!;
export interface Discovery extends Point {
  id: string;
  region: RegionId;
  kind: "fossil" | "egg" | "forage" | "tracks";
  name: string;
  tier: number;
  reward: number;
}
export const DISCOVERIES: Discovery[] = REGIONS.flatMap((r, i) => [
  ...[0, 1, 2].map((n) => ({
    id: `fossil-${r.id}-${n}`,
    region: r.id,
    kind: "fossil" as const,
    name: ["Ancient tooth", "Fern imprint", "Footprint slab"][n],
    x: r.x * SIZE + [270, 690, 710][n],
    y: r.y * SIZE + [660, 240, 700][n],
    tier: r.required + (r.id === "caves" && n === 2 ? 2 : 0),
    reward: 15,
  })),
  {
    id: `forage-${r.id}`,
    region: r.id,
    kind: "forage" as const,
    name: "Sweet fern patch",
    x: r.x * SIZE + 300,
    y: r.y * SIZE + 300,
    tier: r.required,
    reward: 12,
  },
  {
    id: `tracks-${r.id}`,
    region: r.id,
    kind: "tracks" as const,
    name: "Unusual tracks",
    x: r.x * SIZE + 590,
    y: r.y * SIZE + 610,
    tier: r.required,
    reward: 20,
  },
  ...(i === 2 || i === 4
    ? [
        {
          id: `egg-${r.id}`,
          region: r.id,
          kind: "egg" as const,
          name: i === 2 ? "Raptor egg" : "Triceratops egg",
          x: r.x * SIZE + 690,
          y: r.y * SIZE + 490,
          tier: r.required,
          reward: 30,
        },
      ]
    : []),
]);
export const RIVALS = [
  {
    id: "river-hunter",
    name: "River Hunter",
    region: "river" as const,
    species: "raptor",
    tier: 1,
  },
  {
    id: "marsh-pack",
    name: "Reed Stalker",
    region: "marsh" as const,
    species: "dilo",
    tier: 2,
  },
  {
    id: "basalt-matriarch",
    name: "Basalt Matriarch",
    region: "ember" as const,
    species: "gigano",
    tier: 3,
  },
];
export interface TerrainProp extends Point {
  kind: "rock" | "fern" | "palm" | "log" | "bone";
  radius: number;
  region: RegionId;
}
export const TERRAIN: TerrainProp[] = (() => {
  const random = new Random(929);
  return REGIONS.flatMap((r) =>
    Array.from({ length: 120 }, (_, i) => {
      const p = {
        x: r.x * SIZE + random.range(25, 875),
        y: r.y * SIZE + random.range(25, 875),
      };
      const kind: TerrainProp["kind"] =
        r.id === "caves" || r.id === "ember"
          ? i % 5 === 0
            ? "bone"
            : "rock"
          : r.id === "dunes"
            ? i % 5 === 0
              ? "bone"
              : "rock"
            : i % 3 === 0
              ? "palm"
              : i % 5 === 0
                ? "rock"
                : "fern";
      return {
        ...p,
        kind,
        radius: kind === "rock" ? 22 : kind === "palm" ? 9 : 0,
        region: r.id,
      };
    }).filter(
      (p) =>
        Math.abs((p.x % SIZE) - 450) > 125 &&
        Math.abs((p.y % SIZE) - 450) > 125 &&
        Math.hypot(p.x - nest(r).x, p.y - nest(r).y) > 110 &&
        !DISCOVERIES.some((d) => Math.hypot(d.x - p.x, d.y - p.y) < 75),
    ),
  );
})();
