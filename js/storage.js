// Persistence: gamekit storage (lib/gk-storage.js) configured for Tiny Rex.
// trex_* localStorage keys, "tinyrex" Firestore collection.
//
// There is no currency and no shop here, on purpose. The only way to get better
// at Tiny Rex is to get better at reading sizes and watching your back, and an
// upgrade would be a way round exactly the thing the game is for. So everything
// saved is a record of what happened, and every field only ever goes up —
// which is what makes a field-wise max() merge correct rather than merely
// convenient when two devices sync.
//
// PROGRESS is a named object rather than two inline callbacks because
// createStorage keeps them in its closure and never exposes them, and this is
// the one function in the game that can permanently destroy a save.

const PROGRESS = {
  blank: () => ({
    levels: {},        // { [idx]: { stars, best } }
    met: {},           // { [speciesId]: 1 } — fills the Dino Book
    feastBest: 0,      // best Endless Feast score: the leaderboard number
    feastTier: 0,      // biggest you have ever been in the Feast
    catches: 0,        // everything you have ever eaten
    updated: 0,
  }),

  merge: (a, b) => {
    const levels = { ...(a.levels || {}) };
    for (const [idx, r] of Object.entries(b.levels || {})) {
      const cur = levels[idx];
      levels[idx] = cur
        ? { stars: Math.max(cur.stars || 0, r.stars || 0), best: Math.max(cur.best || 0, r.best || 0) }
        : r;
    }
    return {
      // Spread first, so a field a newer build added survives an older client's
      // merge instead of being dropped on the next sync.
      ...a, ...b,
      levels,
      // A species you have met is never un-met, so the union is always right.
      met: { ...(a.met || {}), ...(b.met || {}) },
      feastBest: Math.max(a.feastBest || 0, b.feastBest || 0),
      feastTier: Math.max(a.feastTier || 0, b.feastTier || 0),
      catches: Math.max(a.catches || 0, b.catches || 0),
    };
  },
};

const Storage = GK.createStorage({
  prefix: "trex",
  collection: "tinyrex",
  firebaseConfig: window.FIREBASE_CONFIG,
  blankProgress: PROGRESS.blank,
  mergeProgress: PROGRESS.merge,
});

Object.assign(Storage, {
  totalStars(prog) {
    return Object.values(prog.levels || {}).reduce((s, r) => s + (r.stars || 0), 0);
  },

  levelsWon(prog) { return Object.keys(prog.levels || {}).length; },

  // Hunts unlock in order: the one after the highest she has finished.
  unlockedLevel(prog) {
    let max = -1;
    for (const k of Object.keys(prog.levels || {})) max = Math.max(max, Number(k));
    return Math.min(max + 1, LEVELS.length - 1);
  },

  feastUnlocked(prog) { return this.levelsWon(prog) >= FEAST_UNLOCK; },

  metCount(prog) { return Object.keys(prog.met || {}).length; },

  // Only a WIN is recorded against a level, because recording a loss would
  // unlock the next one. Everything else — who she met, what she ate — is a
  // record of the afternoon and counts either way.
  record(profileId, res) {
    const prog = this.getProgress(profileId);
    prog.met = prog.met || {};
    for (const id of Object.keys(res.met || {})) prog.met[id] = 1;
    prog.catches = (prog.catches || 0) + (res.catches || 0);

    if (res.mode === "feast") {
      prog.feastBest = Math.max(prog.feastBest || 0, res.score || 0);
      prog.feastTier = Math.max(prog.feastTier || 0, res.tier || 0);
    } else if (res.win) {
      const cur = prog.levels[res.levelIdx];
      prog.levels[res.levelIdx] = {
        stars: Math.max((cur && cur.stars) || 0, res.stars || 0),
        best: Math.max((cur && cur.best) || 0, res.score || 0),
      };
    }

    this.saveProgress(profileId, prog);
    return prog;
  },
});
