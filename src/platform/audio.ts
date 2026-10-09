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
  play(kind: string, tier = 1) {
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
