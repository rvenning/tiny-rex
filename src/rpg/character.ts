/** One independent character save (species fixed at creation), validation, and migration from the single-record adventure. */
import { DINO_NAMES, GROWTH, MILESTONE, REGIONS, WORLD_BOUNDS, byRegion, type Dino, type Point, type RegionId } from "../adventure/data";
import type { AdventureSave } from "../adventure/save";
import { effectiveLevel, levelFromXp, STAGE_LEVELS, xpForLevel } from "./progression";
import { defaultLoadout, sanitiseSkills, unlockedActives } from "./skills";
import { BASES, SLOTS_FOR, UNIQUES, canWear, baseById, uniqueById } from "./mutations";
import { EFFECTS } from "./effects";
import { STAT_KEYS, type Difficulty, type Drop, type EffectRoll, type Mutation, type QuestState, type Rarity, type Roll, type Slot, type StatKey } from "./types";

export const CHARACTER_VERSION = 2;
export const NAME_MAX = 20;
export const DINOS: Dino[] = ["rex", "raptor", "trike"];
const REGION_IDS = REGIONS.map((r) => r.id) as RegionId[];

export interface CharacterStats {
  kills: number;
  deaths: number;
  bossKills: number;
  perfectDodges: number;
  mutationsFound: number;
  maxCombo: number;
}
export interface Character {
  version: 2;
  id: string;
  name: string;
  species: Dino;
  created: number;
  updated: number;
  /** monotonically increasing write counter; the newer rev wins a sync conflict */
  rev: number;
  /** seconds of play */
  elapsed: number;
  xp: number;
  skills: Record<string, number>;
  loadout: [string, string | null];
  worn: Partial<Record<Slot, Mutation>>;
  bag: Mutation[];
  amber: number;
  pity: number;
  lootSeed: number;
  lootCounter: number;
  quests: Record<string, QuestState>;
  flags: string[];
  // ---- world progress (shape shared with the former adventure record)
  discoveries: string[];
  regions: RegionId[];
  nests: RegionId[];
  rivals: string[];
  studied: string[];
  challenges: string[];
  gates: string[];
  mastery: Record<string, number>;
  forage: Record<string, number>;
  snapshot: { position: Point; nest: RegionId; at: number };
  drops: Drop[];
  difficulty: Difficulty;
  stats: CharacterStats;
  migrated?: { from: "adventure_v1"; at: number };
}

export const level = (c: Pick<Character, "xp" | "rivals">) => effectiveLevel(c.xp, c.rivals);

let idCounter = 0;
export const newCharacterId = (now = Date.now()) => `c${now.toString(36)}${(idCounter++ + Math.floor(Math.random() * 1e4)).toString(36)}`;

export const cleanName = (raw: string, fallback = "Hatchling") => {
  const n = raw.replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
  return n || fallback;
};

export function freshCharacter(name: string, species: Dino, now = Date.now(), id = newCharacterId(now)): Character {
  const lvl = 1;
  return {
    version: 2,
    id,
    name: cleanName(name, DINO_NAMES[species]),
    species,
    created: now,
    updated: now,
    rev: 0,
    elapsed: 0,
    xp: 0,
    skills: {},
    loadout: defaultLoadout(species, lvl),
    worn: {},
    bag: [],
    amber: 0,
    pity: 0,
    lootSeed: (Math.imul(now & 0x7fffffff, 2654435761) ^ (id.length * 977) ^ [...id].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7)) >>> 0,
    lootCounter: 0,
    quests: {},
    flags: [],
    discoveries: [],
    regions: ["hollow"],
    nests: ["hollow"],
    rivals: [],
    studied: [],
    challenges: [],
    gates: [],
    mastery: {},
    forage: {},
    snapshot: { position: { ...byRegion("hollow").nest }, nest: "hollow", at: 0 },
    drops: [],
    difficulty: "standard",
    stats: { kills: 0, deaths: 0, bossKills: 0, perfectDodges: 0, mutationsFound: 0, maxCombo: 0 },
  };
}

// ---------------------------------------------------------------- validation
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const fin = (v: unknown, lo = 0, hi = 1e12, d = 0) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const strs = (v: unknown, allowed?: readonly string[], max = 400): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length <= 80 && (!allowed || allowed.includes(x))))].slice(0, max) : [];
const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
const SLOTS = Object.keys({ jaws: 1, claws: 1, horns: 1, hide: 1, legs: 1, tail: 1, instinct: 1 }) as Slot[];

function validRoll(v: unknown): Roll | null {
  const r = rec(v);
  if (!STAT_KEYS.includes(r.stat as StatKey)) return null;
  const value = fin(r.value, -5, 5, NaN);
  if (Number.isNaN(value)) return null;
  return { stat: r.stat as StatKey, value, min: fin(r.min, -5, 5, value), max: fin(r.max, -5, 5, value) };
}
export function validateMutation(v: unknown): Mutation | null {
  const m = rec(v);
  if (typeof m.id !== "string" || !m.id || m.id.length > 60) return null;
  const cleanId = m.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "m" + Math.floor(fin(m.seed, 0, 0xffffffff, 0)).toString(36);
  if (!SLOTS.includes(m.slot as Slot) || !RARITIES.includes(m.rarity as Rarity)) return null;
  const base = typeof m.base === "string" ? baseById(m.base) : undefined;
  if (!base) return null;
  const primary = validRoll(m.primary);
  if (!primary) return null;
  const unique = typeof m.unique === "string" && uniqueById(m.unique) ? m.unique : undefined;
  if (m.rarity === "legendary" && !unique) return null;
  const effects: EffectRoll[] = [];
  for (const e of Array.isArray(m.effects) ? m.effects : []) {
    const r = rec(e);
    if (typeof r.id === "string" && EFFECTS[r.id]) effects.push({ id: r.id, value: fin(r.value, 0, 50, 1), min: fin(r.min, 0, 50, 1), max: fin(r.max, 0, 50, 1) });
  }
  const species = (Array.isArray(m.species) ? m.species : []).filter((s): s is Dino => DINOS.includes(s as Dino));
  return {
    id: cleanId,
    base: base.id,
    name: typeof m.name === "string" ? m.name.slice(0, 60) : base.name,
    slot: m.slot as Slot,
    rarity: m.rarity as Rarity,
    ilvl: Math.floor(fin(m.ilvl, 1, 99, 1)),
    species: species.length ? species : [...base.species],
    primary,
    affixes: (Array.isArray(m.affixes) ? m.affixes : []).map(validRoll).filter((r): r is Roll => !!r).slice(0, 6),
    effects: effects.slice(0, 3),
    unique,
    seed: Math.floor(fin(m.seed, 0, 0xffffffff, 0)),
    rerolled: m.rerolled === true || undefined,
    at: fin(m.at),
  };
}

function validQuest(v: unknown): QuestState | null {
  const q = rec(v);
  if (q.status !== "active" && q.status !== "done") return null;
  const data: QuestState["data"] = {};
  for (const [k, x] of Object.entries(rec(q.data)).slice(0, 40)) if (/^[a-zA-Z0-9_.-]{1,40}$/.test(k) && (typeof x === "number" || typeof x === "string" || typeof x === "boolean")) data[k] = typeof x === "string" ? x.slice(0, 80) : x;
  return { status: q.status, step: Math.floor(fin(q.step, 0, 99)), progress: fin(q.progress, 0, 1e6), data, startedAt: fin(q.startedAt), doneAt: q.doneAt === undefined ? undefined : fin(q.doneAt) };
}

export function validateCharacter(value: unknown, expectedId?: string): Character | null {
  const raw = rec(value);
  if (raw.version !== 2 || typeof raw.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id) || (expectedId && raw.id !== expectedId)) return null;
  if (!DINOS.includes(raw.species as Dino)) return null;
  const species = raw.species as Dino;
  const c = freshCharacter(typeof raw.name === "string" ? raw.name : DINO_NAMES[species], species, fin(raw.created, 0, 1e14, Date.now()), raw.id);
  c.created = fin(raw.created, 0, 1e14, c.created);
  c.updated = fin(raw.updated, 0, 1e14, c.updated);
  c.rev = Math.floor(fin(raw.rev, 0, 1e9));
  c.elapsed = fin(raw.elapsed, 0, 1e9);
  c.xp = Math.floor(fin(raw.xp, 0, 5e7));
  c.rivals = strs(raw.rivals, undefined, 80);
  const lvl = effectiveLevel(c.xp, c.rivals);
  c.skills = sanitiseSkills(species, lvl, raw.skills);
  const l = Array.isArray(raw.loadout) ? raw.loadout : [];
  const unlocked = unlockedActives(species, lvl).map((a) => a.id);
  const a = unlocked.includes(l[0] as string) ? (l[0] as string) : defaultLoadout(species, lvl)[0];
  const b = lvl >= 5 && unlocked.includes(l[1] as string) && l[1] !== a ? (l[1] as string) : lvl >= 5 ? (unlocked.find((id) => id !== a) ?? null) : null;
  c.loadout = [a, b];
  // mutations: worn items must fit the species and slot, otherwise they go back to the bag rather than being lost
  const bag: Mutation[] = [];
  const taken = new Set<string>();
  // two different items must never share an id (a duplicate would be silently dropped): collisions get a fresh suffix
  const uniq = (m: Mutation) => {
    let id = m.id;
    for (let n = 1; taken.has(id); n++) id = m.id.slice(0, 36) + "-" + n;
    taken.add(id);
    return id === m.id ? m : { ...m, id };
  };
  const worn: Character["worn"] = {};
  for (const [slot, item] of Object.entries(rec(raw.worn))) {
    const m = validateMutation(item);
    if (!m) continue;
    if (m.slot === slot && SLOTS_FOR[species].includes(m.slot) && canWear(m, species) && !worn[m.slot]) worn[m.slot] = uniq(m);
    else bag.push(m);
  }
  const spill: Mutation[] = [];
  for (const item of Array.isArray(raw.bag) ? raw.bag.slice(0, 80) : []) {
    const m = validateMutation(item);
    if (m) spill.push(m);
  }
  c.worn = worn;
  // misfit worn items first (never lost), then the bag in order
  c.bag = [...bag, ...spill].map(uniq);
  c.amber = Math.floor(fin(raw.amber, 0, 1e8));
  c.pity = Math.floor(fin(raw.pity, 0, 1000));
  c.lootSeed = Math.floor(fin(raw.lootSeed, 0, 0xffffffff, c.lootSeed));
  c.lootCounter = Math.floor(fin(raw.lootCounter, 0, 1e9));
  const quests: Character["quests"] = {};
  for (const [id, q] of Object.entries(rec(raw.quests)).slice(0, 120)) {
    const s = validQuest(q);
    if (s && /^[a-z0-9._-]{1,60}$/.test(id)) quests[id] = s;
  }
  c.quests = quests;
  c.flags = strs(raw.flags, undefined, 400);
  c.discoveries = strs(raw.discoveries, undefined, 400);
  c.regions = [...new Set(["hollow", ...strs(raw.regions, REGION_IDS)])] as RegionId[];
  c.nests = [...new Set(["hollow", ...strs(raw.nests, REGION_IDS)])] as RegionId[];
  c.studied = strs(raw.studied, undefined, 100);
  c.challenges = strs(raw.challenges, undefined, 200);
  c.gates = strs(raw.gates, undefined, 200);
  const mastery = rec(raw.mastery),
    forage = rec(raw.forage);
  c.mastery = Object.fromEntries(Object.entries(mastery).filter(([k, v]) => /^[a-z0-9._-]{1,60}$/.test(k) && typeof v === "number").map(([k, v]) => [k, fin(v, 0, 1000)]));
  c.forage = Object.fromEntries(Object.entries(forage).filter(([k, v]) => /^[a-z0-9._-]{1,60}$/.test(k) && typeof v === "number").map(([k, v]) => [k, fin(v, 0, 1e9)]));
  const snap = rec(raw.snapshot),
    pos = rec(snap.position);
  const nest = c.nests.includes(snap.nest as RegionId) ? (snap.nest as RegionId) : "hollow";
  const inBounds = typeof pos.x === "number" && typeof pos.y === "number" && Number.isFinite(pos.x) && Number.isFinite(pos.y) && pos.x >= WORLD_BOUNDS[0] && pos.x <= WORLD_BOUNDS[2] && pos.y >= WORLD_BOUNDS[1] && pos.y <= WORLD_BOUNDS[3];
  c.snapshot = { nest, position: inBounds ? { x: pos.x as number, y: pos.y as number } : { ...byRegion(nest).nest }, at: fin(snap.at, 0, 1e14) };
  c.drops = [];
  for (const d of Array.isArray(raw.drops) ? raw.drops.slice(0, 12) : []) {
    const r = rec(d);
    if (typeof r.id !== "string" || !Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
    const mutation = r.mutation ? validateMutation(r.mutation) : undefined;
    const amber = typeof r.amber === "number" ? Math.floor(fin(r.amber, 0, 1e6)) : undefined;
    if (!mutation && !amber) continue;
    c.drops.push({ id: r.id.slice(0, 40), x: r.x as number, y: r.y as number, mutation: mutation ?? undefined, amber, expires: fin(r.expires, 0, 1e9) });
  }
  c.difficulty = raw.difficulty === "gentle" || raw.difficulty === "fierce" ? raw.difficulty : "standard";
  const st = rec(raw.stats);
  c.stats = { kills: fin(st.kills), deaths: fin(st.deaths), bossKills: fin(st.bossKills), perfectDodges: fin(st.perfectDodges), mutationsFound: fin(st.mutationsFound), maxCombo: fin(st.maxCombo) };
  const mig = rec(raw.migrated);
  if (mig.from === "adventure_v1") c.migrated = { from: "adventure_v1", at: fin(mig.at) };
  void levelFromXp;
  void BASES;
  void UNIQUES;
  return c;
}

// ---------------------------------------------------------------- legacy migration
/** the old four-stage index for an adventure record's active species */
function legacyStage(xp: number, rivals: string[]) {
  let stage = 0;
  while (stage < 3 && xp >= GROWTH[stage] && (!MILESTONE[stage] || rivals.includes(MILESTONE[stage]!))) stage++;
  return stage;
}
/** XP in the new curve that is never below the level the old stage implied, and keeps partial progress inside the stage */
export function convertLegacyXp(oldXp: number, rivals: string[]) {
  const stage = legacyStage(oldXp, rivals);
  const from = STAGE_LEVELS[stage];
  const to = stage < 3 ? STAGE_LEVELS[stage + 1] : from + 6;
  const lo = stage === 0 ? 0 : GROWTH[stage - 1];
  const hi = GROWTH[stage];
  const t = stage >= 3 ? Math.min(1, Math.max(0, (oldXp - GROWTH[3]) / 120)) : Math.min(1, Math.max(0, (oldXp - lo) / Math.max(1, hi - lo)));
  const xp = xpForLevel(from) + Math.floor(t * 0.9 * (xpForLevel(to) - xpForLevel(from)));
  return Math.max(xpForLevel(from), xp);
}
export function charactersFromLegacy(profileName: string, legacy: AdventureSave, now = Date.now()): Character[] {
  const out: Character[] = [];
  const species = DINOS.filter((d) => legacy.xp[d] > 0 || legacy.snapshot.dino === d);
  for (const d of species) {
    const c = freshCharacter(`${profileName.slice(0, 10)}’s ${DINO_NAMES[d]}`, d, legacy.updated || now, `c_legacy_${d}`);
    c.xp = convertLegacyXp(legacy.xp[d], legacy.rivals);
    c.discoveries = [...legacy.discoveries];
    c.regions = [...legacy.regions];
    c.nests = [...legacy.nests];
    c.rivals = [...legacy.rivals];
    c.studied = [...legacy.studied];
    c.challenges = [...legacy.challenges];
    c.gates = [...legacy.gates];
    c.mastery = { ...legacy.mastery };
    c.forage = {};
    c.elapsed = legacy.elapsed;
    c.snapshot = { position: { ...legacy.snapshot.position }, nest: legacy.snapshot.nest, at: legacy.snapshot.at };
    c.difficulty = legacy.assist ? "gentle" : "standard";
    c.flags = ["legacy"];
    c.migrated = { from: "adventure_v1", at: now };
    c.skills = {};
    c.loadout = defaultLoadout(d, level(c));
    c.updated = legacy.updated || now;
    out.push(c);
  }
  return out;
}

export const summaryOf = (c: Character) => {
  const lvl = level(c);
  return { level: lvl, region: byRegion(c.snapshot.nest).name, playtime: c.elapsed };
};
