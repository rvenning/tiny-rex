import type { NpcDef, QuestDef } from "../quests";
import { HOLLOW_NPCS, HOLLOW_QUESTS, HOLLOW_SIDE_QUESTS, HOLLOW_SPAWNS } from "./hollow";
import { RIVER_MARSH } from "./river-marsh";
import { DUNES_EMBER_CAVES } from "./dunes-ember-caves";
import type { RegionContent } from "./types";

const regions: RegionContent[] = [{ npcs: HOLLOW_NPCS, quests: [...HOLLOW_QUESTS, ...HOLLOW_SIDE_QUESTS], spawns: HOLLOW_SPAWNS }, RIVER_MARSH, DUNES_EMBER_CAVES];
export const NPCS: NpcDef[] = regions.flatMap((r) => r.npcs);
export const QUESTS: QuestDef[] = regions.flatMap((r) => r.quests);
export const EXTRA_SPAWNS = regions.flatMap((r) => r.spawns ?? []);
export const EXTRA_RIVALS = regions.flatMap((r) => r.rivals ?? []);
export const EXTRA_HAZARDS = regions.flatMap((r) => r.hazards ?? []);
