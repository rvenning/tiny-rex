/** Shared simulation types. The simulation never touches Phaser, the DOM or wall-clock time. */
import type { AttackDef, CreatureSpec, Point } from "./data";

export type AdventureEvent = Point & {
  type:
    | "bite"
    | "hit"
    | "dmg"
    | "eat"
    | "hurt"
    | "dodge"
    | "perfect"
    | "roar"
    | "pounce"
    | "tell"
    | "notice"
    | "bounce"
    | "grow"
    | "levelup"
    | "xp"
    | "discovery"
    | "nest"
    | "defeat"
    | "victory"
    | "gate"
    | "stagger"
    | "forage"
    | "skill"
    | "shot"
    | "impact"
    | "slam"
    | "phase"
    | "loot"
    | "pickup"
    | "salvage"
    | "heal"
    | "combo"
    | "dialogue"
    | "quest"
    | "questdone"
    | "hazard"
    | "status"
    | "decoy"
    | "world"
    | "kill";
  text?: string;
  reward?: number;
  dir?: number;
  actor?: number;
  stage?: number;
  amount?: number;
  crit?: boolean;
  kind?: string;
  rarity?: string;
  id?: string;
  radius?: number;
  hits?: number;
  tag?: string;
};

export interface AdventureInput {
  /** ground-space direction, length 0..1 (partial = creeping) */
  move: Point;
  bite: boolean;
  dodge: boolean;
  skillA: boolean;
  skillB: boolean;
  interact: boolean;
}
export const idleInput = (): AdventureInput => ({ move: { x: 0, y: 0 }, bite: false, dodge: false, skillA: false, skillB: false, interact: false });

export type ActorState = "idle" | "feed" | "alert" | "flee" | "stalk" | "windup" | "strike" | "recover" | "stagger" | "return" | "dead" | "dormant" | "roar";

export interface ActorFx {
  bleed?: { t: number; dps: number; stacks: number };
  poison?: { t: number; dps: number; stacks: number };
  slow?: { t: number; m: number };
  mark?: { t: number; m: number };
  stun?: { t: number };
  haste?: { t: number };
}
export interface Actor extends Point {
  id: number;
  spec: CreatureSpec;
  level: number;
  home: Point;
  face: number;
  hp: number;
  maxHp: number;
  state: ActorState;
  /** time left in the current state */
  t: number;
  /** time in the current state */
  age: number;
  /** 0..1 prey awareness */
  alert: number;
  /** locked attack heading */
  dir: number;
  cooldown: number;
  hit: boolean;
  respawnAt: number;
  rival?: string;
  sentinel: boolean;
  provoked: number;
  wander: number;
  flash: number;
  speedNow: number;
  strafe: number;
  escort?: boolean;
  atk?: AttackDef;
  /** target point of area attacks */
  aim?: Point;
  phase: number;
  fx: ActorFx;
  npc?: string;
  elite?: boolean;
  kvx: number;
  kvy: number;
  /** per-attack cooldown clocks */
  acd: Record<string, number>;
  /** multiplier from phases */
  speedMul: number;
  cdMul: number;
  /** a call-for-help add belongs to this encounter and drops nothing */
  summoned?: boolean;
  /** pull toward a decoy or taunt */
  lure?: Point | null;
  lureT: number;
  /** boss transition invulnerability */
  guard: number;
  /** boss attack counter, for alternating patterns */
  count: number;
  unaware: boolean;
  /** a practice rematch: pays no boss loot */
  rematch?: boolean;
  /** quest that spawned this creature (cleared when the quest ends; tagged creatures never respawn) */
  tag?: string;
  /** hatchlings that trail the player during an escort */
  follow?: boolean;
  /** accumulated damage-over-time not yet shown as a number */
  dotAcc: number;
  dotAt: number;
}
export type PlayerPose = "idle" | "run" | "bite" | "dodge" | "skill" | "hurt";
export interface Player extends Point {
  face: number;
  hp: number;
  invuln: number;
  pose: PlayerPose;
  /** seconds left in the current committed action */
  action: number;
  actionLen: number;
  dashX: number;
  dashY: number;
  speedNow: number;
  biteHit: boolean;
  /** seconds left of a level-up/growth celebration */
  grow: number;
  combo: number;
  comboT: number;
  /** current action detail for the renderer: 0..chain-1 swing index, 'finisher' etc. */
  swing: number;
  finisher: boolean;
  skillId: string;
  /** which loadout slot (0/1) the running skill came from */
  skillSlot: 0 | 1;
  /** counts timed sub-hits of the running skill */
  skillStep: number;
  dodgeAge: number;
  stillT: number;
  momentum: number;
  momentumT: number;
  venom: { t: number; dps: number } | null;
  slow: { t: number; m: number } | null;
  brace: { t: number; reflect: number } | null;
  frenzy: number;
  bellow: number;
  lastStandT: number;
  lastStandCd: number;
  immortalCd: number;
  nextCrit: boolean;
  perfectT: number;
  stampede: number;
  chargeHit: Set<number>;
  hitsThisAction: Set<number>;
  hitBuffer: number;
}
export interface Shot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  from: number;
  venom: boolean;
  kind: "spit" | "stone" | "amber";
}
export interface Decoy extends Point {
  t: number;
}
export interface Hazard extends Point {
  id: string;
  kind: "toxic" | "steam" | "mutagen" | "quicksand" | "embers";
  r: number;
  /** damage per second (toxic/mutagen/embers) or per burst (steam) as a fraction of max HP */
  dmg: number;
  period?: number;
  warn?: number;
  phase?: number;
  /** disabled once this flag is set */
  offFlag?: string;
  region?: string;
}
