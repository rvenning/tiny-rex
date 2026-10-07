export interface Species {
  id: string;
  name: string;
  kind?: "plant";
  tier?: number;
  shape: string;
  body: string;
  trim: string;
  fact: string;
  speed?: number;
  aggression?: number;
  caution?: number;
  spiky?: boolean;
}
export interface World {
  id: string;
  name: string;
  icon: string;
  sky: string[];
  ground: string;
  groundDark: string;
  rock: string;
  scrub: string;
  blurb: string;
}
export interface Level {
  idx: number;
  world: number;
  name: string;
  start: number;
  target: number;
  time: number;
  plants: number;
  hint: string;
  spawn: [string, number][];
  beast?: { id: string; name: string };
}
export interface Player {
  x: number;
  y: number;
  tier: number;
  startTier: number;
  belly: number;
  r: number;
  speed: number;
  face: number;
  invuln: number;
  chomp: number;
}
export interface Entity {
  id: number;
  sp: Species;
  x: number;
  y: number;
  r: number;
  face: number;
  step: number;
  dir: number;
  wander: number;
  flee: number;
  cooldown: number;
  hunt: number;
  bored: number;
  sprint: number;
  rest: number;
  beast: boolean;
  name?: string;
  dead: boolean;
}
export interface Result {
  mode: "campaign" | "feast";
  levelIdx: number;
  win: boolean;
  reason: string;
  stars: number;
  score: number;
  tier: number;
  startTier: number;
  hearts: number;
  catches: number;
  scares: number;
  valueEaten: number;
  wave: number;
  timeLeft: number;
  elapsed: number;
  met: Record<string, number>;
  beast: string | null;
  beastEaten: boolean;
}
export type GameEvent =
  | {
      type: "eat" | "grow" | "hurt" | "bump" | "nope" | "shrink" | "wave";
      x: number;
      y: number;
      tier?: number;
      value?: number;
      sp?: Species;
      beast?: boolean;
      name?: string;
    }
  | { type: "end"; result: Result };
