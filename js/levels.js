// The campaign: four valleys, five hunts each.
//
// Difficulty here is deliberately NOT speed. Nothing in the valley can out-run
// you, and no level is graded on the clock — the stars come from how many
// hearts you finish with, so a careful five-year-old can take as long as she
// likes and still get three. What actually gets harder is the JUDGEMENT:
//
//   Fern Hollow   nothing hunts you. Learn "eat the small ones".
//   Bone Gulch    things hunt you. Learn to watch behind you.
//   Spike Ridge   spiky ones can NEVER be eaten, whatever size you are. That is
//                 a rule you have to hold in your head, and size alone stops
//                 being enough to answer the question.
//   Thunder Basin all of it at once, and the biggest things alive.
//
// Every hunt in every valley also has plants scattered about, which are always
// edible whatever tier you are. They are slow going, but they mean there is
// ALWAYS something you can safely eat — losing a hunt should be possible,
// being stuck should not.
//
// Each entry's `spawn` counts are steady state, not a total: eat something and
// another one wanders in a few seconds later, so the valley never empties out.

const WORLDS = [
  { id: "hollow", name: "Fern Hollow", icon: "🌿",
    sky: ["#8fd8e8", "#cdeecb"], ground: "#5f9e57", groundDark: "#4a8046",
    rock: "#7d9c6b", scrub: "#3f7f45",
    blurb: "Warm, green and full of bugs. Nothing here wants to eat you." },
  { id: "gulch", name: "Bone Gulch", icon: "🦴",
    sky: ["#f4c98a", "#f6e2b8"], ground: "#c99a5f", groundDark: "#a87d47",
    rock: "#d8bd90", scrub: "#9c7c3f",
    blurb: "Dry, open and busy. Things in the gulch have noticed you." },
  { id: "ridge", name: "Spike Ridge", icon: "⛰️",
    sky: ["#9a94d8", "#d3cbe9"], ground: "#7a7192", groundDark: "#615a77",
    rock: "#9b93b4", scrub: "#4f4a63",
    blurb: "Cold stone, and armour everywhere. Some things you just cannot bite." },
  { id: "basin", name: "Thunder Basin", icon: "🌋",
    sky: ["#e08a63", "#f3bb8e"], ground: "#8c5340", groundDark: "#6d3f31",
    rock: "#a86a4f", scrub: "#5c3427",
    blurb: "Ash on the wind and the ground shaking. The big ones live here." },
];

// idx is filled in below so a level always knows its own number.
const LEVELS = [
  /* ------------------------ Fern Hollow (learning) ----------------------- */
  { world: 0, name: "First Light", start: 1, target: 2, time: 100, plants: 14,
    hint: "Eat anything SMALLER than you. Drag or tap to run there.",
    spawn: [["beetle", 6], ["dragonfly", 3], ["hypsi", 2]] },

  { world: 0, name: "Bug Hunt", start: 1, target: 3, time: 115, plants: 12,
    hint: "Something the same size as you is safe — you just bump noses.",
    spawn: [["beetle", 5], ["dragonfly", 4], ["compy", 4], ["hypsi", 2]] },

  { world: 0, name: "The Long Grass", start: 1, target: 3, time: 115, plants: 11,
    hint: "Grow one size and yesterday's bully is today's dinner.",
    spawn: [["beetle", 4], ["dragonfly", 3], ["compy", 5], ["ovi", 2], ["hypsi", 2]] },

  { world: 0, name: "Nipper's Run", start: 2, target: 4, time: 125, plants: 11,
    hint: "That rusty one with the feathers hunts. Keep an eye on it.",
    spawn: [["compy", 5], ["dimorph", 3], ["hypsi", 4], ["ovi", 3], ["raptor", 1]] },

  { world: 0, name: "Old Claw", start: 2, target: 4, time: 145, plants: 12,
    beast: { id: "raptor", name: "Old Claw" },
    hint: "Old Claw is hunting you. Grow past him and it is his turn to run.",
    spawn: [["compy", 5], ["dragonfly", 3], ["hypsi", 4], ["ovi", 3]] },

  /* -------------------------- Bone Gulch (hunted) ------------------------ */
  { world: 1, name: "Dry Bones", start: 2, target: 4, time: 125, plants: 10,
    hint: "Two hunters now. Eat with one eye behind you.",
    spawn: [["compy", 5], ["hypsi", 4], ["ovi", 4], ["raptor", 2]] },

  { world: 1, name: "The Wide Open", start: 2, target: 5, time: 140, plants: 10,
    hint: "The pale runners are quick, but they tire before you do.",
    spawn: [["compy", 6], ["hypsi", 5], ["ovi", 4], ["raptor", 2], ["galli", 2]] },

  { world: 1, name: "Crested Trouble", start: 3, target: 5, time: 135, plants: 10,
    hint: "The green one with the fans on its head is trouble. Give it room.",
    spawn: [["compy", 5], ["hypsi", 5], ["ovi", 4], ["raptor", 2], ["galli", 2], ["dilo", 1]] },

  { world: 1, name: "Pack Country", start: 3, target: 5, time: 135, plants: 9,
    hint: "When two come at once, run to open ground — never into a corner.",
    spawn: [["compy", 5], ["hypsi", 4], ["ovi", 4], ["raptor", 3], ["galli", 2], ["dilo", 1]] },

  { world: 1, name: "Hiss", start: 3, target: 5, time: 155, plants: 10,
    beast: { id: "dilo", name: "Hiss" },
    hint: "Hiss is faster than you — until he runs out of puff. Keep after him.",
    spawn: [["compy", 5], ["hypsi", 5], ["ovi", 4], ["raptor", 2], ["galli", 2]] },

  /* ------------------------- Spike Ridge (the rule) ---------------------- */
  { world: 2, name: "Sharp Company", start: 3, target: 5, time: 140, plants: 10,
    hint: "SPIKY ones can never be eaten — however small they look. Leave them be.",
    spawn: [["compy", 5], ["hypsi", 4], ["ovi", 3], ["raptor", 2], ["galli", 2], ["kentro", 3]] },

  { world: 2, name: "Armour Plated", start: 3, target: 5, time: 140, plants: 9,
    hint: "Biting a spiky one costs you a mouthful. Pick something soft instead.",
    spawn: [["compy", 5], ["hypsi", 4], ["ovi", 3], ["raptor", 2], ["galli", 3],
            ["kentro", 3], ["anky", 2]] },

  { world: 2, name: "The Stone Bowl", start: 4, target: 6, time: 155, plants: 9,
    hint: "Big and horned is dinner. Big and spiky is not.",
    spawn: [["hypsi", 4], ["ovi", 3], ["raptor", 2], ["galli", 3], ["dilo", 2],
            ["kentro", 3], ["anky", 2], ["trike", 2]] },

  { world: 2, name: "Plates and Spikes", start: 4, target: 6, time: 155, plants: 9,
    hint: "Half the ridge is armoured today. Hunt what you can actually swallow.",
    spawn: [["hypsi", 4], ["galli", 3], ["dilo", 2], ["raptor", 2],
            ["kentro", 4], ["anky", 3], ["stego", 3], ["trike", 2]] },

  { world: 2, name: "Bramble", start: 4, target: 6, time: 170, plants: 10,
    beast: { id: "trike", name: "Bramble" },
    hint: "Bramble has three horns and no manners. Out-grow her first.",
    spawn: [["hypsi", 4], ["galli", 3], ["dilo", 2], ["raptor", 2],
            ["kentro", 3], ["anky", 2], ["trike", 1]] },

  /* ------------------------ Thunder Basin (the top) ---------------------- */
  { world: 3, name: "Ashfall", start: 4, target: 6, time: 160, plants: 9,
    hint: "There is a full-grown Tyrannosaurus in here. Stay small and quiet, then grow.",
    spawn: [["compy", 4], ["hypsi", 4], ["ovi", 3], ["raptor", 2], ["galli", 3],
            ["dilo", 2], ["kentro", 2], ["anky", 2], ["trike", 2], ["rex", 1]] },

  { world: 3, name: "The Shaking Ground", start: 5, target: 6, time: 145, plants: 8,
    hint: "Horned ones are worth a lot. Three of them and you are a Big Rex.",
    spawn: [["galli", 4], ["dilo", 3], ["anky", 2], ["stego", 3], ["trike", 4], ["rex", 1]] },

  { world: 3, name: "Two Giants", start: 5, target: 7, time: 175, plants: 8,
    hint: "One more size after Big Rex — and then nothing in the valley can touch you.",
    spawn: [["galli", 4], ["dilo", 3], ["stego", 3], ["trike", 4], ["rex", 2]] },

  { world: 3, name: "Last Light", start: 5, target: 7, time: 180, plants: 8,
    hint: "Keep moving. Two of them are hunting and neither one gives up.",
    spawn: [["galli", 4], ["dilo", 3], ["kentro", 2], ["stego", 3], ["trike", 5],
            ["rex", 1], ["gigano", 1]] },

  { world: 3, name: "Giganto", start: 5, target: 7, time: 200, plants: 9,
    beast: { id: "gigano", name: "Giganto" },
    hint: "Giganto rules this basin. Become a Mighty Rex and take it from him.",
    spawn: [["galli", 4], ["dilo", 3], ["stego", 3], ["trike", 5], ["rex", 1]] },
];

LEVELS.forEach((l, i) => { l.idx = i; });

// The Endless Feast is where the family leaderboard lives: no target, no clock,
// and a belly that empties on its own so you can never simply sit at the top of
// the food chain. It unlocks once Fern Hollow is done, so it is never the first
// thing a small player meets.
const FEAST_UNLOCK = 5;

const FEAST = {
  name: "Endless Feast",
  start: 1,
  // Two rungs below the campaign's ceiling, and that is the whole design of the
  // mode. At tier 6 nothing left alive out-sizes you, so the Feast turned into
  // a pure hunger-management exercise with no danger in it at all and the bots
  // never came to the end of a run. Topping out at Prowler keeps the biggest
  // dinosaurs in the valley genuinely dangerous for the length of the run —
  // growing all the way up is what the campaign is for.
  maxTier: 5,
  plants: 12,
  waveEvery: 24,       // seconds between the valley getting rougher
  // Fraction of your CURRENT growth bar burned per second, and how much faster
  // that gets with each wave. Empty your belly at tier 2 or more and you drop a
  // size — the run winds down rather than ending on one mistake.
  hunger: 0.030,
  hungerPerWave: 0.0042,
  // How much fuller the valley gets per wave once the table below runs out.
  thicken: 0.16,
  // Wave 0 is the opening valley; each later wave adds its row on top.
  waves: [
    [["beetle", 5], ["dragonfly", 4], ["compy", 5], ["hypsi", 4]],
    [["ovi", 3], ["raptor", 1]],
    [["galli", 2], ["kentro", 2]],
    [["raptor", 2], ["dilo", 1]],
    [["anky", 2], ["trike", 2]],
    [["dilo", 2], ["stego", 2]],
    [["rex", 1], ["galli", 2]],
    [["raptor", 2], ["trike", 2]],
    [["rex", 1], ["gigano", 1]],
  ],
};

function levelsInWorld(w) { return LEVELS.filter((l) => l.world === w); }

// Total belly a level asks you to eat, which is what the star hints and the
// balance tests are really about.
function levelBelly(l) {
  let sum = 0;
  for (let t = l.start; t < l.target; t++) sum += NEED[t];
  return sum;
}
