import * as Phaser from "phaser";
import { Adventure, idleInput, type Actor } from "../adventure/simulation";
import {
  CREATURES,
  DISCOVERIES,
  GROWTH,
  PASSAGES,
  REGIONS,
  SIZE,
  STAGES,
  TERRAIN,
  byRegion,
  center,
  nest,
  project,
  unproject,
  type Dino,
  type Point,
} from "../adventure/content";
import { AdventureStore, type AdventureSave } from "../adventure/save";
import { Random } from "../game/random";
import type { Audio } from "../platform/audio";
import { groundTexture } from "../art/adventure-ground";
const assetUrls = import.meta.glob("../art/assets/adventure/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export class AdventureScene extends Phaser.Scene {
  sim!: Adventure;
  private profileId = "";
  private saveStore = new AdventureStore();
  private sprites = new Map<number, Phaser.GameObjects.Sprite>();
  private rex!: Phaser.GameObjects.Sprite;
  private cues!: Phaser.GameObjects.Graphics;
  private ground!: Phaser.GameObjects.Graphics;
  private shadows!: Phaser.GameObjects.Graphics;
  private decoration: { sprite: Phaser.GameObjects.Image; ground: Point }[] =
    [];
  private markers = new Map<string, Phaser.GameObjects.Container>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private joystick: Point = { x: 0, y: 0 };
  private pointer: number | null = null;
  private joyStart: Point = { x: 0, y: 0 };
  private accumulator = 0;
  private lastSave = 0;
  private lastHud = "";
  private reduced = false;
  private cleanup: (() => void)[] = [];
  private hud!: HTMLElement;
  private actionInput = {
    bite: false,
    dodge: false,
    skill: false,
    interact: false,
  };
  private toastTimer = 0;
  private feedback: Phaser.GameObjects.Text[] = [];
  constructor() {
    super("Adventure");
  }
  preload() {
    for (const [path, url] of Object.entries(assetUrls)) {
      const key = "adv-" + path.split("/").at(-1)!.replace(".webp", "");
      if (!this.textures.exists(key)) {
        if (/prop/.test(key)) this.load.image(key, url);
        else
          this.load.spritesheet(key, url, {
            frameWidth: 144,
            frameHeight: 144,
          });
      }
    }
  }
  create(data: { profileId: string; save: AdventureSave }) {
    this.profileId = data.profileId;
    this.sim = new Adventure(data.save);
    this.reduced = !!this.registry.get("reducedMotion");
    this.sprites.clear();
    this.markers.clear();
    this.decoration = [];
    this.feedback = [];
    this.cleanup = [];
    this.pointer = null;
    this.joystick = { x: 0, y: 0 };
    this.accumulator = 0;
    this.lastHud = "";
    this.lastSave = 0;
    this.toastTimer = 0;
    this.actionInput = {
      bite: false,
      dodge: false,
      skill: false,
      interact: false,
    };
    this.cameras.main
      .setOrigin(0.5, 0.5)
      .setZoom(1)
      .setBackgroundColor("#244738");
    this.ground = this.add.graphics().setDepth(-100000);
    this.shadows = this.add.graphics().setDepth(-99999);
    this.cues = this.add.graphics().setDepth(90000);
    this.paintWorld();
    this.rex = this.add.sprite(0, 0, "adv-rex-0", 0).setOrigin(0.5, 0.73);
    this.keys = this.input.keyboard!.addKeys(
      "W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L,E,SPACE,ESC,ENTER",
    ) as Record<string, Phaser.Input.Keyboard.Key>;
    const pause = () => this.requestPause();
    this.input.keyboard!.on("keydown-ESC", pause);
    this.cleanup.push(() => this.input.keyboard!.off("keydown-ESC", pause));
    const enterNest = () => {
      if (dist(this.sim.player, nest(byRegion(this.sim.region))) < 100) {
        this.requestPause();
        window.dispatchEvent(new Event("rex-adventure-nest"));
      }
    };
    this.input.keyboard!.on("keydown-ENTER", enterNest);
    this.cleanup.push(() =>
      this.input.keyboard!.off("keydown-ENTER", enterNest),
    );
    this.hud = document.createElement("div");
    this.hud.className = "adventure-overlay";
    this.hud.innerHTML = `<div class="adv-health"><b data-growth-title>Hatchling</b><div data-health aria-label="Health"></div><div class="adv-growth"><i data-growth-bar></i></div><small data-growth-text></small></div><div class="adv-region"><span data-region></span></div><div class="adv-goal"><button data-journal aria-label="Open adventure map">Map &amp; book</button><button data-pause aria-label="Pause adventure">Ⅱ</button><p data-objective></p></div><div class="adv-toast" role="status" aria-live="polite"></div><div class="adv-stick" aria-hidden="true"><i></i></div><div class="adv-actions"><button data-combat="bite" aria-label="Bite"><span>⌁</span><b>Bite</b><small>J</small></button><button data-combat="dodge" aria-label="Dodge"><span>➶</span><b>Dodge</b><small>Space</small></button><button data-combat="skill" aria-label="Species skill"><span>◖</span><b data-skill-name>Roar</b><small>E</small></button></div><button class="adv-interact" data-interact>Rest at nest · Enter</button>`;
    document.getElementById("ui")!.append(this.hud);
    this.hud.querySelector<HTMLButtonElement>("[data-pause]")!.onclick = pause;
    this.hud.querySelector<HTMLButtonElement>("[data-journal]")!.onclick =
      () => {
        this.requestPause();
        window.dispatchEvent(new Event("rex-adventure-journal"));
      };
    this.hud.querySelector<HTMLButtonElement>("[data-interact]")!.onclick =
      () => {
        this.actionInput.interact = true;
        if (dist(this.sim.player, nest(byRegion(this.sim.region))) < 100) {
          this.requestPause();
          window.dispatchEvent(new Event("rex-adventure-nest"));
        }
      };
    for (const b of this.hud.querySelectorAll<HTMLButtonElement>(
      "[data-combat]",
    )) {
      const key = b.dataset.combat as "bite" | "dodge" | "skill";
      const down = (e: PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        this.actionInput[key] = true;
        (this.registry.get("audio") as Audio).unlock();
      };
      const up = () => (this.actionInput[key] = false);
      b.onpointerdown = down;
      b.onpointerup = up;
      b.onpointercancel = up;
      b.onlostpointercapture = up;
    }
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.pointer !== null) return;
      this.pointer = p.id;
      this.joyStart = { x: p.x, y: p.y };
      this.joystick = { x: 0, y: 0 };
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.pointer === p.id && p.isDown) {
        const dx = p.x - this.joyStart.x,
          dy = p.y - this.joyStart.y;
        const len = Math.max(50, Math.hypot(dx, dy));
        const w = unproject({ x: dx / len, y: dy / len });
        const l = Math.max(1, Math.hypot(w.x, w.y));
        this.joystick = { x: w.x / l, y: w.y / l };
        const stick = this.hud.querySelector<HTMLElement>(".adv-stick i")!;
        stick.style.transform = `translate(${(dx / len) * 25}px,${(dy / len) * 25}px)`;
      }
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (this.pointer === p.id) {
        this.pointer = null;
        this.joystick = { x: 0, y: 0 };
        this.hud.querySelector<HTMLElement>(".adv-stick i")!.style.transform =
          "";
      }
    };
    this.input.on("pointerup", release);
    this.input.on("pointerupoutside", release);
    const lost = () => {
      this.pointer = null;
      this.joystick = { x: 0, y: 0 };
      this.actionInput = {
        bite: false,
        dodge: false,
        skill: false,
        interact: false,
      };
    };
    const hidden = () => {
      if (document.hidden) this.requestPause();
    };
    const resize = () => {
      this.scale.setGameSize(innerWidth, innerHeight);
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", pause);
    window.addEventListener("pointercancel", lost);
    window.addEventListener("resize", resize);
    this.cleanup.push(() => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", pause);
      window.removeEventListener("pointercancel", lost);
      window.removeEventListener("resize", resize);
    });
    this.events.once("shutdown", () => {
      this.persist();
      this.hud.remove();
      for (const fn of this.cleanup) fn();
      for (const s of this.feedback) s.destroy();
      this.input.removeAllListeners();
    });
    this.showToast("Follow the creek. Bite small prey · dodge a lunge.");
    this.draw();
    this.updateHud();
  }
  private paintWorld() {
    const g = this.ground,
      random = new Random(197);
    g.clear();
    this.add.rectangle(750, 900, 6500, 5000, 0x365b3b).setDepth(-100002);
    // Forest continues beyond navigable bounds, framing the world without a floating diamond edge.
    for (let x = -450; x < 3150; x += 130)
      for (let y = -450; y < 2250; y += 130) {
        if (x > 0 && x < 2700 && y > 0 && y < 1800) continue;
        const p = {
          x: x + random.range(-40, 40),
          y: y + random.range(-40, 40),
        };
        const q = project(p);
        const sp = this.add
          .image(q.x, q.y, "adv-prop-palm")
          .setDisplaySize(265, 265)
          .setOrigin(0.5, 0.73)
          .setDepth(q.y)
          .setTint(0x9cba88);
        this.decoration.push({ sprite: sp, ground: p });
      }
    for (const r of REGIONS) {
      const groundCenter = project(center(r));
      this.add
        .image(groundCenter.x, groundCenter.y, groundTexture(this, r))
        .setDisplaySize(SIZE * 1.6, SIZE * 0.92)
        .setDepth(-100001);
      // Baked-looking ground dapples; no per-frame canvas uploads or full-world textures.
      for (let i = 0; i < 100; i++) {
        const p = project({
          x: r.x * SIZE + random.range(20, 880),
          y: r.y * SIZE + random.range(20, 880),
        });
        g.fillStyle(i % 2 ? r.edge : 0xe8d7a4, 0.07);
        g.fillEllipse(p.x, p.y, random.range(15, 55), random.range(8, 24));
      }
      const c = project(center(r));
      g.lineStyle(48, r.id === "ember" ? 0x9b7c58 : 0xd7bd83, 0.55);
      const n = project(nest(r));
      g.lineBetween(n.x, n.y, c.x, c.y);
      for (const pass of PASSAGES.filter((p) => p.a === r.id || p.b === r.id)) {
        const other = byRegion(pass.a === r.id ? pass.b : pass.a);
        const mid = project({
          x: (center(r).x + center(other).x) / 2,
          y: (center(r).y + center(other).y) / 2,
        });
        g.lineBetween(c.x, c.y, mid.x, mid.y);
      }
      if (r.id === "river") {
        g.lineStyle(22, 0x69babe, 0.65);
        const a = project({ x: SIZE + 100, y: 50 }),
          b = project({ x: SIZE + 330, y: 350 });
        g.lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(8, 0xb4e5cf, 0.5);
        g.lineBetween(a.x, a.y, b.x, b.y);
      }
      if (r.id === "ember") {
        for (let i = 0; i < 10; i++) {
          const p = project({
            x: r.x * SIZE + 70 + i * 70,
            y: r.y * SIZE + 820,
          });
          g.lineStyle(4, 0xffa345, 0.85);
          g.lineBetween(p.x, p.y, p.x + 30, p.y - 12);
        }
      }
      const ns = project(nest(r));
      const nestSprite = this.add
        .image(ns.x, ns.y, "adv-prop-nest")
        .setDisplaySize(145, 145)
        .setOrigin(0.5, 0.73)
        .setDepth(ns.y);
      this.decoration.push({ sprite: nestSprite, ground: nest(r) });
      const label = this.add
        .text(ns.x, ns.y + 13, "REFUGE", {
          fontFamily: "Trebuchet MS",
          fontSize: "11px",
          color: "#fff0cb",
          backgroundColor: "#163d2d",
          padding: { x: 6, y: 3 },
        })
        .setOrigin(0.5)
        .setDepth(ns.y + 1);
      label.setAlpha(0.8);
      for (const p of TERRAIN.filter((t) => t.region === r.id)) {
        const type = p.kind;
        const pt = project(p);
        g.fillStyle(0x183d2a, 0.12);
        g.fillEllipse(
          pt.x + 12,
          pt.y + 3,
          type === "palm" ? 95 : 55,
          type === "palm" ? 36 : 19,
        );
        const size = type === "palm" ? 230 : type === "fern" ? 135 : 110;
        const sp = this.add
          .image(pt.x, pt.y, "adv-prop-" + type)
          .setDisplaySize(size, size)
          .setOrigin(0.5, 0.73)
          .setDepth(pt.y)
          .setTint(r.id === "ember" ? 0xd0afa0 : 0xffffff);
        this.decoration.push({ sprite: sp, ground: p });
      }
    }
    for (const d of DISCOVERIES) {
      const p = project(d);
      const icon =
        d.kind === "fossil"
          ? "◇"
          : d.kind === "egg"
            ? "◉"
            : d.kind === "tracks"
              ? "⌁"
              : "✦";
      const color = d.kind === "forage" ? "#c4e59a" : "#ffe0a2";
      const circle = this.add
        .circle(0, 0, 13, 0x1c3c30, 0.75)
        .setStrokeStyle(1, 0xd8b16d, 0.7);
      const txt = this.add
        .text(0, 0, icon, { fontSize: "21px", color })
        .setOrigin(0.5);
      const mark = this.add
        .container(p.x, p.y, [circle, txt])
        .setDepth(p.y + 25);
      this.markers.set(d.id, mark);
    }
    // The underground loop is shown as a physical pair of cave mouths.
    for (const p of [
      { x: 750, y: 1650 },
      { x: 1990, y: 1610 },
    ]) {
      const q = project(p);
      this.add
        .ellipse(q.x, q.y - 12, 58, 38, 0x172722)
        .setStrokeStyle(7, 0x717773)
        .setDepth(q.y);
      this.add
        .text(q.x, q.y + 13, "ECHO PASSAGE", {
          fontSize: "10px",
          color: "#eee4c9",
        })
        .setOrigin(0.5)
        .setDepth(q.y + 1);
    }
  }
  update(_time: number, delta: number) {
    if (!this.sim) return;
    const dt = Math.min(delta / 1000, 0.1);
    this.accumulator += dt;
    let n = 0;
    const screen = {
      x:
        Number(this.keys.D.isDown || this.keys.RIGHT.isDown) -
        Number(this.keys.A.isDown || this.keys.LEFT.isDown),
      y:
        Number(this.keys.S.isDown || this.keys.DOWN.isDown) -
        Number(this.keys.W.isDown || this.keys.UP.isDown),
    };
    const keyboard = unproject(screen);
    const len = Math.max(1, Math.hypot(keyboard.x, keyboard.y));
    const input = idleInput();
    input.move =
      this.pointer !== null
        ? this.joystick
        : { x: keyboard.x / len, y: keyboard.y / len };
    input.bite = this.actionInput.bite || this.keys.J.isDown;
    input.dodge =
      this.actionInput.dodge || this.keys.SPACE.isDown || this.keys.K.isDown;
    input.skill =
      this.actionInput.skill || this.keys.E.isDown || this.keys.L.isDown;
    input.interact =
      this.actionInput.interact ||
      Phaser.Input.Keyboard.JustDown(this.keys.ENTER);
    while (this.accumulator >= 1 / 60 && n++ < 6) {
      this.sim.update(1 / 60, input);
      input.interact = false;
      this.accumulator -= 1 / 60;
    }
    this.actionInput.interact = false;
    this.toastTimer = Math.max(0, this.toastTimer - dt);
    if (this.toastTimer === 0)
      this.hud
        .querySelector<HTMLElement>(".adv-toast")!
        .classList.remove("visible");
    for (const event of this.sim.events.splice(0)) {
      const audio = this.registry.get("audio") as Audio;
      audio.play(
        event.type === "discovery" ? "grow" : event.type,
        this.sim.tier + 1,
      );
      if (event.text) this.showToast(event.text);
      if (event.type === "hurt" && !this.reduced)
        this.cameras.main.shake(90, 0.003);
      if (
        ["grow", "victory", "discovery", "nest", "gate", "defeat"].includes(
          event.type,
        )
      )
        this.persist();
      if (
        event.type === "eat" ||
        event.type === "bite" ||
        event.type === "hurt"
      ) {
        const p = project(event);
        if (this.feedback.length < 12) {
          const t = this.add
            .text(
              p.x,
              p.y - 35,
              event.type === "eat"
                ? `+${event.reward ?? "health"}`
                : event.type === "hurt"
                  ? "!"
                  : "✦",
              {
                fontSize: "19px",
                color: event.type === "hurt" ? "#ffab8e" : "#ffdf94",
                fontStyle: "bold",
              },
            )
            .setDepth(100000);
          this.feedback.push(t);
          this.tweens.add({
            targets: t,
            y: t.y - (this.reduced ? 0 : 35),
            alpha: 0,
            duration: 550,
            onComplete: () => {
              this.feedback = this.feedback.filter((x) => x !== t);
              t.destroy();
            },
          });
        }
      }
    }
    if (this.sim.time - this.lastSave > 8) this.persist();
    this.draw();
    this.updateHud();
  }
  private draw() {
    const sim = this.sim,
      p = project(sim.player),
      cam = this.cameras.main;
    cam.centerOn(p.x, p.y + 30);
    this.shadows.clear();
    this.cues.clear();
    const visible = new Set<number>();
    for (const a of sim.actors) {
      if (a.state === "dead" || dist(a, sim.player) > 700) continue;
      visible.add(a.id);
      const point = project(a);
      let sprite = this.sprites.get(a.id);
      if (!sprite) {
        sprite = this.add
          .sprite(
            point.x,
            point.y,
            a.spec.model === "bug"
              ? "animal-" + (a.spec.id === "dragonfly" ? "dragonfly" : "beetle")
              : "adv-" + a.spec.model,
          )
          .setOrigin(0.5, 0.73);
        this.sprites.set(a.id, sprite);
      }
      const size =
        a.spec.model === "bug"
          ? 31
          : [55, 77, 103, 138][a.spec.tier] * (a.rival ? 1.15 : 1);
      sprite
        .setPosition(point.x, point.y)
        .setDisplaySize(size, size)
        .setDepth(point.y)
        .setTint(a.spec.tint);
      if (a.spec.model !== "bug") {
        const direction = (Math.round(a.face / (Math.PI / 4)) + 8) % 8;
        const pose =
          a.state === "tell"
            ? 6
            : a.state === "attack"
              ? 4
              : a.state === "recover"
                ? 5
                : 1 + (Math.floor(sim.time * 8) % 3);
        sprite.setFrame(pose * 8 + direction);
      }
      this.shadows.fillStyle(0x163022, 0.22);
      this.shadows.fillEllipse(point.x, point.y + 1, size * 0.6, size * 0.22);
      const danger = a.spec.tier >= sim.tier && a.spec.pattern !== "prey";
      this.cues.lineStyle(1, danger ? 0xff977d : 0xf3dc85, 0.75);
      this.cues.strokeEllipse(point.x, point.y + 3, size * 0.68, size * 0.25);
      if (a.state === "tell" || a.state === "attack") {
        const reach = a.spec.pattern === "sweep" ? 145 : 185;
        const spread = a.spec.pattern === "sweep" ? 1.5 : 0.25;
        const shape = [
          a,
          ...Array.from({ length: 13 }, (_, i) => {
            const angle = a.intent - spread + (i / 12) * spread * 2;
            return {
              x: a.x + Math.cos(angle) * reach,
              y: a.y + Math.sin(angle) * reach,
            };
          }),
        ].map(project);
        this.cues.fillStyle(0xff6650, a.state === "tell" ? 0.22 : 0.38);
        this.cues.fillPoints(
          shape.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
          true,
        );
        this.cues.lineStyle(2, 0xffbaa0, 0.9);
        this.cues.strokePoints(
          shape.map((p) => new Phaser.Math.Vector2(p.x, p.y)),
          true,
        );
      }
      if (a.rival) {
        this.cues.fillStyle(0x142c24, 0.9);
        this.cues.fillRect(point.x - 35, point.y - size * 0.7, 70, 5);
        this.cues.fillStyle(0xffa187);
        this.cues.fillRect(
          point.x - 35,
          point.y - size * 0.7,
          70 * Math.max(0, a.hp / (a.spec.hp * 1.6)),
          5,
        );
      }
    }
    for (const [id, s] of this.sprites)
      if (!visible.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
    const key =
      "adv-" +
      (sim.dino === "rex"
        ? "rex-" + sim.tier
        : sim.dino === "raptor"
          ? "raptor-2"
          : "trike-2");
    const dir = (Math.round(sim.player.face / (Math.PI / 4)) + 8) % 8;
    const pose =
      sim.player.pose === "bite"
        ? sim.player.action > 0.16
          ? 4
          : 5
        : sim.player.pose === "skill"
          ? 6
          : sim.player.pose === "dodge"
            ? 7
            : sim.moving
              ? 1 + (Math.floor(sim.time * 10) % 3)
              : 0;
    const sz =
      [100, 120, 146, 175][sim.tier] * (sim.dino === "raptor" ? 0.88 : 1);
    this.rex
      .setTexture(key, pose * 8 + dir)
      .setPosition(p.x, p.y)
      .setDisplaySize(sz, sz)
      .setDepth(p.y)
      .setTint(sim.player.invuln > 0 ? 0xdbeed9 : 0xffffff);
    this.shadows.fillStyle(0x102e23, 0.32);
    this.shadows.fillEllipse(p.x, p.y + 1, sz * 0.62, sz * 0.21);
    this.cues.lineStyle(2, 0xfff1c5, 0.85);
    this.cues.strokeEllipse(p.x, p.y + 2, sz * 0.7, sz * 0.24);
    for (const d of this.decoration) {
      const point = project(d.ground);
      d.sprite.setVisible(
        Math.abs(point.x - p.x) < cam.width / 2 + 160 &&
          Math.abs(point.y - p.y) < cam.height / 2 + 160,
      );
      const occludes =
        d.sprite.y > p.y &&
        Math.abs(d.sprite.x - p.x) < 65 &&
        d.sprite.y - p.y < 95;
      const hidesThreat = sim.actors.some((a) => {
        if (a.state !== "tell" && a.state !== "attack") return false;
        const q = project(a);
        return (
          d.sprite.y > q.y &&
          Math.abs(d.sprite.x - q.x) < 65 &&
          d.sprite.y - q.y < 95
        );
      });
      d.sprite.setAlpha(occludes || hidesThreat ? 0.25 : 1);
    }
    for (const d of DISCOVERIES) {
      const m = this.markers.get(d.id)!;
      m.setVisible(
        (d.kind === "forage" || !sim.save.discoveries.includes(d.id)) &&
          d.tier <= sim.tier &&
          dist(d, sim.player) < 650,
      );
    }
  }
  private updateHud() {
    const s = this.sim;
    const sig = JSON.stringify([
      s.region,
      s.tier,
      Math.ceil(s.player.hp),
      s.save.xp[s.dino],
      s.objective,
      s.dino,
    ]);
    if (sig !== this.lastHud) {
      this.lastHud = sig;
      this.hud.querySelector("[data-growth-title]")!.textContent =
        STAGES[s.tier] +
        " " +
        (s.dino === "trike"
          ? "Triceratops"
          : s.dino === "raptor"
            ? "Raptor"
            : "Rex");
      this.hud.querySelector("[data-health]")!.textContent = Array.from(
        { length: 3 },
        (_, i) => (i < Math.ceil(s.player.hp) ? "♥" : "♡"),
      ).join(" ");
      this.hud
        .querySelector("[data-health]")!
        .setAttribute("aria-label", `${s.player.hp.toFixed(1)} of 3 health`);
      const xp = s.save.xp[s.dino];
      const next = GROWTH[s.tier + 1];
      this.hud.querySelector<HTMLElement>("[data-growth-bar]")!.style.width =
        next
          ? `${Math.min(100, ((xp - GROWTH[s.tier]) / (next - GROWTH[s.tier])) * 100)}%`
          : "100%";
      this.hud.querySelector("[data-growth-text]")!.textContent = next
        ? `${xp} / ${next} growth`
        : "Growth complete";
      this.hud.querySelector("[data-region]")!.textContent = byRegion(
        s.region,
      ).name;
      this.hud.querySelector("[data-objective]")!.textContent = s.objective;
      this.hud.querySelector("[data-skill-name]")!.textContent =
        s.dino === "rex"
          ? s.tier === 0
            ? "Locked"
            : "Roar"
          : s.dino === "raptor"
            ? "Pounce"
            : "Charge";
    }
    for (const [key, value] of [
      ["bite", s.biteCooldown],
      ["dodge", s.dodgeCooldown],
      ["skill", s.skillCooldown],
    ] as const) {
      const b = this.hud.querySelector<HTMLButtonElement>(
        `[data-combat="${key}"]`,
      )!;
      b.style.setProperty("--cooldown", String(value));
      b.classList.toggle("cooling", value > 0.05);
      b.classList.toggle(
        "locked",
        key === "skill" && s.tier === 0 && s.dino === "rex",
      );
    }
    const rest = dist(s.player, nest(byRegion(s.region))) < 90;
    const tunnel =
      dist(s.player, { x: 750, y: 1650 }) < 90 ||
      dist(s.player, { x: 1990, y: 1610 }) < 90;
    const interact = this.hud.querySelector<HTMLElement>("[data-interact]")!;
    interact.style.display = rest || tunnel ? "block" : "none";
    interact.textContent = rest
      ? "Rest at nest · Enter"
      : s.tier >= 2
        ? "Enter echo passage · Enter"
        : "Hunter growth opens this passage";
  }
  showToast(text: string) {
    const el = this.hud.querySelector<HTMLElement>(".adv-toast")!;
    el.textContent = text;
    el.classList.add("visible");
    this.toastTimer = 4;
  }
  persist() {
    if (!this.sim) return;
    const data = this.saveStore.write(this.profileId, this.sim.checkpoint());
    this.sim.save = data;
    this.lastSave = this.sim.time;
    window.dispatchEvent(
      new CustomEvent("rex-adventure-save", {
        detail: { id: this.profileId, save: data },
      }),
    );
  }
  requestPause() {
    if (this.scene.isPaused()) return;
    this.joystick = { x: 0, y: 0 };
    this.pointer = null;
    this.actionInput = {
      bite: false,
      dodge: false,
      skill: false,
      interact: false,
    };
    this.input.keyboard?.resetKeys();
    this.persist();
    this.scene.pause();
    window.dispatchEvent(new Event("rex-adventure-pause"));
  }
  resumeAdventure() {
    this.input.keyboard?.resetKeys();
    this.scene.resume();
  }
  diagnostics() {
    return {
      tier: this.sim.tier,
      dino: this.sim.dino,
      region: this.sim.region,
      hp: this.sim.player.hp,
      xp: this.sim.save.xp[this.sim.dino],
      position: { x: this.sim.player.x, y: this.sim.player.y },
      actors: this.sim.actors.filter((a) => a.state !== "dead").length,
      sprites: this.sprites.size,
      particles: this.feedback.length,
      objective: this.sim.objective,
      save: JSON.parse(JSON.stringify(this.sim.save)),
      textures: this.textures.getTextureKeys().length,
    };
  }
}
