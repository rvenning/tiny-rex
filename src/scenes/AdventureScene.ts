import * as Phaser from "phaser";
import { Adventure, idleInput, type Actor, type AdventureEvent } from "../adventure/sim";
import { DINOS, DISCOVERIES, GATES, PORTALS, REGIONS, byRegion, type Point } from "../adventure/data";
import { AdventureStore, type AdventureSave } from "../adventure/save";
import type { Audio } from "../platform/audio";
import { Hud, type ActionKey, type MapMarker } from "../ui/hud";
import { proj, screenDirToGround } from "../world/projection";
import type { World } from "../world/world";
import { ActorView } from "./adventure/actor-view";
import { hasCreature, loadCreature, loadProps, unloadCreature } from "./adventure/assets";
import { Fx, makeTextures } from "./adventure/fx";
import { Ambient } from "./adventure/ambient";
import { GroundLayer, PropLayer } from "./adventure/world-view";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const MAP_COLORS: Record<string, string> = {
  grass: "#6c9a3f",
  dirt: "#c5925a",
  moss: "#3b6a35",
  rock: "#8f8a80",
  mud: "#6d5438",
  gravel: "#aaa28d",
  sand: "#d8bf86",
  basalt: "#4b4650",
  lava: "#ff7a2a",
  ash: "#77736f",
  forest: "#1e3a28",
  shallow: "#58c6c4",
  deep: "#2f93a6",
};
/** creature id (sim) -> atlas id (art) */
const atlasFor = (a: Actor) => a.spec.sprite;

export class AdventureScene extends Phaser.Scene {
  sim!: Adventure;
  private world!: World;
  private profileId = "";
  private saveStore = new AdventureStore();
  private hud!: Hud;
  private ground!: GroundLayer;
  private props!: PropLayer;
  private fx!: Fx;
  private ambient?: Ambient;
  private cues!: Phaser.GameObjects.Graphics;
  private views = new Map<number, ActorView>();
  private icons = new Map<number, Phaser.GameObjects.Image>();
  private player?: ActorView;
  private playerAtlas = "";
  private markers = new Map<string, Phaser.GameObjects.Image>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { x: 0, y: 0, mag: 0 };
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private held: Record<ActionKey, boolean> = { bite: false, dodge: false, skill: false };
  private interactQueued = false;
  private accumulator = 0;
  private lastSave = 0;
  private reduced = false;
  private ready = false;
  private cleanup: (() => void)[] = [];
  private hitStop = 0;
  private camTarget = new Phaser.Math.Vector2();
  private lookahead = new Phaser.Math.Vector2();
  private zoomBase = 1;
  private zoomPulse = 0;
  private mapTimer = 0;
  private loadingEl?: HTMLElement;
  private floaters: Phaser.GameObjects.Text[] = [];
  private flashEl?: HTMLElement;
  private lastTier = -1;
  private lastDino = "";
  private shown = new Set<number>();
  private creatureStreamTimer = 0;
  private clearedProps = new Set<string>();
  private celebratedCatch = false;
  constructor() {
    super("Adventure");
  }
  create(data: { profileId: string; save: AdventureSave; world: World }) {
    this.profileId = data.profileId;
    this.world = data.world;
    this.sim = new Adventure(this.world, data.save);
    this.reduced = !!this.registry.get("reducedMotion");
    this.ready = false;
    this.views.clear();
    this.icons.clear();
    this.markers.clear();
    this.floaters = [];
    this.cleanup = [];
    this.stickPointer = null;
    this.stick = { x: 0, y: 0, mag: 0 };
    this.held = { bite: false, dodge: false, skill: false };
    this.accumulator = 0;
    this.lastSave = 0;
    this.hitStop = 0;
    this.lastTier = -1;
    this.lastDino = "";
    this.creatureStreamTimer = 0;
    this.clearedProps.clear();
    this.celebratedCatch = false;
    this.cameras.main.setBackgroundColor("#1b3322").setRoundPixels(false);
    makeTextures(this);
    this.fx = new Fx(this);
    this.fx.budget = this.reduced ? 70 : 170;
    this.cues = this.add.graphics().setDepth(-9e5);
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L,E,SPACE,ESC,ENTER,SHIFT") as Record<string, Phaser.Input.Keyboard.Key>;
    const touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.hud = new Hud(
      document.getElementById("ui")!,
      {
        press: (k, down) => {
          this.held[k] = down;
          if (down) (this.registry.get("audio") as Audio).unlock();
        },
        pause: () => this.requestPause(),
        journal: () => {
          this.requestPause();
          window.dispatchEvent(new Event("rex-adventure-journal"));
        },
        interact: () => this.interactNow(),
      },
      touch,
    );
    this.flashEl = document.createElement("div");
    this.flashEl.className = "hud-flash";
    this.hud.root.append(this.flashEl);
    this.hud.buildMap(this.world.grid, MAP_COLORS);
    this.loadingEl = document.createElement("div");
    this.loadingEl.className = "adventure-loading";
    this.loadingEl.innerHTML = "<p>Waking the valley…</p>";
    document.getElementById("ui")!.append(this.loadingEl);
    this.bindInput();
    this.events.once("shutdown", () => this.teardown());
    void this.boot();
  }
  private async boot() {
    const ids = new Set<string>(this.sim.actors.filter(a => dist(a, this.sim.player) < 34).map(atlasFor));
    const first = this.playerAtlasId();
    ids.add(first);
    await Promise.all([loadProps(this), ...[...ids].map((id) => loadCreature(this, id))]);
    if (!this.sys.isActive()) return;
    this.ground = new GroundLayer(this, this.world);
    this.props = new PropLayer(this, this.world);
    this.ambient = new Ambient(this, this.fx, this.world.grid, this.reduced);
    for (const d of DISCOVERIES) {
      const m = this.add.image(0, 0, "icon-find").setScale(0.5).setVisible(false);
      this.markers.set(d.id, m);
    }
    this.layoutCamera();
    this.snapCamera();
    this.cameras.main.preRender();
    this.ground.update(this.cameras.main.worldView, true);
    await new Promise<void>((r) => {
      if (this.load.isLoading()) this.load.once(Phaser.Loader.Events.COMPLETE, () => r());
      else r();
    });
    this.loadingEl?.remove();
    this.ready = true;
    this.startAmbience();
    this.hud.toast(this.hud.root.classList.contains("touch") ? "Stalk a beetle · move the stick gently to creep" : "Stalk a beetle · hold Shift to creep, J to bite", "hint");
  }
  private playerAtlasId() {
    const d = this.sim.dino;
    return d === "rex" ? `rex_${this.sim.tier}` : DINOS[d].atlas;
  }
  // ---------------------------------------------------------------- input
  private bindInput() {
    const pause = () => this.requestPause();
    this.input.keyboard!.on("keydown-ESC", pause);
    const enter = () => this.interactNow();
    this.input.keyboard!.on("keydown-ENTER", enter);
    this.cleanup.push(() => {
      this.input.keyboard?.off("keydown-ESC", pause);
      this.input.keyboard?.off("keydown-ENTER", enter);
    });
    const down = (p: Phaser.Input.Pointer) => {
      const e = p.event as PointerEvent;
      const cx = p.x * innerWidth / this.scale.width,
        cy = p.y * innerHeight / this.scale.height;
      if (this.stickPointer !== null || cx > innerWidth * 0.55 || !this.ready) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.stickPointer = p.id;
      this.stickOrigin = { x: cx, y: cy };
      this.stick = { x: 0, y: 0, mag: 0 };
      this.hud.stick(0, 0, true, cx, cy);
    };
    const move = (p: Phaser.Input.Pointer) => {
      if (this.stickPointer !== p.id) return;
      const dx = p.x * innerWidth / this.scale.width - this.stickOrigin.x,
        dy = p.y * innerHeight / this.scale.height - this.stickOrigin.y;
      const len = Math.hypot(dx, dy),
        max = 62;
      if (len < 8) {
        this.stick = { x: 0, y: 0, mag: 0 };
        this.hud.stick(0, 0, true);
        return;
      }
      // dragging far from the origin drags the origin along, so the thumb never runs out of room
      if (len > max * 1.6) {
        const k = (len - max * 1.6) / len;
        this.stickOrigin.x += dx * k;
        this.stickOrigin.y += dy * k;
      }
      const m = Math.min(1, len / max);
      const g = screenDirToGround(dx / len, dy / len);
      // partial deflection = creeping (stalking prey), full = running
      this.stick = { x: g.x, y: g.y, mag: m < 0.55 ? m * 0.65 : 0.36 + (m - 0.55) * (0.64 / 0.45) };
      this.hud.stick((dx / len) * Math.min(1, len / max), (dy / len) * Math.min(1, len / max), true, this.stickOrigin.x, this.stickOrigin.y);
    };
    const up = (p: Phaser.Input.Pointer) => {
      if (this.stickPointer !== p.id) return;
      this.stickPointer = null;
      this.stick = { x: 0, y: 0, mag: 0 };
      this.hud.stick(0, 0, false);
    };
    this.input.on("pointerdown", down);
    this.input.on("pointermove", move);
    this.input.on("pointerup", up);
    this.input.on("pointerupoutside", up);
    const lost = () => {
      this.stickPointer = null;
      this.stick = { x: 0, y: 0, mag: 0 };
      this.held = { bite: false, dodge: false, skill: false };
      this.hud.stick(0, 0, false);
    };
    const hidden = () => {
      if (document.hidden) this.requestPause();
    };
    const resize = () => this.layoutCamera();
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
  }
  private startAmbience() {
    const audio = this.registry.get("audio") as Audio;
    audio.startAmbience(() => {
      const p = this.sim.player;
      let wet = 0;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (this.world.grid.inWater(p.x + Math.cos(a) * 7, p.y + Math.sin(a) * 7)) wet++;
      }
      return { water: Math.min(1, wet / 4) };
    });
  }
  private teardown() {
    (this.registry.get("audio") as Audio)?.stopAmbience();
    this.persist();
    for (const fn of this.cleanup) fn();
    this.hud?.destroy();
    this.loadingEl?.remove();
    this.ground?.destroy();
    this.props?.destroy();
    this.ambient?.destroy();
    this.ambient = undefined;
    this.fx?.destroy();
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.player?.destroy();
    this.player = undefined;
    for (const t of this.floaters) t.destroy();
    this.input.removeAllListeners();
  }
  private interactNow() {
    if (!this.ready) return;
    if (this.sim.interact()) {
      this.requestPause();
      window.dispatchEvent(new Event("rex-adventure-nest"));
    }
  }
  // ---------------------------------------------------------------- camera
  private layoutCamera() {
    const cam = this.cameras.main;
    const w = innerWidth,
      h = innerHeight;
    const dpr = Math.max(1, this.scale.width / w);
    const portrait = h > w * 1.1;
    // how many world units of the ground diagonal we want in view at the smallest stage
    const spanR = portrait ? 17 : 24,
      spanD = portrait ? 34 : 30;
    const css = Math.min(w / (spanR * 56.57), h / (spanD * 32.66));
    this.zoomBase = Math.max(0.5, Math.min(1.5, css)) * dpr;
    cam.setSize(this.scale.width, this.scale.height);
  }
  private stageZoom() {
    return [1.35, 1.2, 1.05, 0.92][this.sim.tier];
  }
  private snapCamera() {
    const p = this.sim.player;
    const g = proj(p.x, p.y, this.world.grid.height(p.x, p.y));
    this.camTarget.set(g.x, g.y - 20);
    this.cameras.main.setZoom(this.zoomBase * this.stageZoom());
    this.cameras.main.centerOn(this.camTarget.x, this.camTarget.y);
  }
  private updateCamera(dt: number) {
    const cam = this.cameras.main,
      p = this.sim.player;
    const g = proj(p.x, p.y, this.world.grid.height(p.x, p.y));
    // look a little way ahead of where Rex is going
    const ahead = proj(Math.cos(p.face) * 1.6, Math.sin(p.face) * 1.6);
    const o = proj(0, 0);
    const want = p.speedNow > 0.5 ? { x: ahead.x - o.x, y: ahead.y - o.y } : { x: 0, y: 0 };
    this.lookahead.x += (want.x - this.lookahead.x) * Math.min(1, dt * 2.2);
    this.lookahead.y += (want.y - this.lookahead.y) * Math.min(1, dt * 2.2);
    const tx = g.x + this.lookahead.x,
      ty = g.y - 20 + this.lookahead.y;
    const k = 1 - Math.pow(0.0015, dt);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.y += (ty - this.camTarget.y) * k;
    this.zoomPulse = Math.max(0, this.zoomPulse - dt * 1.4);
    cam.setZoom(this.zoomBase * this.stageZoom() * (1 + 0.035 * Math.sin(this.zoomPulse * Math.PI)) );
    cam.centerOn(this.camTarget.x, this.camTarget.y);
  }
  private toCss(wx: number, wy: number) {
    const v = this.cameras.main.worldView;
    return { x: ((wx - v.x) / v.width) * innerWidth, y: ((wy - v.y) / v.height) * innerHeight };
  }
  // ---------------------------------------------------------------- frame
  update(_time: number, delta: number) {
    if (!this.sim || !this.ready) return;
    const dt = Math.min(delta / 1000, 0.1);
    this.accumulator += dt;
    const input = idleInput();
    const kx = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    const ky = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (this.stickPointer !== null && this.stick.mag > 0) {
      input.move = { x: this.stick.x * this.stick.mag, y: this.stick.y * this.stick.mag };
    } else if (kx || ky) {
      const g = screenDirToGround(kx, ky);
      // Holding Shift creeps for stalking; otherwise run.
      const creep = this.keys.SHIFT.isDown ? 0.4 : 1;
      input.move = { x: g.x * creep, y: g.y * creep };
    }
    input.bite = this.held.bite || this.keys.J.isDown;
    input.dodge = this.held.dodge || this.keys.SPACE.isDown || this.keys.K.isDown;
    input.skill = this.held.skill || this.keys.E.isDown || this.keys.L.isDown;
    let steps = 0;
    while (this.accumulator >= 1 / 60 && steps++ < 6) {
      if (this.hitStop > 0) {
        this.hitStop -= 1 / 60;
        this.accumulator -= 1 / 60;
        continue;
      }
      this.sim.update(1 / 60, input);
      this.accumulator -= 1 / 60;
    }
    for (const e of this.sim.events.splice(0)) this.onEvent(e);
    if (this.sim.time - this.lastSave > 8) this.persist();
    if (this.sim.tier !== this.lastTier || this.sim.dino !== this.lastDino) this.onTier();
    this.updateCamera(dt);
    const view = this.cameras.main.worldView;
    this.ground.update(view);
    this.props.update(view);
    this.animateWorld(dt, view);
    this.draw(dt);
    this.streamCreatures(dt);
    this.fx.update(dt);
    this.updateHud(dt);
    this.updateFloaters(dt);
  }
  private animateWorld(dt: number, view: Phaser.Geom.Rectangle) {
    const sim = this.sim;
    const movers = [{ x: sim.player.x, y: sim.player.y, r: sim.radius }];
    const wading = [{ x: sim.player.x, y: sim.player.y, r: sim.radius }];
    for (const a of sim.actors) {
      if (a.state === "dead" || dist(a, sim.player) > 18) continue;
      if (a.spec.role !== "prey" || a.speedNow > 0.4) movers.push({ x: a.x, y: a.y, r: a.spec.r });
      if (a.speedNow > 0.4) wading.push({ x: a.x, y: a.y, r: a.spec.r });
    }
    this.props.sway(sim.time, dt, this.ambient?.wind ?? 0.2, movers);
    this.ambient?.update(dt, view, this.cameras.main.zoom, sim.player.speedNow > 0.4 ? wading : wading.slice(1));
  }
  private async onTier() {
    const first = this.lastTier < 0;
    this.lastTier = this.sim.tier;
    this.lastDino = this.sim.dino;
    const id = this.playerAtlasId();
    const ok = await loadCreature(this, id);
    if (ok || first) this.swapPlayer(id);
  }
  private streamCreatures(dt: number) {
    this.creatureStreamTimer -= dt;
    if (this.creatureStreamTimer > 0) return;
    this.creatureStreamTimer = 0.8;
    for (const gate of GATES) {
      if (!gate.prop || !this.sim.save.gates.includes(gate.id) || this.clearedProps.has(gate.id)) continue;
      this.props.clearObstruction(gate.prop, gate.x, gate.y);
      this.clearedProps.add(gate.id);
    }
    const nearby = new Set(this.sim.actors.filter(a => a.state !== "dead" && dist(a, this.sim.player) < 52).map(atlasFor));
    nearby.add(this.playerAtlasId());
    for (const id of nearby) void loadCreature(this, id);
    const active = new Set([...this.views.values()].map(v => v.atlasId));
    active.add(this.playerAtlas);
    for (const id of new Set(this.sim.actors.map(atlasFor))) {
      if (!nearby.has(id) && !active.has(id) && hasCreature(this, id)) unloadCreature(this, id);
    }
  }
  private swapPlayer(id: string) {
    const previous = this.playerAtlas;
    this.player?.destroy();
    this.playerAtlas = id;
    const st = this.sim.stats;
    this.player = new ActorView(this, id, DINOS[this.sim.dino].stages[this.sim.tier].sprite, st.r, 0xcfe7b0);
    if (previous && previous !== id && !this.sim.actors.some((a) => atlasFor(a) === previous)) unloadCreature(this, previous);
  }
  private poseFor(a: Actor): string {
    switch (a.state) {
      case "windup":
        return "windup";
      case "strike":
          return "bite";
      case "flee":
        return "run";
      case "stagger":
        return "idle";
        case "recover":
          return "recover";
      default:
        return a.speedNow > 0.4 ? "run" : a.spec.id === "dragonfly" ? "hover" : "idle";
    }
  }
  private draw(dt: number) {
    const sim = this.sim,
      p = sim.player;
    const g = this.world.grid;
    const cues = this.cues;
    cues.clear();
    // --- player
    if (!this.player) this.swapPlayer(this.playerAtlasId());
    const pv = this.player!;
    let pose = p.pose as string;
    let prog: number | undefined;
    if (pose === "bite" || pose === "skill" || pose === "dodge" || pose === "hurt") prog = 1 - p.action / Math.max(0.001, p.actionLen);
    if (pose === "skill" && sim.dino === "rex") pose = "skill";
    const pz = g.height(p.x, p.y);
    pv.update(dt, p.x, p.y, pz, p.face, pose, prog, 0, p.invuln > 0 && p.pose !== "dodge" ? 0.6 + 0.4 * Math.abs(Math.sin(sim.time * 24)) : 1);
    // ground ring under the player (white, like the mockups)
    const ring = proj(p.x, p.y, pz);
    cues.lineStyle(2.5, 0xfff4d6, 0.85);
    this.ellipseOnGround(cues, p.x, p.y, sim.radius * 1.15, pz);
    // --- creatures
    const seen = new Set<number>();
    const edible = this.nearestTarget();
    for (const a of sim.actors) {
      if (a.state === "dead") continue;
      const d = dist(a, p);
      if (d > 34) continue;
      seen.add(a.id);
      let v = this.views.get(a.id);
      if (!v) {
        v = new ActorView(this, atlasFor(a), a.spec.scale, a.spec.r, tintFor(a));
        void loadCreature(this, atlasFor(a));
        this.views.set(a.id, v);
      }
      const z = g.height(a.x, a.y);
      v.update(dt, a.x, a.y, z, a.face, this.poseFor(a), undefined, a.flash);
      this.drawCue(a, z);
      this.updateIcon(a, v, d, a === edible);
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        v.destroy();
        this.views.delete(id);
        this.icons.get(id)?.destroy();
        this.icons.delete(id);
      }
    void ring;
    // --- discovery markers
    for (const d of DISCOVERIES) {
      const m = this.markers.get(d.id);
      if (!m) continue;
      const show = d.kind === "forage" ? dist(d, p) < 14 : !sim.save.discoveries.includes(d.id) && dist(d, p) < 14;
      m.setVisible(show);
      if (show) {
        const q = proj(d.x, d.y, g.height(d.x, d.y) + 0.9 + Math.sin(sim.time * 3 + d.x) * 0.08);
        m.setPosition(q.x, q.y).setDepth(q.y + 4).setAlpha(Math.min(1, (14 - dist(d, p)) / 4));
      }
    }
    // foliage fades in front of the hunt
    const hunt = sim.actors.filter((a) => a.state === "windup" || a.state === "strike").map((a) => proj(a.x, a.y, 0));
    this.props.fade(proj(p.x, p.y, pz), hunt, dt);
    this.drawFootsteps(dt);
  }
  private footTimer = 0;
  private drawFootsteps(dt: number) {
    const p = this.sim.player;
    if (p.speedNow < 0.5 || this.reduced) return;
    this.footTimer -= dt;
    if (this.footTimer > 0) return;
    this.footTimer = Math.max(0.1, 0.45 - p.speedNow * 0.04);
    const q = proj(p.x, p.y, this.world.grid.height(p.x, p.y));
    const wet = this.world.grid.inWater(p.x, p.y);
    this.fx.spawn(wet ? "fx-soft" : "fx-dust", q.x + (Math.random() - 0.5) * 20, q.y - 2, { vx: (Math.random() - 0.5) * 20, vy: -8, life: 0.45, a: wet ? 0.5 : 0.35, s0: 0.25, s1: 0.65, tint: wet ? 0xcff8ff : undefined, depth: q.y - 1 });
  }
  private nearestTarget() {
    const p = this.sim.player;
    let best: Actor | undefined,
      bd = 1e9;
    for (const a of this.sim.actors) {
      if (a.state === "dead" || a.spec.role === "armour") continue;
      const d = dist(a, p);
      if (d < bd && d < 9) {
        bd = d;
        best = a;
      }
    }
    return best;
  }
  private ellipseOnGround(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, z: number) {
    g.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const q = proj(x + Math.cos(a) * r, y + Math.sin(a) * r, z);
      if (i === 0) g.moveTo(q.x, q.y);
      else g.lineTo(q.x, q.y);
    }
    g.strokePath();
  }
  private drawCue(a: Actor, z: number) {
    const cues = this.cues,
      spec = a.spec;
    if (a.state !== "windup" && a.state !== "strike") return;
    const reach = spec.reach ?? 4,
      arc = spec.arc ?? 0.3;
    const total = spec.windup ?? 0.8;
    const prog = a.state === "windup" ? Math.min(1, a.age / (total * (this.sim.save.assist ? 1.3 : 1))) : 1;
    const draw = (scale: number, fill: number, alpha: number, line: number) => {
      const pts: Phaser.Math.Vector2[] = [];
      const n = 14;
      const start = spec.role === "sweeper" ? 0 : spec.r * 0.6;
      pts.push(new Phaser.Math.Vector2(...(Object.values(proj(a.x, a.y, z)) as [number, number])));
      for (let i = 0; i <= n; i++) {
        const ang = a.dir - arc + (i / n) * arc * 2;
        const rr = (start + (reach - start) * scale);
        const q = proj(a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr, z);
        pts.push(new Phaser.Math.Vector2(q.x, q.y));
      }
      cues.fillStyle(fill, alpha);
      cues.fillPoints(pts, true);
      if (line) {
        cues.lineStyle(line, 0xffc2b0, 0.95);
        cues.strokePoints(pts, true);
      }
    };
    draw(1, 0xff4a34, a.state === "strike" ? 0.42 : 0.2, 2.5);
    // inner fan grows as the strike approaches: the player reads *when*, not just *where*
    if (a.state === "windup") draw(Math.max(0.05, prog), 0xff7a52, 0.4, 0);
  }
  private updateIcon(a: Actor, v: ActorView, d: number, targeted: boolean) {
    let tex = "";
    const spec = a.spec;
    if (spec.role === "prey" && d < 8 && a.state !== "flee" && !this.sim.safe) tex = "icon-food";
    else if (spec.role !== "prey" && spec.role !== "armour" && (a.state === "alert" || a.state === "windup" || (a.state === "stalk" && d < 10))) tex = "icon-warn";
    else if (spec.role === "armour" && d < 6) tex = "icon-shield";
    let ic = this.icons.get(a.id);
    if (!tex) {
      ic?.setVisible(false);
      return;
    }
    if (!ic) {
      ic = this.add.image(0, 0, tex);
      this.icons.set(a.id, ic);
    }
    const q = proj(a.x, a.y, this.world.grid.height(a.x, a.y) + Math.max(0.7, (spec.r * 2.2 + 0.4)));
    const bob = Math.sin(this.sim.time * 5 + a.id) * 3;
    ic.setTexture(tex).setVisible(true).setPosition(q.x, q.y + bob).setDepth(q.y + 20);
    ic.setScale(tex === "icon-warn" ? 0.55 + (a.state === "windup" ? 0.1 * Math.sin(this.sim.time * 22) : 0) : targeted ? 0.52 : 0.4);
    ic.setAlpha(tex === "icon-food" && !targeted ? 0.7 : 1);
    void v;
  }
  // ---------------------------------------------------------------- events -> feedback
  private onEvent(e: AdventureEvent) {
    const audio = this.registry.get("audio") as Audio;
    const g = this.world.grid;
    const q = proj(e.x, e.y, g.height(e.x, e.y));
    const fx = this.fx;
    const calm = this.reduced;
    const burst = (tex: string, n: number, speed: number, o: { life?: number; tint?: number; g?: number; s0?: number; s1?: number; up?: number; a?: number; blend?: Phaser.BlendModes } = {}) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2,
          s = speed * (0.4 + Math.random() * 0.8);
        fx.spawn(tex, q.x, q.y - 14, { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.55 - (o.up ?? 20), g: o.g ?? 90, life: o.life ?? 0.55, s0: o.s0 ?? 0.5, s1: o.s1 ?? 0.2, tint: o.tint, a: o.a ?? 0.9, spin: Math.random() * 6 - 3, blend: o.blend });
      }
    };
    switch (e.type) {
      case "bite": {
        audio.play("bite", this.sim.tier + 1);
        const f = e.dir ?? 0;
        const tip = proj(this.sim.player.x + Math.cos(f) * (this.sim.radius + 0.9), this.sim.player.y + Math.sin(f) * (this.sim.radius + 0.9), g.height(this.sim.player.x, this.sim.player.y) + 0.5);
        fx.spawn("fx-spark", tip.x, tip.y, { life: 0.22, s0: 0.5, s1: 1.4, a: 0.9, blend: Phaser.BlendModes.ADD, depth: tip.y + 30 });
        break;
      }
      case "hit":
        audio.play("hit");
        this.hitStop = calm ? 0 : 0.055;
        burst("fx-spark", calm ? 3 : 7, 120, { life: 0.35, s0: 0.5, s1: 0.1, blend: Phaser.BlendModes.ADD });
        if (!calm) this.cameras.main.shake(70, 0.0025);
        break;
      case "eat":
        audio.play("eat", this.sim.tier + 1);
        burst("fx-leaf", calm ? 3 : 8, 90, { life: 0.8, g: 140, s0: 0.9, s1: 0.5, tint: 0xb7ee62 });
        if (e.reward) this.floater(`+${e.reward}`, q.x, q.y - 40, "#ffe08a");
        if (!this.celebratedCatch && e.reward) {
          this.celebratedCatch = true;
          this.hud.toast(`First catch! · +${e.reward} growth`, "catch");
        }
        break;
      case "hurt":
        audio.play("hurt");
        burst("fx-spark", 6, 130, { tint: 0xff6d55, life: 0.4 });
        if (!calm) this.cameras.main.shake(130, 0.006);
        this.flash("rgba(255,60,40,0.28)");
        break;
      case "dodge":
        audio.play("dodge");
        burst("fx-dust", calm ? 3 : 9, 70, { life: 0.5, s0: 0.5, s1: 1.1, g: 0, up: 8, a: 0.6 });
        break;
      case "roar": {
        audio.play("roar");
        this.zoomPulse = 1;
        if (!calm) this.cameras.main.shake(260, 0.004);
        const r = this.add.image(q.x, q.y, "fx-ring").setDepth(q.y - 2).setAlpha(0.8).setScale(0.2, 0.115).setTint(0xfff1c2);
        this.tweens.add({ targets: r, scaleX: 2.6 + this.sim.tier * 0.5, scaleY: (2.6 + this.sim.tier * 0.5) * 0.577, alpha: 0, duration: 650, ease: "Cubic.easeOut", onComplete: () => r.destroy() });
        if (e.text) this.floater(e.text, q.x, q.y - 70, "#fff0c4");
        break;
      }
      case "pounce":
        audio.play("dodge");
        burst("fx-dust", 8, 90, { life: 0.5, g: 0, a: 0.6 });
        if (e.text) this.floater(e.text, q.x, q.y - 60, "#fff0c4");
        break;
      case "tell": {
        audio.play("tell");
        const a = this.sim.actors.find((x) => x.id === e.actor);
        if (a) {
          const c = this.toCss(q.x, q.y - 130);
          this.hud.callout("tell" + a.id, (e.text ?? "Attack") + " · punish the recovery", c.x, c.y, "danger");
          this.calloutUntil.set("tell" + a.id, this.sim.time + 1.4);
        }
        break;
      }
      case "notice":
        audio.play("nope");
        if (e.text) this.hud.toast(e.text, "hint");
        break;
      case "bounce":
        audio.play("nope");
        if (e.text) this.hud.toast(e.text);
        break;
      case "stagger":
        audio.play("hit");
        if (e.text) this.floater(e.text, q.x, q.y - 70, "#ffd9a8");
        break;
      case "grow": {
        audio.play("grow", this.sim.tier + 1);
        this.zoomPulse = 1;
        this.hud.toast(e.text ?? "You grew!", "grow");
        if (!calm) this.cameras.main.shake(300, 0.004);
        burst("fx-spark", calm ? 8 : 26, 220, { life: 1.0, s0: 0.9, s1: 0.2, g: 40, blend: Phaser.BlendModes.ADD });
        const r = this.add.image(q.x, q.y, "fx-ring").setDepth(q.y - 2).setAlpha(0.9).setScale(0.15, 0.09).setTint(0xffe08a);
        this.tweens.add({ targets: r, scaleX: 3.4, scaleY: 1.96, alpha: 0, duration: 900, ease: "Cubic.easeOut", onComplete: () => r.destroy() });
        this.persist();
        break;
      }
      case "discovery":
        audio.play("grow", 1);
        burst("fx-spark", calm ? 4 : 12, 110, { life: 0.9, g: 30, blend: Phaser.BlendModes.ADD });
        if (e.text) this.hud.toast(e.text + (e.reward ? ` · +${e.reward} growth` : ""), e.reward ? "reward" : "study");
        this.persist();
        break;
      case "nest":
      case "gate":
        if (e.text) this.hud.toast(e.text);
        this.persist();
        break;
      case "forage":
        audio.play("eat", 1);
        burst("fx-leaf", 8, 70, { life: 0.9, tint: 0x9be05c });
        if (e.text) this.hud.toast(e.text);
        break;
      case "victory":
        audio.play("grow", 3);
        if (e.text) this.hud.toast(e.text, "grow");
        this.persist();
        break;
      case "defeat":
        audio.play("shrink");
        this.flash("rgba(10,20,14,0.6)");
        if (e.text) this.hud.toast(e.text, "bad");
        this.snapCamera();
        this.persist();
        break;
    }
  }
  private calloutUntil = new Map<string, number>();
  private floater(text: string, x: number, y: number, color: string) {
    if (this.floaters.length > 7) return;
    const t = this.add
      .text(x, y, text, { fontFamily: "Palatino Linotype, Palatino, Georgia, serif", fontSize: "30px", color, fontStyle: "bold", stroke: "#10241b", strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(2e5);
    this.floaters.push(t);
    t.setData("age", 0);
  }
  private updateFloaters(dt: number) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const t = this.floaters[i];
      const age = (t.getData("age") as number) + dt;
      t.setData("age", age);
      t.y -= dt * (this.reduced ? 0 : 38);
      t.setAlpha(Math.max(0, 1 - age / 1.1));
      if (age > 1.1) {
        t.destroy();
        this.floaters.splice(i, 1);
      }
    }
  }
  private flash(color: string) {
    if (!this.flashEl) return;
    this.flashEl.style.background = color;
    this.flashEl.style.opacity = "1";
    requestAnimationFrame(() => {
      if (this.flashEl) {
        this.flashEl.style.transition = "opacity 0.45s";
        this.flashEl.style.opacity = "0";
      }
    });
    setTimeout(() => this.flashEl && (this.flashEl.style.transition = ""), 480);
  }
  // ---------------------------------------------------------------- HUD
  private updateHud(dt: number) {
    const s = this.sim;
    const spec = DINOS[s.dino];
    const cd = (t: number, max: number) => (max > 0 ? Math.min(1, t / max) : 0);
    // continually re-anchor live callouts
    for (const [id, until] of this.calloutUntil) {
      const aid = Number(id.replace("tell", ""));
      const a = s.actors.find((x) => x.id === aid);
      if (!a || s.time > until || a.state === "recover" || a.state === "dead") {
        this.calloutUntil.delete(id);
        continue;
      }
      const q = proj(a.x, a.y, this.world.grid.height(a.x, a.y) + a.spec.r * 2.4 + 0.8);
      const c = this.toCss(q.x, q.y);
      this.hud.callout(id, "Lunge · punish the recovery", c.x, c.y, "danger");
    }
    // vulnerable window prompt
    for (const a of s.actors) {
      if ((a.state === "recover" || a.state === "stagger") && a.spec.role !== "prey" && dist(a, s.player) < 12) {
        const q = proj(a.x, a.y, this.world.grid.height(a.x, a.y) + a.spec.r * 2.4 + 0.8);
        const c = this.toCss(q.x, q.y);
        this.hud.callout("rec" + a.id, "Vulnerable · bite now", c.x, c.y, "good");
      }
    }
    for (const gate of GATES) {
      if (s.save.gates.includes(gate.id) || dist(gate, s.player) > 10) continue;
      const q = proj(gate.x, gate.y, this.world.grid.height(gate.x, gate.y) + 1.2);
      const c = this.toCss(q.x, q.y);
      const requirement = s.tier < gate.requiredStage ? `${["Hatchling", "Juvenile", "Hunter", "Apex"][gate.requiredStage]} needed` : gate.id === "trike-rubble" ? "Trike · charge the rubble" : gate.id === "raptor-roots" ? "Raptor root passage" : gate.kind === "breakable" ? "Bite to clear the route" : "Cross the shallow ford";
      this.hud.callout("gate-" + gate.id, `${gate.name} · ${requirement}`, c.x, c.y, "good");
    }
    this.hud.endCallouts();
    this.hud.update(
      {
        dinoName: spec.name,
        stage: s.tier,
        stageName: ["Hatchling", "Juvenile", "Hunter", "Apex"][s.tier],
        hp: Math.max(0, s.player.hp),
        growth: s.growth,
        region: byRegion(s.region).name,
        objective: s.objective,
        cooldown: { bite: cd(s.biteCooldown, spec.biteCd), dodge: cd(s.dodgeCooldown, spec.dodgeCd), skill: cd(s.skillCooldown, spec.skillCd) },
        skillName: spec.skillName,
        skillLocked: s.tier < spec.skillStage,
        interact: s.interactLabel ? `${s.interactLabel} · Enter` : null,
        portrait: () => this.portrait(),
      },
      dt,
    );
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.12;
      const mk: MapMarker[] = [{ x: s.player.x, y: s.player.y, kind: "player", face: s.player.face }];
      for (const a of s.actors) if (a.state !== "dead" && a.spec.role !== "prey" && a.spec.role !== "armour" && dist(a, s.player) < 40) mk.push({ x: a.x, y: a.y, kind: "threat" });
      for (const r of REGIONS) if (r.built) mk.push({ x: r.nest.x, y: r.nest.y, kind: "nest" });
      for (const d of DISCOVERIES) if (d.kind !== "forage" && !s.save.discoveries.includes(d.id) && dist(d, s.player) < 30) mk.push({ x: d.x, y: d.y, kind: "find" });
      for (const portal of PORTALS) {
        if (dist(portal, s.player) < 40) mk.push({ x: portal.x, y: portal.y, kind: "goal" });
        if (portal.bidirectional && dist(portal.to, s.player) < 40) mk.push({ x: portal.to.x, y: portal.to.y, kind: "goal" });
      }
      this.hud.drawMap(s.player.x, s.player.y, mk);
    }
  }
  private portraitCache?: { key: string; canvas: HTMLCanvasElement };
  private portraitImages = new Map<string, HTMLImageElement>();
  private portrait(): HTMLCanvasElement | null {
    const key = this.playerAtlasId();
    if (this.portraitCache?.key === key) return null;
    let src = this.portraitImages.get(key);
    if (!src) {
      src = new Image();
      src.src = import.meta.env.BASE_URL + `art/portraits/${key}.webp`;
      this.portraitImages.set(key, src);
    }
    if (!src.complete || !src.naturalWidth) return null;
    const c = document.createElement("canvas");
    c.width = c.height = 120;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(src, 0, 0, 120, 120);
    this.portraitCache = { key, canvas: c };
    return c;
  }
  // ---------------------------------------------------------------- lifecycle
  persist() {
    if (!this.sim) return;
    const data = this.saveStore.write(this.profileId, this.sim.checkpoint());
    this.sim.save = data;
    this.lastSave = this.sim.time;
    window.dispatchEvent(new CustomEvent("rex-adventure-save", { detail: { id: this.profileId, save: data } }));
  }
  requestPause() {
    if (this.scene.isPaused() || !this.ready) return;
    this.stick = { x: 0, y: 0, mag: 0 };
    this.stickPointer = null;
    this.hud.stick(0, 0, false);
    this.held = { bite: false, dodge: false, skill: false };
    this.input.keyboard?.resetKeys();
    this.persist();
    (this.registry.get("audio") as Audio).stopAmbience();
    this.game.scene.pause("Adventure");
    window.dispatchEvent(new Event("rex-adventure-pause"));
  }
  resumeAdventure() {
    this.input.keyboard?.resetKeys();
    this.startAmbience();
    this.game.scene.resume("Adventure");
  }
  diagnostics() {
    const cam = this.cameras.main;
    return {
      ready: this.ready,
      tier: this.sim.tier,
      dino: this.sim.dino,
      region: this.sim.region,
      hp: this.sim.player.hp,
      xp: this.sim.save.xp[this.sim.dino],
      position: { x: this.sim.player.x, y: this.sim.player.y },
      actors: this.sim.actors.filter((a) => a.state !== "dead").length,
      views: this.views.size,
      props: this.props?.count ?? 0,
      propsLive: this.props?.active ?? 0,
      tiles: this.ground?.loaded ?? 0,
      fx: this.fx?.count ?? 0,
      objective: this.sim.objective,
      zoom: cam.zoom,
      textures: this.textures.getTextureKeys().length,
      save: JSON.parse(JSON.stringify(this.sim.save)),
    };
  }
}
function tintFor(a: Actor) {
  if (a.rival) return 0xffe2d6;
  return 0xffffff;
}
void REGIONS;
