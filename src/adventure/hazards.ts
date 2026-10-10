/** Environmental hazards placed on walkable ground. Positions are authored against the connected world (see
 *  tools/world/map_preview.py). A hazard with an `offFlag` falls silent once the world has changed. */
import { EXTRA_HAZARDS } from "./content";
import type { Hazard } from "./sim-types";

export const HAZARDS: Hazard[] = [...EXTRA_HAZARDS];
