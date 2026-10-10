/** Environmental hazards placed on walkable ground. Positions are authored against the connected world (see
 *  tools/world/map_preview.py). A hazard with an `offFlag` falls silent once the world has changed. */
import type { Hazard } from "./sim-types";

export const HAZARDS: Hazard[] = [];
