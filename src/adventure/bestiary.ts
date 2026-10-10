/** Creature and attack tables: archetypes, telegraphed attacks and boss phases. Pure data; sim.ts interprets it. */
export type Role = "prey" | "lunger" | "sweeper" | "charger" | "armour";
export type Archetype = "prey" | "rusher" | "swarm" | "ranged" | "tank" | "ambusher" | "support" | "miniboss" | "boss" | "neutral";
export type AttackKind = "lunge" | "sweep" | "slam" | "spit" | "volley" | "charge" | "summon" | "rally";

export interface AttackDef {
  id: string;
  kind: AttackKind;
  /** callout shown above the creature while it winds up */
  name: string;
  windup: number;
  strike: number;
  recover: number;
  /** reach of fans / lunges, radius of slams, range of projectiles */
  reach: number;
  /** half angle of fans */
  arc?: number;
  /** hearts of damage at level 1 (28 HP each) */
  damage: number;
  speed?: number;
  /** distance band in which the attack is chosen */
  range?: [number, number];
  cd: number;
  count?: number;
  stun?: number;
  knock?: number;
  /** relative pick weight */
  weight?: number;
  /** projectile hits apply venom */
  venom?: boolean;
  /** summon / rally payload */
  adds?: { id: string; count: number };
}

export interface BossPhase {
  /** enter this phase when health fraction falls to this or below */
  at: number;
  text: string;
  /** ids from the creature's `attacks` usable in this phase (empty = all) */
  attacks: string[];
  speed: number;
  cd: number;
  /** adds called on entering the phase */
  summon?: { id: string; count: number };
  /** seconds of roaring, invulnerable transition */
  roar?: number;
}
export interface BossDef {
  title: string;
  phases: BossPhase[];
  /** leash around its home: leaving heals and resets it */
  arena: number;
  /** poise: a *non-skill* hit can never interrupt it */
  armoured: boolean;
}

export interface CreatureSpec {
  id: string;
  name: string;
  /** creature atlas id */
  sprite: string;
  role: Role;
  archetype: Archetype;
  /** typical level at which this appears; spawns may override */
  level: number;
  r: number;
  speed: number;
  hp: number;
  /** comparable size/threat tier 0..4 */
  power: number;
  /** legacy growth reward, now only used to rank threat */
  reward: number;
  sense: number;
  scale: number;
  fact: string;
  tint?: number;
  /** damage multiplier from the front arc (tanks); 1 = none */
  frontal?: number;
  attacks?: AttackDef[];
  boss?: BossDef;
  // ---- legacy single-attack fields (kept so tuned creatures stay as they were)
  windup?: number;
  strike?: number;
  recover?: number;
  reach?: number;
  arc?: number;
  lungeSpeed?: number;
  damage?: number;
  cooldown?: number;
  /** keeps this distance from the player (ranged and support) */
  keepAway?: number;
}

const L = (o: Omit<AttackDef, "kind"> & { kind?: AttackKind }): AttackDef => ({ kind: "lunge", ...o });

export const CREATURES: CreatureSpec[] = [
  // ------------------------------------------------------------------ prey
  { id: "beetle", name: "Giant beetle", sprite: "beetle", role: "prey", archetype: "prey", level: 1, r: 0.3, speed: 1.6, hp: 1, power: 0, reward: 1, sense: 4.5, scale: 1, fact: "It feeds, then freezes. Move slowly and it may not notice you." },
  { id: "dragonfly", name: "Meganeura", sprite: "dragonfly", role: "prey", archetype: "prey", level: 2, r: 0.3, speed: 4.2, hp: 1, power: 0, reward: 2, sense: 5.5, scale: 1, fact: "A giant dragonfly. Wait for it to settle on a reed." },
  { id: "compy", name: "Compsognathus", sprite: "compy", role: "prey", archetype: "prey", level: 2, r: 0.4, speed: 5.4, hp: 6, power: 0, reward: 3, sense: 8, scale: 1, fact: "Small, quick and always in a group." },
  { id: "hypsi", name: "Hypsilophodon", sprite: "hypsilophodon", role: "prey", archetype: "prey", level: 3, r: 0.55, speed: 5.1, hp: 16, power: 1, reward: 5, sense: 9, scale: 1, fact: "A nimble grazer. It bolts when you break into a run." },
  // ------------------------------------------------------------------ rushers and swarms
  {
    id: "raptor", name: "Velociraptor", sprite: "raptor", role: "lunger", archetype: "rusher", level: 3, r: 0.7, speed: 5.8, hp: 60, power: 2, reward: 14, sense: 11, scale: 1,
    fact: "Feathered, turkey-sized in life, with a hooked claw on each foot.",
    windup: 0.85, strike: 0.36, recover: 1.25, reach: 4.8, arc: 0.3, lungeSpeed: 12, damage: 1, cooldown: 1.4,
  },
  {
    id: "compy-raider", name: "Compy raider", sprite: "compy", role: "lunger", archetype: "swarm", level: 2, r: 0.38, speed: 6.1, hp: 15, power: 0, reward: 4, sense: 9, scale: 1.05, tint: 0xffd9b0,
    fact: "Alone they are nothing. In a pack of six, treat them like a raptor.",
    attacks: [L({ id: "nip", name: "Nip", windup: 0.5, strike: 0.26, recover: 0.8, reach: 2.6, arc: 0.4, damage: 0.3, speed: 11, cd: 1.1 })],
  },
  {
    id: "oviraptor", name: "Oviraptor", sprite: "oviraptor", role: "lunger", archetype: "rusher", level: 4, r: 0.65, speed: 5.0, hp: 36, power: 1, reward: 8, sense: 9, scale: 1,
    fact: "Its name came from a mistaken reading of a nest.",
    windup: 0.8, strike: 0.34, recover: 1.1, reach: 4.0, arc: 0.3, lungeSpeed: 11, damage: 0.8, cooldown: 1.6,
  },
  // ------------------------------------------------------------------ ranged, support, ambusher, tank
  {
    id: "dilo", name: "Dilophosaurus", sprite: "dilophosaurus", role: "lunger", archetype: "ranged", level: 6, r: 0.85, speed: 4.8, hp: 90, power: 3, reward: 22, sense: 12, scale: 1, keepAway: 7.5,
    fact: "The real animal had two thin head crests and no neck frill. Spitting venom is a storybook habit.",
    attacks: [
      L({ id: "spit", kind: "spit", name: "Venom spit", windup: 0.9, strike: 0.2, recover: 1.05, reach: 14, damage: 0.7, speed: 11, range: [4.5, 13], cd: 2.4, venom: true, weight: 3 }),
      L({ id: "snap", name: "Lunge", windup: 0.9, strike: 0.4, recover: 1.3, reach: 5.2, arc: 0.3, damage: 1.2, speed: 12, range: [0, 4.5], cd: 1.3 }),
    ],
  },
  {
    id: "caller", name: "Brood Caller", sprite: "oviraptor", role: "lunger", archetype: "support", level: 5, r: 0.62, speed: 5.0, hp: 44, power: 1, reward: 12, sense: 12, scale: 1.08, tint: 0xb9ffd0, keepAway: 8,
    fact: "Its crest rattles to rally the pack. Silence it first.",
    attacks: [
      L({ id: "rally", kind: "rally", name: "Rally cry", windup: 0.9, strike: 0.3, recover: 0.8, reach: 7, damage: 0, cd: 7, range: [0, 99], weight: 3 }),
      L({ id: "peck", name: "Peck", windup: 0.7, strike: 0.3, recover: 1.1, reach: 3.2, arc: 0.35, damage: 0.6, speed: 10, range: [0, 3.5], cd: 1.6 }),
    ],
  },
  {
    id: "lurker", name: "Reed lurker", sprite: "raptor", role: "lunger", archetype: "ambusher", level: 5, r: 0.62, speed: 6.4, hp: 48, power: 2, reward: 16, sense: 3.8, scale: 0.92, tint: 0x9fd8a8,
    fact: "It lies motionless in the reeds until you are almost on it. Listen for the rustle.",
    attacks: [L({ id: "ambush", name: "Ambush", windup: 0.45, strike: 0.34, recover: 1.2, reach: 4.2, arc: 0.35, damage: 1.1, speed: 14, cd: 1.5 })],
  },
  {
    id: "kentro", name: "Kentrosaurus", sprite: "kentro", role: "armour", archetype: "tank", level: 6, r: 0.95, speed: 2.8, hp: 130, power: 2, reward: 10, sense: 6, scale: 1, frontal: 0.35,
    fact: "Its spikes turn aside blows from the front. Circle to its flank.",
    attacks: [L({ id: "tailswipe", kind: "sweep", name: "Tail swipe", windup: 0.95, strike: 0.4, recover: 1.5, reach: 3.8, arc: 1.5, damage: 1.2, cd: 2.4, knock: 3 })],
  },
  {
    id: "trike", name: "Triceratops", sprite: "trike", role: "armour", archetype: "neutral", level: 6, r: 1.1, speed: 3.2, hp: 100, power: 3, reward: 0, sense: 7, scale: 1, frontal: 0.5,
    fact: "A three-horned plant-eater. Leave it in peace, or leave room for its charge.",
    windup: 1.0, strike: 0.7, recover: 1.6, reach: 8, arc: 0.22, lungeSpeed: 13, damage: 1.2, cooldown: 3,
  },
  // ------------------------------------------------------------------ bosses and minibosses
  {
    id: "old-scar", name: "Old Scar", sprite: "raptor", role: "lunger", archetype: "miniboss", level: 4, r: 1.0, speed: 6.0, hp: 190, power: 3, reward: 40, sense: 13, scale: 1.45, tint: 0xd6b79c,
    fact: "A scarred old raptor who has held the Hollow perch longer than anyone remembers. The glow in its eyes is new.",
    attacks: [
      L({ id: "lunge", name: "Lunge", windup: 0.8, strike: 0.36, recover: 1.1, reach: 5.2, arc: 0.3, damage: 1, speed: 13, range: [2, 8], cd: 1.2, weight: 3 }),
      L({ id: "leap", kind: "slam", name: "Pouncing leap", windup: 0.95, strike: 0.3, recover: 1.5, reach: 2.4, damage: 1.2, range: [3, 11], cd: 4, weight: 2 }),
      L({ id: "scream", kind: "summon", name: "Screech for help", windup: 0.9, strike: 0.3, recover: 1, reach: 0, damage: 0, cd: 12, adds: { id: "compy-raider", count: 3 }, weight: 0 }),
    ],
    boss: {
      title: "The Hollow’s old tyrant",
      arena: 24,
      armoured: true,
      phases: [
        { at: 1, text: "", attacks: ["lunge", "leap"], speed: 1, cd: 1 },
        { at: 0.6, text: "Old Scar screeches for the pack!", attacks: ["lunge", "leap", "scream"], speed: 1.1, cd: 0.9, summon: { id: "compy-raider", count: 3 }, roar: 1.2 },
        { at: 0.3, text: "Old Scar is enraged!", attacks: ["lunge", "leap"], speed: 1.3, cd: 0.7, roar: 1.0 },
      ],
    },
  },
  {
    id: "river-hunter", name: "River Hunter", sprite: "raptor", role: "lunger", archetype: "boss", level: 8, r: 1.0, speed: 6.2, hp: 260, power: 3, reward: 60, sense: 14, scale: 1.4, tint: 0xbcd0e8,
    fact: "Scarfang rules the river bend. Its stalking is patient, its pounce is not.",
    attacks: [
      L({ id: "lunge", name: "Lunge", windup: 0.78, strike: 0.36, recover: 1.1, reach: 5.2, arc: 0.3, damage: 1, speed: 13, range: [2, 8], cd: 1.1, weight: 3 }),
      L({ id: "leap", kind: "slam", name: "Pouncing leap", windup: 0.9, strike: 0.3, recover: 1.4, reach: 2.6, damage: 1.2, range: [3, 11], cd: 3.5, weight: 2 }),
      L({ id: "rake", kind: "sweep", name: "Rake", windup: 0.6, strike: 0.25, recover: 1.0, reach: 3.2, arc: 1.3, damage: 0.8, range: [0, 3], cd: 2, weight: 3 }),
      L({ id: "call", kind: "summon", name: "River call", windup: 1, strike: 0.3, recover: 1, reach: 0, damage: 0, cd: 14, adds: { id: "compy-raider", count: 4 }, weight: 0 }),
    ],
    boss: {
      title: "Master of the river bend",
      arena: 26,
      armoured: true,
      phases: [
        { at: 1, text: "", attacks: ["lunge", "leap", "rake"], speed: 1, cd: 1 },
        { at: 0.65, text: "The River Hunter calls its pack!", attacks: ["lunge", "leap", "rake", "call"], speed: 1.08, cd: 0.9, summon: { id: "compy-raider", count: 4 }, roar: 1.2 },
        { at: 0.3, text: "The River Hunter bares its teeth!", attacks: ["lunge", "leap", "rake"], speed: 1.25, cd: 0.7, roar: 1.0 },
      ],
    },
  },
  {
    id: "reed-stalker", name: "Reed Stalker", sprite: "raptor", role: "lunger", archetype: "boss", level: 13, r: 0.85, speed: 6.4, hp: 200, power: 3, reward: 50, sense: 14, scale: 1.2, tint: 0xa8d49c,
    fact: "They hunt in alternating lunges: when one strikes, the other circles.",
    attacks: [
      L({ id: "lunge", name: "Lunge", windup: 0.78, strike: 0.36, recover: 1.1, reach: 5.2, arc: 0.3, damage: 1, speed: 13, range: [2, 8], cd: 1.2, weight: 3 }),
      L({ id: "leap", kind: "slam", name: "Pouncing leap", windup: 0.9, strike: 0.3, recover: 1.4, reach: 2.4, damage: 1.1, range: [3, 10], cd: 3.8, weight: 2 }),
    ],
    boss: { title: "Marsh pack", arena: 30, armoured: false, phases: [{ at: 1, text: "", attacks: [], speed: 1, cd: 1 }, { at: 0.4, text: "The Reed Stalker fights desperately!", attacks: [], speed: 1.2, cd: 0.75 }] },
  },
  {
    id: "sunscar", name: "Sunscar Stalker", sprite: "dilophosaurus", role: "lunger", archetype: "boss", level: 17, r: 1.2, speed: 5.4, hp: 420, power: 4, reward: 80, sense: 14, scale: 1.7, tint: 0xf2c890, keepAway: 6,
    fact: "A dune-coloured crested hunter that fires venom in fans and hunts from the shade of the ridges.",
    attacks: [
      L({ id: "spit", kind: "spit", name: "Venom spit", windup: 0.8, strike: 0.2, recover: 1, reach: 14, damage: 0.8, speed: 12, range: [4, 14], cd: 2, venom: true, weight: 3 }),
      L({ id: "fan", kind: "volley", name: "Venom fan", windup: 1.1, strike: 0.3, recover: 1.4, reach: 12, damage: 0.7, speed: 10, range: [3, 12], cd: 5, count: 5, venom: true, weight: 2 }),
      L({ id: "snap", name: "Lunge", windup: 0.85, strike: 0.4, recover: 1.2, reach: 5.6, arc: 0.3, damage: 1.3, speed: 13, range: [0, 4.5], cd: 1.3, weight: 3 }),
      L({ id: "slam", kind: "slam", name: "Crest slam", windup: 1.1, strike: 0.3, recover: 1.5, reach: 3.2, damage: 1.5, range: [0, 8], cd: 6, stun: 0.5, weight: 2 }),
    ],
    boss: {
      title: "Hunter of the high dunes",
      arena: 30,
      armoured: true,
      phases: [
        { at: 1, text: "", attacks: ["spit", "snap", "slam"], speed: 1, cd: 1 },
        { at: 0.6, text: "The Sunscar Stalker fans its crest!", attacks: ["spit", "fan", "snap", "slam"], speed: 1.1, cd: 0.9, roar: 1.1 },
        { at: 0.25, text: "The Sunscar Stalker goes wild!", attacks: ["fan", "snap", "slam"], speed: 1.3, cd: 0.7, roar: 1.0 },
      ],
    },
  },
  {
    id: "gigano", name: "Basalt Matriarch", sprite: "gigano", role: "sweeper", archetype: "boss", level: 22, r: 1.7, speed: 4.4, hp: 520, power: 4, reward: 90, sense: 15, scale: 1,
    fact: "A giant of the south, with a long skull and heavy tail. Her sweep is slow; her recovery is the opening.",
    attacks: [
      L({ id: "sweep", kind: "sweep", name: "Tail sweep", windup: 1.0, strike: 0.5, recover: 1.5, reach: 5.8, arc: 1.7, damage: 1.5, cd: 1.6, weight: 3, knock: 2.5 }),
      L({ id: "stomp", kind: "slam", name: "Basalt stomp", windup: 1.2, strike: 0.4, recover: 1.7, reach: 4.2, damage: 1.7, range: [0, 11], cd: 5, stun: 0.6, weight: 2 }),
      L({ id: "charge", kind: "charge", name: "Charge", windup: 1.1, strike: 0.7, recover: 1.9, reach: 12, arc: 0.28, damage: 1.9, speed: 14, range: [6, 16], cd: 7, knock: 3, weight: 2 }),
      L({ id: "hurl", kind: "volley", name: "Hurled stones", windup: 1.1, strike: 0.3, recover: 1.5, reach: 12, damage: 0.8, speed: 9, range: [5, 14], cd: 6, count: 3, weight: 1 }),
    ],
    boss: {
      title: "Matriarch of the Basin",
      arena: 34,
      armoured: true,
      phases: [
        { at: 1, text: "", attacks: ["sweep", "stomp"], speed: 1, cd: 1 },
        { at: 0.66, text: "The Matriarch lowers her head…", attacks: ["sweep", "stomp", "charge"], speed: 1.1, cd: 0.9, roar: 1.3 },
        { at: 0.33, text: "The Matriarch tears the ground apart!", attacks: ["sweep", "stomp", "charge", "hurl"], speed: 1.25, cd: 0.75, roar: 1.3 },
      ],
    },
  },
  {
    id: "glimmerjaw", name: "The Glimmerjaw", sprite: "gigano", role: "sweeper", archetype: "boss", level: 27, r: 1.9, speed: 4.8, hp: 820, power: 4, reward: 140, sense: 16, scale: 1.18, tint: 0xffd98a,
    fact: "What the Heartstone made of an ordinary hunter: bigger, brighter and never full.",
    attacks: [
      L({ id: "sweep", kind: "sweep", name: "Amber sweep", windup: 0.95, strike: 0.5, recover: 1.4, reach: 6.2, arc: 1.7, damage: 1.6, cd: 1.5, weight: 3, knock: 2.5 }),
      L({ id: "slam", kind: "slam", name: "Glimmer slam", windup: 1.1, strike: 0.4, recover: 1.5, reach: 4.6, damage: 1.9, range: [0, 11], cd: 4.5, stun: 0.6, weight: 2 }),
      L({ id: "shards", kind: "volley", name: "Amber shards", windup: 1.0, strike: 0.3, recover: 1.4, reach: 13, damage: 0.9, speed: 10, range: [4, 15], cd: 5, count: 5, weight: 2 }),
      L({ id: "charge", kind: "charge", name: "Glimmer charge", windup: 1.0, strike: 0.7, recover: 1.8, reach: 13, arc: 0.28, damage: 2, speed: 15, range: [6, 16], cd: 7, knock: 3, weight: 2 }),
      L({ id: "brood", kind: "summon", name: "Call the brood", windup: 1.1, strike: 0.3, recover: 1.2, reach: 0, damage: 0, cd: 16, adds: { id: "compy-raider", count: 4 }, weight: 0 }),
    ],
    boss: {
      title: "Born of the Heartstone",
      arena: 34,
      armoured: true,
      phases: [
        { at: 1, text: "", attacks: ["sweep", "slam", "shards"], speed: 1, cd: 1 },
        { at: 0.7, text: "The Glimmerjaw blazes brighter!", attacks: ["sweep", "slam", "shards", "charge"], speed: 1.1, cd: 0.9, roar: 1.3 },
        { at: 0.4, text: "The brood answers the Glimmerjaw!", attacks: ["sweep", "slam", "shards", "charge", "brood"], speed: 1.2, cd: 0.8, summon: { id: "compy-raider", count: 4 }, roar: 1.3 },
        { at: 0.15, text: "The Glimmerjaw is blinding!", attacks: ["slam", "shards", "charge"], speed: 1.35, cd: 0.65, roar: 1.1 },
      ],
    },
  },
  // ------------------------------------------------------------------ neutral villagers (spoken to, never fought)
  { id: "elder-trike", name: "Mossback", sprite: "trike", role: "armour", archetype: "neutral", level: 1, r: 1.0, speed: 2.4, hp: 999, power: 0, reward: 0, sense: 0, scale: 0.92, tint: 0xd9e8c4, fact: "The oldest nest-keeper in Fern Hollow." },
  { id: "scout-compy", name: "Pip", sprite: "compy", role: "armour", archetype: "neutral", level: 1, r: 0.4, speed: 3, hp: 999, power: 0, reward: 0, sense: 0, scale: 1.0, tint: 0xcfe6ff, fact: "A scout who has seen everything and will tell you twice." },
  { id: "hatchling", name: "Hatchling", sprite: "compy", role: "armour", archetype: "neutral", level: 1, r: 0.28, speed: 4.8, hp: 999, power: 0, reward: 0, sense: 0, scale: 0.62, tint: 0xfff0b0, fact: "Very new, very loud, and extremely brave." },
  { id: "elder-hypsi", name: "Old Nibble", sprite: "hypsilophodon", role: "armour", archetype: "neutral", level: 1, r: 0.5, speed: 2.6, hp: 999, power: 0, reward: 0, sense: 0, scale: 1.0, tint: 0xf0dcc0, fact: "A grazer who remembers every ford and every flood." },
  { id: "elder-kentro", name: "Thornwick", sprite: "kentro", role: "armour", archetype: "neutral", level: 1, r: 0.95, speed: 2.4, hp: 999, power: 0, reward: 0, sense: 0, scale: 0.95, tint: 0xe8d8b8, fact: "A spiky old hermit who thinks everyone is too loud." },
  { id: "elder-oviraptor", name: "Reedwhistle", sprite: "oviraptor", role: "armour", archetype: "neutral", level: 1, r: 0.62, speed: 3, hp: 999, power: 0, reward: 0, sense: 0, scale: 1.05, tint: 0xd6f0c8, fact: "A marsh warden with a crest like a brass whistle." },
];
export const creature = (id: string) => CREATURES.find((c) => c.id === id)!;

/** the attacks a creature may use; legacy single-attack creatures derive one from their old fields */
export function attacksOf(spec: CreatureSpec): AttackDef[] {
  if (spec.attacks) return spec.attacks;
  if (spec.role === "prey" || spec.windup === undefined) return [];
  const sweep = spec.role === "sweeper";
  return [
    {
      id: sweep ? "sweep" : spec.role === "armour" ? "charge" : "lunge",
      kind: sweep ? "sweep" : "lunge",
      name: sweep ? "Tail sweep" : spec.role === "armour" ? "Charge" : "Lunge",
      windup: spec.windup,
      strike: spec.strike ?? 0.36,
      recover: spec.recover ?? 1.2,
      reach: spec.reach ?? 4,
      arc: spec.arc ?? 0.3,
      damage: spec.damage ?? 1,
      speed: spec.lungeSpeed ?? 11,
      cd: spec.cooldown ?? 1.4,
    },
  ];
}
