// Sounds, layered on gamekit's defaults. All synthesized — nothing to load,
// nothing to cache, works offline.
//
// The palette drops in pitch as you grow: a hatchling's chomp is a bright little
// snap and a Mighty Rex's is a low crunch, so your own size is something you can
// hear as well as see. And the one rule this game will not break: getting caught
// must not sound like a telling-off. It is a gulp and a scramble, warm and low,
// never a buzzer — she has lost a heart, not done something wrong.

const Sfx = GK.Sfx;

Object.assign(Sfx, {
  // Eating something. Pitch falls with your tier, so the sound of the game
  // deepens across a hunt.
  chomp(tier = 1, big = false) {
    const f = 640 * Math.pow(0.86, tier - 1);
    this.tone({ freq: f, type: "square", dur: 0.05, vol: 0.09 });
    this.tone({ freq: f * 0.6, type: "triangle", dur: 0.09, vol: 0.11, when: 0.04 });
    this.noise({ dur: big ? 0.13 : 0.05, vol: big ? 0.09 : 0.045, when: 0.02 });
  },

  // A berry or a fern: a small soft pop, deliberately slighter than a catch.
  nibble() {
    this.tone({ freq: 880, type: "sine", dur: 0.05, vol: 0.06 });
    this.tone({ freq: 1180, type: "sine", dur: 0.04, vol: 0.04, when: 0.035 });
  },

  // Growing a size. The big moment of the whole game, so it gets a proper
  // rising fanfare that climbs a little higher the bigger you have got.
  grow(tier = 2) {
    const base = 392 * Math.pow(1.03, tier);
    [1, 1.26, 1.5, 2].forEach((m, i) =>
      this.tone({ freq: base * m, type: "triangle", dur: 0.2, vol: 0.15, when: i * 0.07 }));
    this.tone({ freq: base * 0.5, type: "sine", dur: 0.4, vol: 0.1, when: 0.05 });
  },

  // Caught. A gulp and a scurry — soft, low, over quickly. Nothing sour.
  scare() {
    this.tone({ freq: 300, type: "sine", dur: 0.1, vol: 0.11, slide: -110 });
    this.noise({ dur: 0.22, vol: 0.06, when: 0.05 });
    this.tone({ freq: 180, type: "sine", dur: 0.16, vol: 0.08, when: 0.1 });
  },

  // Biting something armoured: two dull knocks. "Not that one", not "wrong".
  nope() {
    this.tone({ freq: 210, type: "triangle", dur: 0.06, vol: 0.08 });
    this.tone({ freq: 175, type: "triangle", dur: 0.08, vol: 0.07, when: 0.07 });
  },

  // Bumping noses with something your own size: a friendly little squeak.
  bump() { this.tone({ freq: 520, type: "sine", dur: 0.05, vol: 0.05, slide: 90 }); },

  // The beast, when it turns up and when it goes down.
  roar() {
    this.tone({ freq: 130, type: "sawtooth", dur: 0.55, vol: 0.15, slide: -45 });
    this.tone({ freq: 74, type: "square", dur: 0.6, vol: 0.1, when: 0.04 });
    this.noise({ dur: 0.5, vol: 0.06, when: 0.06 });
  },

  // The valley getting rougher in the Endless Feast.
  wave() {
    [294, 262, 233].forEach((f, i) =>
      this.tone({ freq: f, type: "sawtooth", dur: 0.18, vol: 0.09, when: i * 0.1 }));
  },

  // Hunger winning: you slip back a size. Falling, but gently.
  shrink() {
    [523, 440, 349].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.16, vol: 0.1, when: i * 0.08 }));
  },

  star(n = 1) {
    const base = 660 * Math.pow(2, (n - 1) / 12);
    this.tone({ freq: base, type: "triangle", dur: 0.14, vol: 0.14 });
    this.tone({ freq: base * 1.5, type: "sine", dur: 0.2, vol: 0.1, when: 0.07 });
  },

  finish() {
    [392, 523, 659, 784, 1047].forEach((f, i) =>
      this.tone({ freq: f, type: "triangle", dur: 0.24, vol: 0.14, when: i * 0.11 }));
  },
});
