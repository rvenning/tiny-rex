/** Landmarks and world-state decoration. Positions are anchors: the scene scatters the props over *walkable* ground within a
 *  radius (seeded, so it is the same every visit). Collision is untouched: everything here is art, readable at a glance. */
import type { Point } from "../data";

export interface DecorRule {
  id: string;
  /** shown only once this world flag is set */
  when?: string;
  /** hidden once any of these flags is set */
  unless?: string[];
  anchor: Point;
  radius: number;
  props: { name: string; weight?: number; scale?: [number, number] }[];
  count: number;
  /** amber/mutagen glow decals instead of (or as well as) props */
  glow?: { color: number; alpha: number; count: number; size: number };
  /** keep this far from the anchor's centre line (so a trail stays readable) */
  seed: number;
}
const flowers = [{ name: "flower_red_spike" }, { name: "flower_purple" }, { name: "clover_patch" }, { name: "fern_small" }];
const AMBER = 0xffb347;

export const DECOR: DecorRule[] = [
  // ------------------------------------------------------------ landmarks (always)
  { id: "hollow-brood-hollow", anchor: { x: 30, y: 63.5 }, radius: 3.4, count: 7, seed: 11, props: [{ name: "mushroom_cluster", weight: 2 }, { name: "bone_skull" }, { name: "rock_pebbles", weight: 2 }, { name: "moss_clump" }] },
  { id: "hollow-egg-shells", anchor: { x: 45, y: 38.5 }, radius: 3, count: 6, seed: 12, props: [{ name: "egg_single" }, { name: "rock_pebbles" }, { name: "moss_clump" }] },
  { id: "hollow-perch-bones", anchor: { x: 38.5, y: 32.5 }, radius: 2.8, count: 6, seed: 13, props: [{ name: "bone_skull" }, { name: "rock_pebbles", weight: 2 }, { name: "flat_stone" }] },
  { id: "river-ford-stones", anchor: { x: 100, y: 62.5 }, radius: 4, count: 8, seed: 21, props: [{ name: "flat_stone", weight: 2 }, { name: "rock_pebbles" }, { name: "horsetail" }] },
  { id: "river-hunter-lair", anchor: { x: 96, y: 26 }, radius: 4, count: 7, seed: 22, props: [{ name: "bone_skull" }, { name: "rock_pebbles", weight: 2 }, { name: "fossil_ribs" }] },
  { id: "marsh-lantern-grove", anchor: { x: 102, y: 91 }, radius: 6, count: 10, seed: 31, props: [{ name: "mushroom_cluster", weight: 3 }, { name: "reed_clump" }, { name: "cattail_clump" }] },
  { id: "dunes-dig-site", anchor: { x: 160, y: 82 }, radius: 6, count: 10, seed: 41, props: [{ name: "fossil_ribs", weight: 2 }, { name: "bone_skull" }, { name: "flat_stone" }, { name: "rock_pebbles", weight: 2 }] },
  { id: "ember-basalt-garden", anchor: { x: 172, y: 30 }, radius: 7, count: 10, seed: 51, props: [{ name: "flat_stone", weight: 2 }, { name: "rock_pebbles", weight: 2 }, { name: "boulder_s" }] },
  { id: "caves-fossil-gallery", anchor: { x: 30, y: 100 }, radius: 8, count: 12, seed: 61, props: [{ name: "fossil_ribs" }, { name: "bone_skull" }, { name: "mushroom_cluster", weight: 2 }, { name: "rock_pebbles", weight: 2 }] },
  // ------------------------------------------------------------ amber seeps: the mystery made visible; they dry up as the valley is saved
  { id: "amber-hollow-trail", unless: ["hollow-restored"], anchor: { x: 28.6, y: 60 }, radius: 2.2, count: 0, seed: 71, props: [], glow: { color: AMBER, alpha: 0.5, count: 3, size: 1.1 } },
  { id: "amber-old-scar", unless: ["hollow-restored"], anchor: { x: 40.5, y: 31 }, radius: 3, count: 0, seed: 72, props: [], glow: { color: AMBER, alpha: 0.42, count: 3, size: 1 } },
  { id: "amber-river", unless: ["river-cleared"], anchor: { x: 96, y: 26 }, radius: 5, count: 0, seed: 73, props: [], glow: { color: AMBER, alpha: 0.45, count: 4, size: 1.1 } },
  { id: "amber-marsh", unless: ["marsh-cleared"], anchor: { x: 112, y: 100 }, radius: 7, count: 0, seed: 74, props: [], glow: { color: 0xb6ff7a, alpha: 0.4, count: 6, size: 1 } },
  { id: "amber-dunes", unless: ["dunes-dig-open"], anchor: { x: 163, y: 81 }, radius: 5, count: 0, seed: 75, props: [], glow: { color: AMBER, alpha: 0.4, count: 3, size: 1 } },
  { id: "amber-ember-vent", unless: ["lava-cooled"], anchor: { x: 179, y: 36 }, radius: 5, count: 0, seed: 76, props: [], glow: { color: 0xff7a2a, alpha: 0.45, count: 4, size: 1.2 } },
  { id: "amber-caves", unless: ["heartstone-sealed"], anchor: { x: 30, y: 105 }, radius: 14, count: 0, seed: 77, props: [], glow: { color: AMBER, alpha: 0.5, count: 9, size: 1.1 } },
  // ------------------------------------------------------------ the valley heals (flags set by quest completion)
  { id: "restored-hollow", when: "hollow-restored", anchor: { x: 27, y: 36 }, radius: 6.5, count: 16, seed: 81, props: flowers },
  { id: "restored-river", when: "river-cleared", anchor: { x: 97, y: 28 }, radius: 8, count: 14, seed: 82, props: flowers },
  { id: "restored-marsh", when: "marsh-cleared", anchor: { x: 104, y: 94 }, radius: 10, count: 16, seed: 83, props: [{ name: "lily_pad" }, { name: "flower_purple" }, { name: "reed_clump" }, { name: "cattail_clump" }] },
  { id: "restored-dunes", when: "dunes-dig-open", anchor: { x: 160, y: 84 }, radius: 8, count: 10, seed: 84, props: [{ name: "flower_red_spike" }, { name: "cycad" }, { name: "fern_small" }] },
  { id: "restored-ember", when: "lava-cooled", anchor: { x: 170, y: 30 }, radius: 10, count: 12, seed: 85, props: [{ name: "moss_clump" }, { name: "fern_small" }, { name: "clover_patch" }, { name: "flower_red_spike" }] },
  { id: "sealed-caves", when: "heartstone-sealed", anchor: { x: 30, y: 100 }, radius: 14, count: 16, seed: 86, props: [{ name: "moss_clump" }, { name: "mushroom_cluster" }, { name: "fern_small" }, { name: "flower_purple" }] },
  { id: "bound-glow", when: "heartstone-bound", anchor: { x: 30, y: 100 }, radius: 14, count: 0, seed: 87, props: [], glow: { color: 0xffd36a, alpha: 0.55, count: 12, size: 1.3 } },
];
