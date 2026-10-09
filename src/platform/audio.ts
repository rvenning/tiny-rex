/** Small Web Audio adapter: synthesis is appropriate for Tiny Rex's original voice. */
export class Audio {
  enabled = true;
  private context?: AudioContext;
  unlock() {
    try {
      if (!this.context) this.context = new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      /* A disabled audio device must never prevent a menu action. */
    }
  }
  tone(
    freq: number,
    duration = 0.12,
    delay = 0,
    type: OscillatorType = "triangle",
    volume = 0.08,
  ) {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      t = c.currentTime + delay,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(
      Math.max(50, freq * 0.8),
      t + duration,
    );
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + duration + 0.01);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }
  /** short filtered-noise burst (impacts, whooshes, splashes) */
  noise(duration = 0.1, freq = 1200, q = 1, volume = 0.05, delay = 0, type: BiquadFilterType = "bandpass") {
    if (!this.enabled || !this.context) return;
    const c = this.context,
      t = c.currentTime + delay,
      n = Math.max(1, Math.floor(c.sampleRate * duration)),
      buf = c.createBuffer(1, n, c.sampleRate),
      d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    src.buffer = buf;
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f);
    f.connect(g);
    g.connect(c.destination);
    src.start(t);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
  }
  private bed?: { stop: () => void };
  /** quiet living jungle: wind and water bed, birds, insects. mood() is polled so the bed follows the player. */
  startAmbience(mood: () => { water: number; night?: number }) {
    this.stopAmbience();
    if (!this.context) return;
    const c = this.context;
    const len = c.sampleRate * 4,
      buf = c.createBuffer(1, len, c.sampleRate),
      d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.98 + (Math.random() * 2 - 1) * 0.1; // brown-ish noise
      d[i] = last;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const wind = c.createBiquadFilter();
    wind.type = "lowpass";
    wind.frequency.value = 420;
    const windGain = c.createGain();
    windGain.gain.value = 0.0;
    src.connect(wind);
    wind.connect(windGain);
    windGain.connect(c.destination);
    const water = c.createBiquadFilter();
    water.type = "bandpass";
    water.frequency.value = 1700;
    water.Q.value = 0.6;
    const waterGain = c.createGain();
    waterGain.gain.value = 0;
    src.connect(water);
    water.connect(waterGain);
    waterGain.connect(c.destination);
    src.start();
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const m = mood();
      const on = this.enabled;
      windGain.gain.setTargetAtTime(on ? 0.9 : 0, c.currentTime, 0.8);
      waterGain.gain.setTargetAtTime(on ? 0.16 * m.water : 0, c.currentTime, 0.6);
      if (on && Math.random() < 0.55) {
        const f = 2200 + Math.random() * 1800;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          this.tone(f * (1 + i * 0.06), 0.08, i * 0.11, "sine", 0.012);
          this.tone(f * 1.4 * (1 + i * 0.06), 0.06, i * 0.11 + 0.04, "sine", 0.006);
        }
      }
      if (on && Math.random() < 0.3) for (let i = 0; i < 4; i++) this.tone(5200, 0.025, i * 0.05, "square", 0.0025);
      timer = window.setTimeout(tick, 2200 + Math.random() * 3800);
    };
    let timer = window.setTimeout(tick, 400);
    this.bed = {
      stop: () => {
        alive = false;
        clearTimeout(timer);
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        for (const n of [src, wind, windGain, water, waterGain]) n.disconnect();
      },
    };
  }
  stopAmbience() {
    this.bed?.stop();
    this.bed = undefined;
  }
  play(kind: string, tier = 1) {
    if (kind === "hit") {
      this.noise(0.09, 900, 0.8, 0.07);
      this.tone(120, 0.12, 0, "triangle", 0.06);
      return;
    }
    if (kind === "step") {
      this.noise(0.05, 500, 0.7, 0.012);
      return;
    }
    if (kind === "bite") {
      this.tone(180, 0.07, 0, "sawtooth", 0.035);
      this.tone(95, 0.08, 0.035, "triangle", 0.05);
      return;
    }
    if (kind === "roar") {
      this.tone(100, 0.35, 0, "sawtooth", 0.045);
      this.tone(65, 0.3, 0.08, "triangle", 0.06);
      return;
    }
    if (kind === "dodge") {
      this.tone(700, 0.07, 0, "sine", 0.025);
      this.tone(1100, 0.09, 0.035, "sine", 0.02);
      return;
    }
    if (kind === "tell") {
      this.tone(230, 0.12, 0, "triangle", 0.04);
      this.tone(310, 0.13, 0.06, "triangle", 0.035);
      return;
    }
    if (kind === "grow" || kind === "win") {
      [392, 494, 588, 784].forEach((f, i) =>
        this.tone(f * Math.pow(1.03, tier), 0.22, i * 0.075),
      );
      return;
    }
    if (kind === "eat") {
      const f = 640 * Math.pow(0.86, tier - 1);
      this.tone(f, 0.055, 0, "square", 0.045);
      this.tone(f * 0.6, 0.09, 0.04);
      return;
    }
    if (kind === "hurt") {
      this.tone(240, 0.2, 0, "sine");
      this.tone(160, 0.17, 0.09, "sine");
      return;
    }
    if (kind === "nope") {
      this.tone(210, 0.06);
      this.tone(175, 0.08, 0.07);
      return;
    }
    if (kind === "shrink") {
      [523, 440, 349].forEach((f, i) => this.tone(f, 0.16, i * 0.08));
      return;
    }
    if (kind === "wave") {
      [294, 262, 233].forEach((f, i) => this.tone(f, 0.18, i * 0.1));
      return;
    }
    this.tone(kind === "bump" ? 520 : 880, 0.06, 0, "sine", 0.035);
  }
}
