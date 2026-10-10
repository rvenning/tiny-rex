/** Typed content tables for the connected world. Positions are world units (see world/projection.ts). */
import { CONNECTED } from './connected-content';
import { CREATURES } from "./bestiary";
export type Dino = "rex" | "raptor" | "trike";
export type RegionId =
  "hollow" | "river" | "marsh" | "dunes" | "ember" | "caves";
export interface Point {
  x: number;
  y: number;
}
export const STAGES = ["Hatchling", "Juvenile", "Hunter", "Apex"] as const;
export const DINO_NAMES: Record<Dino, string> = {
  rex: "Rex",
  raptor: "Raptor",
  trike: "Triceratops",
};

/** growth points needed to complete stage i (index 0 -> Hatchling complete). Last = Apex, complete. */
export const GROWTH = [8, 30, 90, 200];
/** Stage milestones: completing the growth bar is not enough for Hunter/Apex. */
export const MILESTONE: (string | null)[] = [
  null,
  "river-hunter",
  "marsh-pack",
  null,
];

export interface StageStats {
  r: number; // body radius (collision)
  speed: number; // u/s
  reach: number; // bite reach beyond body
  damage: number;
  dodgeDist: number;
  sprite: number; // display scale of the sprite
}
export interface DinoSpec {
  id: Dino;
  name: string;
  atlas: string; // creature atlas id prefix; rex uses rex_<stage>
  stages: StageStats[];
  biteCd: number;
  dodgeCd: number;
  skillCd: number;
  skillName: string;
  skillStage: number; // first stage with the skill
  skillBlurb: string;
  blurb: string;
}
export const DINOS: Record<Dino, DinoSpec> = {
  rex: {
    id: "rex",
    name: "Rex",
    atlas: "rex",
    stages: [
      {
        r: 0.45,
        speed: 5.4,
        reach: 1.15,
        damage: 10,
        dodgeDist: 3.3,
        sprite: 1,
      },
      {
        r: 0.65,
        speed: 5.3,
        reach: 1.5,
        damage: 18,
        dodgeDist: 3.7,
        sprite: 1,
      },
      { r: 0.9, speed: 5.1, reach: 1.9, damage: 32, dodgeDist: 4.0, sprite: 1 },
      { r: 1.2, speed: 4.9, reach: 2.4, damage: 54, dodgeDist: 4.3, sprite: 1 },
    ],
    biteCd: 0.45,
    dodgeCd: 1.0,
    skillCd: 7,
    skillName: "Roar",
    skillStage: 1,
    skillBlurb: "Interrupts wind-ups and scares smaller hunters",
    blurb: "Powerful and steady. Bites hard, roars to break an attack.",
  },
  raptor: {
    id: "raptor",
    name: "Raptor",
    atlas: "raptor",
    stages: [
      {
        r: 0.4,
        speed: 6.6,
        reach: 1.1,
        damage: 8,
        dodgeDist: 3.8,
        sprite: 0.8,
      },
      {
        r: 0.5,
        speed: 6.5,
        reach: 1.3,
        damage: 14,
        dodgeDist: 4.1,
        sprite: 0.9,
      },
      { r: 0.6, speed: 6.4, reach: 1.5, damage: 24, dodgeDist: 4.4, sprite: 1 },
      {
        r: 0.7,
        speed: 6.3,
        reach: 1.7,
        damage: 38,
        dodgeDist: 4.6,
        sprite: 1.1,
      },
    ],
    biteCd: 0.36,
    dodgeCd: 0.85,
    skillCd: 4,
    skillName: "Pounce",
    skillStage: 0,
    skillBlurb: "A long leap that bites at the end",
    blurb: "Fast and slippery. Flank, pounce, slip through root gaps.",
  },
  trike: {
    id: "trike",
    name: "Triceratops",
    atlas: "trike",
    stages: [
      {
        r: 0.6,
        speed: 4.6,
        reach: 1.3,
        damage: 11,
        dodgeDist: 2.6,
        sprite: 0.75,
      },
      {
        r: 0.8,
        speed: 4.5,
        reach: 1.6,
        damage: 20,
        dodgeDist: 2.8,
        sprite: 0.88,
      },
      { r: 1.0, speed: 4.4, reach: 1.9, damage: 34, dodgeDist: 3.0, sprite: 1 },
      {
        r: 1.25,
        speed: 4.3,
        reach: 2.2,
        damage: 52,
        dodgeDist: 3.2,
        sprite: 1.12,
      },
    ],
    biteCd: 0.5,
    dodgeCd: 1.1,
    skillCd: 6,
    skillName: "Charge",
    skillStage: 0,
    skillBlurb: "A committed charge that smashes rubble",
    blurb:
      "Sturdy plant-eater. Graze fern patches to grow, defend with horns, charge through rubble.",
  },
};
export const MAX_HP = 3;

export { CREATURES, creature, attacksOf } from "./bestiary";
export type { CreatureSpec, Role, Archetype, AttackDef, AttackKind, BossDef, BossPhase } from "./bestiary";


export interface Region {
  id: RegionId;
  name: string;
  bounds: [number, number, number, number];
  nest: Point;
  required: number; // stage needed to enter freely
  blurb: string;
  built: boolean;
}
export const REGIONS: Region[] = CONNECTED.regions.map(r => ({ ...r, bounds: [...r.bounds], nest: { ...r.nest } }));
export const byRegion = (id: RegionId) => REGIONS.find((r) => r.id === id)!;
export const regionAt = (p: Point) =>
  REGIONS.find(
    (r) =>
      p.x >= r.bounds[0] &&
      p.x < r.bounds[2] &&
      p.y >= r.bounds[1] &&
      p.y < r.bounds[3],
  );

export interface Discovery extends Point {
  id: string;
  region: RegionId;
  kind: "fossil" | "egg" | "forage" | "tracks" | "nest";
  name: string;
  blurb: string;
  reward: number;
}
const HOLLOW_DISCOVERIES: Discovery[] = [
  {
    id: "fossil-hollow-shelf",
    region: "hollow",
    kind: "fossil",
    name: "Ancient ribs",
    blurb: "A fossil shelf above the stepping stones.",
    x: 46.2,
    y: 15.6,
    reward: 3,
  },
  {
    id: "tracks-hollow",
    region: "hollow",
    kind: "tracks",
    name: "Unusual tracks",
    blurb: "Three-toed prints lead toward the south trail.",
    x: 25.5,
    y: 55,
    reward: 2,
  },
  {
    id: "forage-hollow-a",
    region: "hollow",
    kind: "forage",
    name: "Sweet fern patch",
    blurb: "Soft young fronds. Restores health.",
    x: 34.5,
    y: 41.5,
    reward: 0,
  },
  {
    id: "egg-hollow",
    region: "hollow",
    kind: "egg",
    name: "Raptor eggs",
    blurb: "Rescue the clutch to hatch a Raptor at your refuge.",
    x: 47.5,
    y: 40.5,
    reward: 3,
  },
  {
    id: "forage-hollow-b",
    region: "hollow",
    kind: "forage",
    name: "Young fern patch",
    blurb: "A plant-eater's meal beside the clearing.",
    x: 31,
    y: 39,
    reward: 0,
  },
  {
    id: "forage-hollow-c",
    region: "hollow",
    kind: "forage",
    name: "Tender fronds",
    blurb: "Fresh food beside the creek trail.",
    x: 43,
    y: 35,
    reward: 0,
  },
];
export const DISCOVERIES: Discovery[] = [...HOLLOW_DISCOVERIES, ...CONNECTED.discoveries.map(d => ({...d}))];
/** Shared by the simulation, save repair and journal. Unlocks never revoke earned species. */
export const SPECIES_REQUIREMENTS: Record<Dino, string> = {
  rex: "Your first hatchling",
  raptor: "Rescue the Raptor eggs beside the east trail",
  trike: "Find Ancient ribs and study four different creatures",
};
export function earnedSpecies(
  discoveries: string[],
  studied: string[],
): Dino[] {
  const species: Dino[] = ["rex"];
  if (discoveries.includes("egg-hollow")) species.push("raptor");
  if (discoveries.includes("fossil-hollow-shelf") && new Set(studied).size >= 4)
    species.push("trike");
  return species;
}
export interface Rival {
  id: string;
  name: string;
  species: string;
  region: RegionId;
  home: Point;
  companions?: Point[];
  pattern?: string;
}
/** boss creature spec used for each milestone encounter (the generated content only names a placeholder species) */
const RIVAL_SPECIES: Record<string, string> = { "river-hunter": "river-hunter", "marsh-pack": "reed-stalker", "basalt-matriarch": "gigano" };
export const RIVALS: Rival[] = [
  ...CONNECTED.rivals.map(r => ({...r, species: RIVAL_SPECIES[r.id] ?? r.species, home: {...r.home}, companions: 'companions' in r ? r.companions.map(p => ({...p})) : []})),
  // the Hollow's miniboss holds the old perch (formerly an unnamed sentinel raptor)
  { id: "old-scar", name: "Old Scar", species: "old-scar", region: "hollow" as RegionId, home: { x: 40.5, y: 31 }, companions: [] },
];

/** Initial population per region: [creature, x, y]. Hollow's raptor guards its perch. */
export const SPAWNS: Record<RegionId, [string, number, number][]> = {
  hollow: [
    ["beetle", 32, 38],
    ["beetle", 35, 33],
    ["beetle", 29, 31],
    ["beetle", 23, 37],
    ["beetle", 44, 36.5],
    ["beetle", 36, 44],
    ["dragonfly", 30, 27],
    ["dragonfly", 52, 28],
    ["compy", 49, 34],
    ["compy", 50.5, 35.5],
    ["compy", 24.5, 52],
    ["raptor", 40.5, 31],
  ],
  river: [],
  marsh: [],
  dunes: [],
  ember: [],
  caves: [],
};
export const SENTINELS = new Set(["old-scar@40.5,31"]);
for (const id of ['river','marsh','dunes','ember','caves'] as RegionId[]) SPAWNS[id] = CONNECTED.spawns[id as keyof typeof CONNECTED.spawns].map(s => [...s] as [string,number,number]);
export interface Gate extends Point { id:string; name:string; kind:string; requiredStage:number; width:number; normal:readonly number[]; fromRegion?:RegionId; toRegion?:RegionId; species?:Dino; optional?:boolean; prop?:string; action?:string; blurb?:string; }
export interface Portal extends Point { id:string; name:string; to:Point; requiredStage:number; species?:Dino; bidirectional:boolean; optional:boolean; }
export interface MasteryObjective { id:string; region:RegionId; name:string; kind:string; target?:string; count?:number; seconds?:number; reward:number; destination?:string; from?:Point; to?:Point; }
export const GATES = CONNECTED.gates as unknown as readonly Gate[];
export const PORTALS = CONNECTED.portals as unknown as readonly Portal[];
export const OBJECTIVES = CONNECTED.objectives as unknown as readonly MasteryObjective[];
export const WORLD_BOUNDS = [-20,-20,214,150] as const;
export function objectiveDescription(o: MasteryObjective) {
  switch(o.kind) {
    case 'slow-hunt': return `Creep close and hunt ${o.count} beetles.`;
    case 'settled-hunt': return `Wait still, then catch ${o.count} unaware dragonflies.`;
    case 'clean-rival': return 'Win the whole encounter without taking a hit. Return to its territory for a rematch.';
    case 'deliver-discovery': return 'Find the lost clutch and carry it back to the marsh refuge.';
    case 'separated-rival': return 'Draw one pack hunter at least eight paces away from its companion, then defeat both.';
    case 'escort': return 'Find the lost hatchling near the wing fossil and lead it home. It waits when you leave it behind or hunters attack.';
    case 'recovery-hunt': return `Defeat ${o.count} Dilophosaurus during their recovery after a strike.`;
    case 'observe-neutral': return `Watch an unprovoked Triceratops quietly for ${o.seconds} seconds.`;
    case 'regional-fossils': return `Find all ${o.count} Echo Caves fossils.`;
    default: return 'Explore and read the creatures around you.';
  }
}

