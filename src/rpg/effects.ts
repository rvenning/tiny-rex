/** Gameplay-changing mutation/skill effects. The simulation implements each id; the tests assert no content uses an id that
 *  is missing here, so a mutation can never promise something the game does not do. */
import type { Dino } from "../adventure/data";

export interface EffectDef {
  id: string;
  name: string;
  /** one sentence; `{v}` is replaced by the rolled value formatted with `fmt` */
  text: string;
  fmt: "pct" | "num" | "flag" | "sec";
  tag: "offence" | "defence" | "utility";
}

export const EFFECTS: Record<string, EffectDef> = {
  bleed: { id: "bleed", name: "Bleed", text: "{v} chance on hit to bleed the target for 4 s", fmt: "pct", tag: "offence" },
  poison: { id: "poison", name: "Poison", text: "{v} chance on hit to apply a stacking poison (up to 5)", fmt: "pct", tag: "offence" },
  shock: { id: "shock", name: "Shock", text: "Critical hits arc {v} of the damage to two nearby enemies", fmt: "pct", tag: "offence" },
  execute: { id: "execute", name: "Executioner", text: "+{v} damage to enemies below 25% health", fmt: "pct", tag: "offence" },
  momentum: { id: "momentum", name: "Momentum", text: "Each consecutive hit adds {v} damage (stacks 8, fades after 2 s idle)", fmt: "pct", tag: "offence" },
  echo: { id: "echo", name: "Echo Bite", text: "{v} chance for an attack to strike twice", fmt: "pct", tag: "offence" },
  knockback: { id: "knockback", name: "Heavy Impact", text: "Attacks shove enemies back {v} paces", fmt: "num", tag: "utility" },
  roarShock: { id: "roarShock", name: "Shout Shockwave", text: "Roar, Screech and Bellow also release a shockwave worth {v} of your attack", fmt: "pct", tag: "offence" },
  lastStand: { id: "lastStand", name: "Last Stand", text: "Below 30% health take {v} less damage for 5 s (once a minute)", fmt: "pct", tag: "defence" },
  bloodMend: { id: "bloodMend", name: "Regenerative Blood", text: "Defeating a creature restores {v} of your health", fmt: "pct", tag: "defence" },
  dust: { id: "dust", name: "Dust Cloud", text: "Dodging leaves a cloud that slows enemies by {v}", fmt: "pct", tag: "utility" },
  // ---- legendary identities (flag = potency 1)
  devour: { id: "devour", name: "Devour", text: "Bites that defeat a creature restore 8% health and add a Feast stack", fmt: "flag", tag: "utility" },
  thunderlung: { id: "thunderlung", name: "Thunderlung", text: "Roar becomes a shockwave that damages and hurls enemies back; +30% Roar cooldown", fmt: "flag", tag: "offence" },
  stoneback: { id: "stoneback", name: "Stoneback Plates", text: "Standing still for a second grants 25% damage reduction; moving is 15% slower", fmt: "flag", tag: "defence" },
  quakeTail: { id: "quakeTail", name: "Quake Tail", text: "Your dodge ends with a tail slam shockwave", fmt: "flag", tag: "offence" },
  razorTalons: { id: "razorTalons", name: "Razor Talons", text: "Every hit bleeds; bleeds stack and tick twice as fast; -15% hit damage", fmt: "flag", tag: "offence" },
  venomBurst: { id: "venomBurst", name: "Venom Burst", text: "Bites always poison; poisoned creatures burst into a toxic cloud when defeated", fmt: "flag", tag: "offence" },
  windSplit: { id: "windSplit", name: "Windsplitter", text: "Two dodge charges and +15% movement speed", fmt: "flag", tag: "utility" },
  mirage: { id: "mirage", name: "Mirage Plumes", text: "A perfect dodge leaves a decoy that draws enemies for 3 s", fmt: "flag", tag: "defence" },
  crownCharge: { id: "crownCharge", name: "Crown of the Herd", text: "Charge pierces every enemy; each enemy hit refunds 1 s of its cooldown", fmt: "flag", tag: "offence" },
  bastion: { id: "bastion", name: "Bastion Frill", text: "Frill Brace lasts twice as long and reflects all blocked melee damage", fmt: "flag", tag: "defence" },
  earthsplit: { id: "earthsplit", name: "Earthsplitter", text: "Horn attacks send a shockwave line ahead of you", fmt: "flag", tag: "offence" },
  stampede: { id: "stampede", name: "Stampede Heart", text: "Charging builds speed and damage; every second adds 10% to your next hit", fmt: "flag", tag: "offence" },
  glowheart: { id: "glowheart", name: "Glowheart", text: "Feast never fades in combat and each stack grants +5% damage", fmt: "flag", tag: "utility" },
  amberEye: { id: "amberEye", name: "Amber Eye", text: "Hidden things shimmer within 14 paces; +25% Amber and luck", fmt: "flag", tag: "utility" },
  // ---- skill-tree effects
  roarStun: { id: "roarStun", name: "Dreadful Roar", text: "Roar stuns everything it hits for {v}", fmt: "sec", tag: "utility" },
  bleedTick: { id: "bleedTick", name: "Deep Cuts", text: "Bleeds deal {v} more damage", fmt: "pct", tag: "offence" },
  poisonMax: { id: "poisonMax", name: "Toxic Build-up", text: "Poison stacks {v} higher", fmt: "num", tag: "offence" },
  markBoost: { id: "markBoost", name: "Opened Guard", text: "Marked enemies take {v} more damage", fmt: "pct", tag: "offence" },
  braceReflect: { id: "braceReflect", name: "Spiked Frill", text: "Brace reflects {v} of blocked damage", fmt: "pct", tag: "defence" },
  chargeDamage: { id: "chargeDamage", name: "Heavy Charge", text: "Charge deals {v} more damage", fmt: "pct", tag: "offence" },
  healPulse: { id: "healPulse", name: "Herd Heart", text: "Bellow heals you for {v} of your health", fmt: "pct", tag: "defence" },
  finisher: { id: "finisher", name: "Ruinous Finisher", text: "Combo finishers deal {v} more damage", fmt: "pct", tag: "offence" },
  openingPounce: { id: "openingPounce", name: "Ambush Instinct", text: "Your first strike on an unaware creature deals {v} more", fmt: "pct", tag: "offence" },
  tailSweep: { id: "tailSweep", name: "Tail Sweep", text: "Combo finishers also sweep behind you", fmt: "flag", tag: "offence" },
  perfectCrit: { id: "perfectCrit", name: "Counter-Strike", text: "Perfect dodges also stagger nearby enemies", fmt: "flag", tag: "offence" },
  immortal: { id: "immortal", name: "Thick Skinned", text: "The first hit that would defeat you in a fight leaves you on 1 health instead (once a minute)", fmt: "flag", tag: "defence" },
};

/** species each legendary may roll for */
export const effectSpecies: Record<string, Dino[]> = {
  devour: ["rex"],
  thunderlung: ["rex"],
  stoneback: ["rex"],
  quakeTail: ["rex"],
  razorTalons: ["raptor"],
  venomBurst: ["raptor"],
  windSplit: ["raptor"],
  mirage: ["raptor"],
  crownCharge: ["trike"],
  bastion: ["trike"],
  earthsplit: ["trike"],
  stampede: ["trike"],
  glowheart: ["rex", "raptor", "trike"],
  amberEye: ["rex", "raptor", "trike"],
};

export function fmtEffect(id: string, value: number): string {
  const def = EFFECTS[id];
  if (!def) return id;
  const v = def.fmt === "pct" ? `${Math.round(value * 100)}%` : def.fmt === "sec" ? `${value.toFixed(1)} s` : def.fmt === "num" ? `${Math.round(value * 10) / 10}` : "";
  return def.text.replace("{v}", v);
}
