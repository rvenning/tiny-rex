// Shared sandbox loader. Same concatenation order as index.html — a file that
// reads another's top-level `const` crashes on load if the order drifts.

const path = require("node:path");
const { loadScripts } = require("../lib/tools/test-harness.js");

const ROOT = path.join(__dirname, "..");

function load() {
  return loadScripts({
    baseDir: ROOT,
    files: [
      "tests/seed.js",
      "lib/gk-util.js",
      "js/rng.js",
      "js/creatures.js",
      "js/levels.js",
      "js/game.js",
    ],
    exports: [
      "RNG",
      "SPECIES", "SPECIES_BY_ID", "species", "isPlant", "relation",
      "speciesRadius", "speciesValue",
      "PLANT_R", "PLANT_VALUE", "TIER_R", "TIER_VALUE", "PLAYER_R", "PLAYER_SPEED",
      "MAX_TIER", "NEED", "STAGE_NAME", "SPEED_CAP", "SENSE",
      "BEAST_SPRINT", "BEAST_STAMINA", "BEAST_REST", "BEAST_TIRED", "BEAST_FLEE_RANGE",
      "WORLDS", "LEVELS", "FEAST", "FEAST_UNLOCK", "levelsInWorld", "levelBelly",
      "Game", "LW", "LH", "FOOD_FLOOR", "SPAWN_CLEAR", "INVULN",
      "__reseed", "__rand",
    ],
    browser: true,
    globals: { performance: { now: () => 0 }, requestAnimationFrame() {} },
  });
}

module.exports = { load, ROOT };
