/** Compatibility contract for previously saved results. The original game is retired. */
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
