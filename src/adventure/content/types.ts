import type { Point, RegionId, Rival } from "../data";
import type { Hazard } from "../sim-types";
import type { NpcDef, QuestDef } from "../quests";

/** What a region content file exports. `index.ts` merges every region into the world. */
export interface RegionContent {
  npcs: NpcDef[];
  quests: QuestDef[];
  /** extra ordinary creatures: [creature id, x, y, level?] (the generated SPAWNS remain) */
  spawns?: [string, number, number, number?][];
  /** boss / miniboss encounters (id doubles as the save flag and the quest `boss` step target) */
  rivals?: Rival[];
  hazards?: Hazard[];
}
export type { Point, RegionId };
