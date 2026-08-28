// Everything that lives in the valley, and the size ladder they all sit on.
//
// The whole game is one comparison: is that thing SMALLER than me?
//
//   creature tier <  your tier  ->  food
//   creature tier == your tier  ->  a harmless bump
//   creature tier >  your tier  ->  it can eat you
//
// The middle line is the important one. A five-year-old should never lose a
// heart because she could not tell two similar shapes apart, so anything the
// same size as her is deliberately made SAFE — a nudge and a squeak, nothing
// more. Tiers step by about 1.3x, which is a difference you can see across the
// arena, and the renderer adds a warm glow / a red rim only when something is
// close, so size is what you read at a distance and the game confirms it up
// close rather than doing the judging for you.
//
// Plants sit below the whole ladder: always edible, worth very little. They
// exist so that a player can ALWAYS feed, whatever tier she is and whatever
// else has wandered off. Being eaten is fine; being stuck is not.

const PLANT_R = 8;
const PLANT_VALUE = 1;

// Radius by creature tier 0-6.
const TIER_R = [9, 12, 16, 21, 27, 34, 43];
// What a creature of each tier is worth in your belly when you eat it.
const TIER_VALUE = [2, 3, 5, 8, 12, 17, 24];

// The player runs one rung further than anything else in the valley: at tier 7
// there is nothing left that can hurt her, which is the whole point of the
// campaign's last level.
const MAX_TIER = 7;
const PLAYER_R = [0, 12, 16, 21, 27, 34, 43, 54];
const PLAYER_SPEED = [0, 158, 154, 150, 145, 139, 132, 124];
const STAGE_NAME = [
  "", "Hatchling", "Nipper", "Scamper", "Stomper", "Prowler", "Big Rex", "Mighty Rex",
];
// Belly needed to grow FROM tier i to tier i+1.
const NEED = [0, 6, 10, 16, 24, 34, 46];

// No ordinary creature may out-run the player, or being chased would stop being
// a thing you can escape and start being a thing that happens to you. Beasts
// are the deliberate exception and pay for it by tiring — tests/content.test.js
// asserts both halves.
const SPEED_CAP = 106;
const SENSE = 130;          // how far a creature notices you, logical px

// A beast sprints faster than YOU and then has to stop for a breather. Both
// numbers are multiples of the player's own speed, not of the beast's species
// speed — that was the first attempt and it does not work, because a fleeing
// Triceratops sprinting at 1.36x of 74 is still far slower than a Mighty Rex,
// so three of the four finales were a walk up to a stationary meal.
//
// Chasing one is "keep after it until it puffs out", which is a plan a small
// child can hold, unlike "be faster than it". Persistence has to actually pay,
// so the ground gained during a breather must beat the ground lost during a
// sprint — tests/content.test.js asserts exactly that.
const BEAST_SPRINT = 1.08;  // x the player's speed while it still has puff
const BEAST_STAMINA = 2.2;  // seconds of sprint
const BEAST_REST = 2.6;     // seconds blown, afterwards
const BEAST_TIRED = 0.55;   // x the player's speed while it is blowing
// And it watches for you across the whole valley. An ordinary creature only
// bolts once you are inside its own small notice range, which for a beast meant
// it ran twenty pixels, dropped out of range and went back to grazing — the
// sprint/breather cycle never got going at all, so the chase was over before
// the mechanic could show itself.
const BEAST_FLEE_RANGE = 330;

const SPECIES = [
  /* ------------------------------- plants -------------------------------- */
  // kind "plant": never moves, never a threat, always edible.
  { id: "fern", name: "Fern", kind: "plant", shape: "fern",
    body: "#3f9e52", trim: "#7fd08a",
    fact: "Ferns fed half the valley. They were old news even to dinosaurs." },
  { id: "berries", name: "Berry Bush", kind: "plant", shape: "bush",
    body: "#4a8f4a", trim: "#e8556d",
    fact: "Berries are a small snack — but there is always another one." },

  /* ------------------------------ tier 0 --------------------------------- */
  { id: "dragonfly", name: "Meganeura", tier: 0, shape: "flyer",
    speed: 92, aggression: 0, caution: 0.75,
    body: "#3fc7c0", trim: "#bff7f2",
    fact: "A dragonfly with wings as wide as a seagull's." },
  { id: "beetle", name: "Giant Beetle", tier: 0, shape: "bug",
    speed: 46, aggression: 0, caution: 0.35,
    body: "#8a6b3a", trim: "#d8b271",
    fact: "Shiny, slow, and quite happy to be eaten." },

  /* ------------------------------ tier 1 --------------------------------- */
  { id: "compy", name: "Compsognathus", tier: 1, shape: "biped",
    speed: 96, aggression: 0.3, caution: 0.6,
    body: "#c8d452", trim: "#f2f7b0",
    fact: "Chicken-sized, and never anywhere on its own." },
  { id: "dimorph", name: "Dimorphodon", tier: 1, shape: "flyer",
    speed: 100, aggression: 0, caution: 0.8,
    body: "#d68ad0", trim: "#f7d9f5",
    fact: "A flyer with a big head and a very long tail." },

  /* ------------------------------ tier 2 --------------------------------- */
  { id: "hypsi", name: "Hypsilophodon", tier: 2, shape: "runner",
    speed: 88, aggression: 0, caution: 0.85,
    body: "#d9b06a", trim: "#f6e2b4",
    fact: "A little plant-eater built entirely for running away." },
  { id: "ovi", name: "Oviraptor", tier: 2, shape: "biped",
    speed: 84, aggression: 0.5, caution: 0.45,
    body: "#e08a4a", trim: "#ffd9a8",
    fact: "Its name means egg thief — and it was a mix-up. It was guarding them." },

  /* ------------------------------ tier 3 --------------------------------- */
  { id: "raptor", name: "Velociraptor", tier: 3, shape: "runner",
    speed: 100, aggression: 0.9, caution: 0.2,
    body: "#b5613a", trim: "#f0b07a",
    fact: "Turkey-sized, covered in feathers, one hooked claw on each foot." },
  { id: "kentro", name: "Kentrosaurus", tier: 3, shape: "quad", spiky: true,
    speed: 40, aggression: 0, caution: 0.2,
    body: "#77839a", trim: "#c3cddd",
    fact: "Spikes all the way down its back and tail. Nobody bites this one." },

  /* ------------------------------ tier 4 --------------------------------- */
  { id: "galli", name: "Gallimimus", tier: 4, shape: "runner",
    speed: 106, aggression: 0, caution: 0.95,
    body: "#c9c6bb", trim: "#f2f0e8",
    fact: "The ostrich of the dinosaurs, and about as easy to catch." },
  { id: "dilo", name: "Dilophosaurus", tier: 4, shape: "crested",
    speed: 98, aggression: 0.85, caution: 0.2,
    body: "#5aa05e", trim: "#ffe07a",
    fact: "Two thin crests on its head, like a pair of dinner plates." },
  { id: "anky", name: "Ankylosaurus", tier: 4, shape: "club", spiky: true,
    speed: 34, aggression: 0, caution: 0.1,
    body: "#7f7346", trim: "#c2b077",
    fact: "A walking tank with a great bony club on the end of its tail." },

  /* ------------------------------ tier 5 --------------------------------- */
  { id: "trike", name: "Triceratops", tier: 5, shape: "frilled",
    speed: 74, aggression: 0.35, caution: 0.2,
    body: "#a3714b", trim: "#e2c08c",
    fact: "Three horns and a frill like a shield. It did not run from much." },
  { id: "stego", name: "Stegosaurus", tier: 5, shape: "plated", spiky: true,
    speed: 46, aggression: 0, caution: 0.15,
    body: "#6d84a8", trim: "#b9cbe6",
    fact: "Plates along its back and four long spikes on its tail." },

  /* ------------------------------ tier 6 --------------------------------- */
  { id: "rex", name: "Tyrannosaurus", tier: 6, shape: "rex",
    speed: 96, aggression: 1, caution: 0,
    body: "#3f6b48", trim: "#8fc48e",
    fact: "The one everybody knows. Teeth the size of bananas." },
  { id: "gigano", name: "Giganotosaurus", tier: 6, shape: "rex",
    speed: 100, aggression: 0.9, caution: 0.9,
    body: "#8a3b46", trim: "#e08a8a",
    fact: "Even longer than a T. rex, and it never learned to share." },
];

const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

function species(id) { return SPECIES_BY_ID[id]; }
function isPlant(sp) { return sp.kind === "plant"; }
function speciesRadius(sp) { return isPlant(sp) ? PLANT_R : TIER_R[sp.tier]; }
function speciesValue(sp) { return isPlant(sp) ? PLANT_VALUE : TIER_VALUE[sp.tier]; }

// The one rule, in one place, so the engine, the renderer and the bots can
// never disagree about what a thing is to you right now.
//   "food" | "bump" | "danger" | "spiky"
function relation(sp, playerTier) {
  if (isPlant(sp)) return "food";
  if (sp.spiky) return "spiky";
  if (sp.tier < playerTier) return "food";
  if (sp.tier === playerTier) return "bump";
  return "danger";
}
