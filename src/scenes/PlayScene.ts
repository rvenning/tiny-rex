import * as Phaser from "phaser";
import { Simulation } from "../game/simulation";
import { STAGE_NAME, relation } from "../game/content";
import { presentation as P, rules as R } from "../game/config";
import type { Entity, GameEvent } from "../game/types";
import type { Audio } from "../platform/audio";
import { ensureWorldTextures } from "../art/textures";

export class PlayScene extends Phaser.Scene {
  sim!: Simulation;
  private sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private names = new Map<number, Phaser.GameObjects.Text>();
  private rex!: Phaser.GameObjects.Sprite;
  private cues!: Phaser.GameObjects.Graphics;
  private bar!: Phaser.GameObjects.Rectangle;
  private stageLabel!: Phaser.GameObjects.Text;
  private heartLabel!: Phaser.GameObjects.Text;
  private scoreLabel!: Phaser.GameObjects.Text;
  private timeLabel!: Phaser.GameObjects.Text;
  private targetRing!: Phaser.GameObjects.Arc;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private ambient!: Phaser.GameObjects.Particles.ParticleEmitter;
  private publishAt = 0;
  private pointerId: number | null = null;
  private effects = 0;
  private lastTier = 0;
  private rexMoving = false;
  private previousPositions = new Map<number, { x: number; y: number }>();
  private lastHud = "";
  private reduced = false;
  constructor() {
    super("Play");
  }
  get animationState() {
    return this.rex?.anims
      ? {
          key: this.rex.anims.currentAnim?.key ?? "idle",
          frame: this.rex.frame.name,
        }
      : null;
  }
  create(data: { seed?: number; world?: number }) {
    this.cameras.main.setOrigin(0, 0).setZoom(P.renderScale);
    this.sprites.clear();
    this.previousPositions.clear();
    this.rexMoving = false;
    this.names.clear();
    this.effects = 0;
    this.lastHud = "";
    this.pointerId = null;
    this.sim = new Simulation(null, data.seed ?? Date.now() >>> 0);
    const world = ["hollow", "gulch", "ridge", "basin"][data.world ?? 0];
    this.reduced = !!this.registry.get("reducedMotion");
    ensureWorldTextures(this, world);
    this.add
      .image(210, 370, world + "-floor")
      .setDisplaySize(420, 740)
      .setDepth(-100);
    this.add
      .image(210, 370, world + "-fringe")
      .setDisplaySize(420, 740)
      .setDepth(9000);
    this.cues = this.add.graphics().setDepth(-1);
    this.particles = this.add
      .particles(0, 0, "spark", {
        emitting: false,
        maxParticles: P.feedbackLimit,
        lifespan: { min: 350, max: 650 },
        speed: { min: 35, max: 110 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.9, end: 0 },
        gravityY: 35,
      })
      .setDepth(8800)
      .reserve(P.feedbackLimit);
    this.ambient = this.add
      .particles(0, 0, "spark", {
        emitting: !this.reduced,
        x: { min: 35, max: 385 },
        y: { min: 145, max: 670 },
        frequency: 650,
        maxParticles: 12,
        lifespan: 6500,
        speedY: { min: -8, max: -3 },
        speedX: { min: -3, max: 3 },
        scale: { start: 0.1, end: 0 },
        alpha: { start: 0.25, end: 0 },
        tint: 0xffe6aa,
      })
      .setDepth(8801);
    this.rex = this.add
      .sprite(0, 0, "rex-" + this.sim.player.tier, "0")
      .setScale(1 / P.atlasResolution);
    this.lastTier = this.sim.player.tier;
    this.rex.setFrame("0");
    this.add
      .rectangle(210, 60, 394, 112, 0x13291f, 0.94)
      .setDepth(10000)
      .setStrokeStyle(1, 0xf4dfa4, 0.12);
    const text = (
      x: number,
      y: number,
      s: string,
      size: number,
      color = "#f5ecd1",
    ) =>
      this.add
        .text(x, y, s, {
          fontFamily: "Trebuchet MS, sans-serif",
          resolution: P.renderScale,
          fontSize: size,
          fontStyle: "bold",
          color,
        })
        .setDepth(10001);
    text(24, 18, this.sim.level?.name ?? "Endless Feast", 20);
    this.timeLabel = text(388, 20, "", 13, "#d9e5c1").setOrigin(1, 0);
    this.heartLabel = text(24, 50, "", 19, "#ffae95");
    this.scoreLabel = text(388, 51, "", 17, "#ffdc80").setOrigin(1, 0);
    this.stageLabel = text(24, 79, "", 13, "#d3eac7");
    this.add.rectangle(210, 104, 366, 8, 0x081711).setDepth(10001);
    this.bar = this.add
      .rectangle(27, 104, 0, 8, 0xf7cf6d)
      .setOrigin(0, 0.5)
      .setDepth(10002);
    this.targetRing = this.add
      .circle(0, 0, 9, 0xffecb0, 0.15)
      .setStrokeStyle(1, 0xffecb0, 0.55)
      .setDepth(-2)
      .setVisible(false);
    this.keys = this.input.keyboard!.addKeys(
      "UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,ESC",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    const pause = () => this.requestPause();
    this.input.keyboard!.on("keydown-ESC", pause);
    this.input.keyboard!.on("keydown-SPACE", pause);
    const aim = (p: Phaser.Input.Pointer) => {
      const point = this.cameras.main.getWorldPoint(p.x, p.y);
      this.sim.target.x = Phaser.Math.Clamp(point.x - P.arenaX, 0, R.width);
      this.sim.target.y = Phaser.Math.Clamp(point.y - P.arenaY, 0, R.height);
      this.targetRing
        .setPosition(this.sim.target.x + P.arenaX, this.sim.target.y + P.arenaY)
        .setVisible(true);
    };
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const point = this.cameras.main.getWorldPoint(p.x, p.y);
      if (
        this.pointerId !== null ||
        point.y < P.arenaY ||
        point.y > P.arenaY + R.height
      )
        return;
      this.pointerId = p.id;
      (this.registry.get("audio") as Audio).unlock();
      aim(p);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.pointerId === p.id && p.isDown) aim(p);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.pointerId === p.id) this.pointerId = null;
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);
    const hidden = () => {
      if (document.hidden) this.requestPause();
    };
    document.addEventListener("visibilitychange", hidden);
    const blur = () => this.requestPause();
    window.addEventListener("blur", blur);
    const cancel = () => {
      this.pointerId = null;
    };
    window.addEventListener("pointercancel", cancel);
    this.events.once("shutdown", () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointercancel", cancel);
      this.input.keyboard!.off("keydown-ESC", pause);
      this.input.keyboard!.off("keydown-SPACE", pause);
    });
    this.announce(this.sim.level?.hint ?? "Keep eating. Hunger never stops.");
    this.publishState();
  }
  requestPause() {
    if (!this.sim.running || this.scene.isPaused()) return;
    this.pointerId = null;
    this.sim.target = { x: this.sim.player.x, y: this.sim.player.y };
    this.input.keyboard?.resetKeys();
    this.scene.pause();
    window.dispatchEvent(new Event("rex-pause"));
  }
  resumeRun() {
    this.input.keyboard?.resetKeys();
    this.pointerId = null;
    this.scene.resume();
  }
  private announce(text: string) {
    document.getElementById("announcer")!.textContent = text;
  }
  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000),
      k = this.keys,
      p = this.sim.player;
    const dx =
        Number(k.RIGHT.isDown || k.D.isDown) -
        Number(k.LEFT.isDown || k.A.isDown),
      dy =
        Number(k.DOWN.isDown || k.S.isDown) - Number(k.UP.isDown || k.W.isDown);
    if (dx || dy) {
      const length = Math.hypot(dx, dy);
      this.sim.target = {
        x: p.x + (dx / length) * 80,
        y: p.y + (dy / length) * 80,
      };
      this.targetRing.setVisible(false);
    }
    this.sim.update(dt);
    for (const event of this.sim.events) this.feedback(event);
    this.sim.events.length = 0;
    const reduced = !!this.registry.get("reducedMotion");
    if (reduced !== this.reduced) {
      this.reduced = reduced;
      for (const sprite of [...this.sprites.values(), this.rex]) {
        if (reduced) sprite.anims.pause();
        else sprite.play(sprite.texture.key);
      }
      if (reduced) this.ambient.stop().setVisible(false);
      else this.ambient.start().setVisible(true);
      if (reduced) this.cameras.main.resetFX();
    }
    this.drawEntities();
    this.drawHud();
    if (_time >= this.publishAt) {
      this.publishAt = _time + 100;
      this.publishState();
    }
  }
  private drawEntities() {
    const p = this.sim.player;
    this.cues.clear();
    const live = new Set<number>();
    for (const e of this.sim.entities) {
      if (e.dead) continue;
      live.add(e.id);
      let sprite = this.sprites.get(e.id);
      if (!sprite) {
        sprite = this.add.sprite(0, 0, "animal-" + e.sp.id, "0");
        if (!this.reduced) sprite.play("animal-" + e.sp.id);
        this.sprites.set(e.id, sprite);
      }
      sprite
        .setPosition(e.x + P.arenaX, e.y + P.arenaY)
        .setFlipX(e.face < 0)
        .setDepth(e.r * 100 + e.y * 0.01)
        .setScale((e.beast ? 1.1 : 1) / P.atlasResolution);
      const previous = this.previousPositions.get(e.id);
      if (!this.reduced && e.sp.kind !== "plant" && previous) {
        const moving = Math.hypot(e.x - previous.x, e.y - previous.y) > 0.03;
        if (moving && !sprite.anims.isPlaying) sprite.play("animal-" + e.sp.id);
        else if (!moving && sprite.anims.isPlaying) {
          sprite.anims.stop();
          sprite.setFrame("0");
        }
        sprite.anims.timeScale = e.flee > 0 ? 1.4 : e.rest > 0 ? 0.6 : 1;
      }
      this.previousPositions.set(e.id, { x: e.x, y: e.y });
      const distance = Math.hypot(e.x - p.x, e.y - p.y);
      if (distance < R.cueRange && e.sp.kind !== "plant")
        this.cue(e, relation(e.sp, p.tier), 1 - distance / R.cueRange);
      if (e.beast) {
        let name = this.names.get(e.id);
        if (!name) {
          name = this.add
            .text(0, 0, e.name!, {
              fontFamily: "Trebuchet MS",
              fontSize: 11,
              fontStyle: "bold",
              color: "#ffe0a0",
              backgroundColor: "#253426",
              padding: { x: 6, y: 3 },
            })
            .setOrigin(0.5);
          this.names.set(e.id, name);
        }
        name
          .setPosition(e.x + P.arenaX, e.y + P.arenaY - e.r - 14)
          .setDepth(8500);
        name.setText(e.rest > 0 ? e.name + " · tired" : e.name!);
      }
    }
    for (const [id, sprite] of this.sprites)
      if (!live.has(id)) {
        sprite.destroy();
        this.sprites.delete(id);
        this.previousPositions.delete(id);
        this.names.get(id)?.destroy();
        this.names.delete(id);
      }
    if (p.tier !== this.lastTier) {
      this.lastTier = p.tier;
      this.rex.setTexture("rex-" + p.tier, "0");
      this.rexMoving = false;
    }
    const moving =
      Math.hypot(this.sim.target.x - p.x, this.sim.target.y - p.y) > 3 &&
      this.sim.running;
    if (!this.reduced && p.chomp > 0) {
      const key = "rex-" + p.tier + "-bite";
      if (this.rex.anims.currentAnim?.key !== key || !this.rex.anims.isPlaying)
        this.rex.play(key);
    } else if (
      !this.reduced &&
      (moving !== this.rexMoving ||
        moving !== this.rex.anims.isPlaying ||
        this.rex.anims.currentAnim?.key?.endsWith("-bite"))
    ) {
      this.rexMoving = moving;
      if (moving) this.rex.play("rex-" + p.tier);
      else {
        this.rex.anims.stop();
        this.rex.setFrame("bite-0");
      }
    }
    if (
      !this.reduced &&
      !moving &&
      p.chomp === 0 &&
      !this.tweens.isTweening(this.rex)
    ) {
      const breath = 1 + Math.sin(this.sim.elapsed * 2.5) * 0.022;
      this.rex.setScale(1 / P.atlasResolution, breath / P.atlasResolution);
    }
    this.rex
      .setPosition(p.x + P.arenaX, p.y + P.arenaY)
      .setFlipX(p.face < 0)
      .setDepth(p.r * 100 + p.y * 0.01 + 0.005);
    if (p.invuln > 0) {
      this.cues.lineStyle(2, 0xfaf0c3, 0.8);
      this.cues.strokeCircle(p.x + P.arenaX, p.y + P.arenaY, p.r + 5);
    }
  }
  private cue(e: Entity, rel: string, near: number) {
    const color =
      rel === "danger"
        ? 0xff725c
        : rel === "food"
          ? 0xffdc80
          : rel === "spiky"
            ? 0xbdc6dc
            : 0xe5f1d6;
    this.cues.lineStyle(rel === "danger" ? 2.5 : 1.5, color, 0.3 + near * 0.6);
    this.cues.strokeCircle(e.x + P.arenaX, e.y + P.arenaY, e.r + 5);
    if (rel === "danger") {
      this.cues.fillStyle(color, 0.9);
      this.cues.fillTriangle(
        e.x + P.arenaX - 3,
        e.y + P.arenaY - e.r - 9,
        e.x + P.arenaX + 3,
        e.y + P.arenaY - e.r - 9,
        e.x + P.arenaX,
        e.y + P.arenaY - e.r - 15,
      );
    }
  }
  private drawHud() {
    const s = this.sim,
      p = s.player;
    const key = [s.score, s.hearts, p.tier, s.wave, Math.ceil(s.timeLeft)].join(
      "/",
    );
    this.bar.width = 366 * s.bellyFraction;
    if (key === this.lastHud) return;
    this.lastHud = key;
    this.heartLabel.setText("♥".repeat(s.hearts) + "♡".repeat(3 - s.hearts));
    this.scoreLabel.setText(s.score.toLocaleString());
    const seconds = Math.ceil(s.timeLeft);
    this.timeLabel
      .setText(
        s.level
          ? Math.floor(seconds / 60) +
              ":" +
              String(seconds % 60).padStart(2, "0")
          : "FEAST",
      )
      .setColor(seconds < 20 && s.level ? "#ffd48d" : "#d9e5c1");
    this.stageLabel.setText(
      STAGE_NAME[p.tier] +
        "  →  " +
        (s.level
          ? STAGE_NAME[s.maxTier] +
            (s.level.beast && !s.beastEaten
              ? " · catch " + s.level.beast.name
              : "")
          : "Wave " + (s.wave + 1)),
    );
  }
  private feedback(e: GameEvent) {
    const audio = this.registry.get("audio") as Audio;
    if (e.type === "end") {
      if (e.result.win) audio.play("win");
      this.time.delayedCall(600, () =>
        window.dispatchEvent(new CustomEvent("rex-end", { detail: e.result })),
      );
      return;
    }
    audio.play(e.type, this.sim.player.tier);
    if (e.type === "grow") {
      this.banner(STAGE_NAME[e.tier!] + "!");
      this.announce("Grew to " + STAGE_NAME[e.tier!]);
      if (!this.reduced) {
        this.cameras.main.shake(140, 0.003);
        this.tweens.add({
          targets: this.rex,
          scaleX: 1.2 / P.atlasResolution,
          scaleY: 1.2 / P.atlasResolution,
          duration: 180,
          yoyo: true,
          ease: "Back.easeOut",
        });
      }
    }
    if (e.type === "hurt" && !this.reduced) this.cameras.main.shake(180, 0.005);
    if (e.type === "wave")
      this.banner("A wilder feast · wave " + (this.sim.wave + 1));
    if (e.type === "nope") this.float(e.x, e.y, "Too spiky!", "#dce3f0");
    if (e.type === "shrink") this.banner("Hungry… keep eating");
    if (e.type === "eat") {
      if (!this.reduced) {
        this.tweens.killTweensOf(this.rex);
        this.tweens.add({
          targets: this.rex,
          scaleX: 1.14 / P.atlasResolution,
          scaleY: 0.91 / P.atlasResolution,
          angle: this.sim.player.face * 4,
          duration: 85,
          yoyo: true,
          onComplete: () =>
            this.rex.setScale(1 / P.atlasResolution).setAngle(0),
        });
      }
      if (e.beast) this.banner(e.name + " caught!");
      else if (e.sp?.kind !== "plant")
        this.float(e.x, e.y, "+" + e.value, "#ffe29a");
    }
    if (!this.reduced)
      this.burst(
        e.x,
        e.y,
        e.type === "hurt" ? 0xffab91 : e.type === "grow" ? 0xffdc80 : 0xf7efd2,
        e.type === "grow" ? 18 : 6,
      );
  }
  private burst(x: number, y: number, color: number, count: number) {
    this.particles.setParticleTint(color);
    this.particles.explode(count, x + P.arenaX, y + P.arenaY);
  }
  private float(x: number, y: number, word: string, color: string) {
    if (this.effects >= P.feedbackLimit) return;
    this.effects++;
    const label = this.add
      .text(x + P.arenaX, y + P.arenaY - 14, word, {
        fontFamily: "Trebuchet MS",
        fontSize: 14,
        fontStyle: "bold",
        color,
        stroke: "#293227",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(8900);
    this.tweens.add({
      targets: label,
      y: label.y - (this.reduced ? 0 : 22),
      alpha: 0,
      duration: 650,
      onComplete: () => {
        label.destroy();
        this.effects--;
      },
    });
  }
  private banner(word: string) {
    const label = this.add
      .text(210, 158, word, {
        fontFamily: "Trebuchet MS",
        fontSize: 20,
        fontStyle: "bold",
        color: "#302d16",
        backgroundColor: "#f7d478",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(10003);
    this.tweens.add({
      targets: label,
      alpha: 0,
      delay: 1500,
      duration: this.reduced ? 0 : 250,
      onComplete: () => label.destroy(),
    });
  }
  private publishState() {
    const stage = document.getElementById("stage")!;
    stage.dataset.state = this.sim.running ? "playing" : "ended";
    stage.dataset.tier = String(this.sim.player.tier);
    stage.dataset.score = String(this.sim.score);
    stage.dataset.hearts = String(this.sim.hearts);
    stage.dataset.entities = String(this.sprites.size);
    stage.dataset.effects = String(this.effects);
  }
}
