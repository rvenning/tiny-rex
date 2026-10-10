import * as Phaser from "phaser";
import { Adventure, idleInput, type Actor, type AdventureEvent } from "../adventure/sim";
import { DINOS, DISCOVERIES, GATES, PORTALS, REGIONS, byRegion, type Point } from "../adventure/data";
import type { CharacterStore } from "../rpg/store";
import { STAGE_NAMES } from "../rpg/progression";
import { RARITY_COLOR } from "../rpg/mutations";
import type { Rarity } from "../rpg/types";
import type { Audio } from "../platform/audio";
import { Hud, type ActionKey, type HudState, type MapMarker } from "../ui/hud";
import { proj, screenDirToGround } from "../world/projection";
import type { World } from "../world/world";
import { ActorView } from "./adventure/actor-view";
import { hasCreature, loadCreature, loadProps, unloadCreature } from "./adventure/assets";
import { Fx, makeTextures } from "./adventure/fx";
import { Ambient } from "./adventure/ambient";
import { findRoute } from "../adventure/guide";
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
const RARITY_TINT: Record<Rarity, number> = { common: 0xdfe6d6, rare: 0x6cc4ff, epic: 0xc58bff, legendary: 0xffb347 };
const hex = (css: string) => parseInt(css.slice(1), 16);
/** creature id (sim) -> atlas id (art) */
const atlasFor = (a: Actor) => a.spec.sprite;

export interface AdventureSceneData {
  profileId: string;
  characterId: string;
  store: CharacterStore;
  world: World;
}
interface DmgText {
  t: Phaser.GameObjects.Text;
  age: number;
  life: number;
  vx: number;
  vy: number;
}

export class AdventureScene extends Phaser.Scene {
  sim!: Adventure;
  private world!: World;
  private profileId = "";
  private store!: CharacterStore;
  private hud!: Hud;
  private ground!: GroundLayer;
  private props!: PropLayer;
  private fx!: Fx;
  private ambient?: Ambient;
  private route: Point[] = [];
  private routeTimer = 0;
  private guideArrow?: Phaser.GameObjects.Image;
  private guideMark?: Phaser.GameObjects.Image;
  private cues!: Phaser.GameObjects.Graphics;
  private bars!: Phaser.GameObjects.Graphics;
  private views = new Map<number, ActorView>();
  private icons = new Map<number, Phaser.GameObjects.Image>();
  private dropViews = new Map<string, { gem: Phaser.GameObjects.Image; beam?: Phaser.GameObjects.Image; shadow: Phaser.GameObjects.Image }>();
  private shotViews = new Map<number, Phaser.GameObjects.Image>();
  private dmgTexts: DmgText[] = [];
  private player?: ActorView;
  private playerAtlas = "";
  private markers = new Map<string, Phaser.GameObjects.Image>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { x: 0, y: 0, mag: 0 };
  private stickPointer: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private held: Record<ActionKey, boolean> = { bite: false, dodge: false, skillA: false, skillB: false };
  private accumulator = 0;
  private lastSave = 0;
  private reduced = false;
  private ready = false;
  private cleanup: (() => void)[] = [];
  private hitStop = 0;
  private slowmo = 0;
  private camTarget = new Phaser.Math.Vector2();
  private lookahead = new Phaser.Math.Vector2();
  private zoomBase = 1;
  private zoomPulse = 0;
  private mapTimer = 0;
  private loadingEl?: HTMLElement;
  private floaters: Phaser.GameObjects.Text[] = [];
  private flashEl?: HTMLElement;
  private lastTier = -1;
  private shown = new Set<number>();
  private creatureStreamTimer = 0;
  private clearedProps = new Set<string>();
  private celebratedCatch = false;
  private lastPoints = 0;
  private calloutUntil = new Map<string, number>();
  private footTimer = 0;
  private portraitCache?: { key: string; canvas: HTMLCanvasElement };
  private portraitImages = new Map<string, HTMLImageElement>();
  constructor() {
    super("Adventure");
  }
  create(data: AdventureSceneData) {
    this.profileId = data.profileId;
    this.world = data.world;
    this.store = data.store;
    const character = this.store.get(this.profileId, data.characterId);
    if (!character) throw new Error("character missing: " + data.characterId);
    this.sim = new Adventure(this.world, character);
    this.reduced = !!this.registry.get("reducedMotion");
    this.ready = false;
    this.views.clear();
    this.icons.clear();
    this.markers.clear();
    this.dropViews.clear();
    this.shotViews.clear();
    this.dmgTexts = [];
    this.floaters = [];
    this.cleanup = [];
    this.stickPointer = null;
    this.stick = { x: 0, y: 0, mag: 0 };
    this.held = { bite: false, dodge: false, skillA: false, skillB: false };
    this.accumulator = 0;
    this.lastSave = 0;
    this.hitStop = 0;
    this.slowmo = 0;
    this.lastTier = -1;
    this.creatureStreamTimer = 0;
    this.clearedProps.clear();
    this.celebratedCatch = false;
    this.lastPoints = this.sim.skillPoints;
    this.cameras.main.setBackgroundColor("#1b3322").setRoundPixels(false);
    makeTextures(this);
    this.fx = new Fx(this);
    this.fx.budget = this.reduced ? 70 : 170;
    this.cues = this.add.graphics().setDepth(-9e5);
    this.bars = this.add.graphics().setDepth(9e5);
    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,J,K,L,E,Q,R,SPACE,ESC,ENTER,SHIFT,I,O,M,TAB,P") as Record<string, Phaser.Input.Keyboard.Key>;
    const touch = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
    this.hud = new Hud(
      document.getElementById("ui")!,
      {
        press: (k, down) => {
          this.held[k] = down;
          if (down) (this.registry.get("audio") as Audio).unlock();
        },
        pause: () => this.requestPause(),
        journal: () => this.openMenu("journal"),
        pack: () => this.openMenu("pack"),
        skills: () => this.openMenu("skills"),
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
    const ids = new Set<string>(this.sim.actors.filter((a) => dist(a, this.sim.player) < 34).map(atlasFor));
    ids.add(this.playerAtlasId());
    await Promise.all([loadProps(this), ...[...ids].map((id) => loadCreature(this, id))]);
    if (!this.sys.isActive()) return;
    this.ground = new GroundLayer(this, this.world);
    this.props = new PropLayer(this, this.world);
    this.ambient = new Ambient(this, this.fx, this.world.grid, this.reduced, this.world.meta.features as never);
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
    const line = this.sim.save.elapsed < 30 ? (this.hud.root.classList.contains("touch") ? "Move the stick · gentle pushes creep" : "WASD move · J attacks · Space dodges · Shift creeps") : `Welcome back, ${this.sim.save.name}`;
    this.hud.toast(line, "hint");
  }
  private playerAtlasId() {
    const d = this.sim.dino;
    return d === "rex" ? `rex_${this.sim.tier}` : DINOS[d].atlas;
  }
  // ---------------------------------------------------------------- input
  private openMenu(menu: "pack" | "skills" | "journal") {
    if (!this.ready) return;
    this.requestPause();
    window.dispatchEvent(new CustomEvent("rex-adventure-menu", { detail: { menu } }));
  }
  private bindInput() {
    const kb = this.input.keyboard!;
    const handlers: [string, () => void][] = [
      ["keydown-ESC", () => this.requestPause()],
      ["keydown-P", () => this.requestPause()],
      ["keydown-ENTER", () => this.interactNow()],
      ["keydown-I", () => this.openMenu("pack")],
      ["keydown-O", () => this.openMenu("skills")],
      ["keydown-M", () => this.openMenu("journal")],
      ["keydown-TAB", () => this.openMenu("journal")],
    ];
    for (const [ev, fn] of handlers) kb.on(ev, fn);
    this.cleanup.push(() => {
      for (const [ev, fn] of handlers) kb.off(ev, fn);
    });
    const pause = () => this.requestPause();
    const down = (p: Phaser.Input.Pointer) => {
      const e = p.event as PointerEvent;
      const cx = (p.x * innerWidth) / this.scale.width,
        cy = (p.y * innerHeight) / this.scale.height;
      if (this.stickPointer !== null || cx > innerWidth * 0.5 || !this.ready) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      this.stickPointer = p.id;
      this.stickOrigin = { x: cx, y: cy };
      this.stick = { x: 0, y: 0, mag: 0 };
      this.hud.stick(0, 0, true, cx, cy);
    };
    const move = (p: Phaser.Input.Pointer) => {
      if (this.stickPointer !== p.id) return;
      const dx = (p.x * innerWidth) / this.scale.width - this.stickOrigin.x,
        dy = (p.y * innerHeight) / this.scale.height - this.stickOrigin.y;
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
      this.held = { bite: false, dodge: false, skillA: false, skillB: false };
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
    for (const d of this.dmgTexts) d.t.destroy();
    this.dmgTexts = [];
    for (const d of this.dropViews.values()) {
      d.gem.destroy();
      d.beam?.destroy();
      d.shadow.destroy();
    }
    this.dropViews.clear();
    for (const s of this.shotViews.values()) s.destroy();
    this.shotViews.clear();
    this.input.removeAllListeners();
  }
  private interactNow() {
    if (!this.ready) return;
    const r = this.sim.interact();
    if (r === "nest") {
      this.requestPause();
      window.dispatchEvent(new Event("rex-adventure-nest"));
    } else if (r === "talk") {
      this.requestPause();
      window.dispatchEvent(new Event("rex-adventure-dialogue"));
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
    // look a little way ahead of where the player is going
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
    cam.setZoom(this.zoomBase * this.stageZoom() * (1 + 0.035 * Math.sin(this.zoomPulse * Math.PI)));
    cam.centerOn(this.camTarget.x, this.camTarget.y);
  }
  private toCss(wx: number, wy: number) {
    const v = this.cameras.main.worldView;
    return { x: ((wx - v.x) / v.width) * innerWidth, y: ((wy - v.y) / v.height) * innerHeight };
  }
  // ---------------------------------------------------------------- frame
  update(_time: number, delta: number) {
    if (!this.sim || !this.ready) return;
    let dt = Math.min(delta / 1000, 0.1);
    if (this.slowmo > 0) {
      this.slowmo -= dt;
      dt *= 0.3;
    }
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
    input.skillA = this.held.skillA || this.keys.E.isDown || this.keys.L.isDown;
    input.skillB = this.held.skillB || this.keys.Q.isDown || this.keys.R.isDown;
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
    if (this.sim.tier !== this.lastTier) this.onTier();
    this.updateCamera(dt);
    const view = this.cameras.main.worldView;
    this.ground.update(view);
    this.props.update(view);
    this.animateWorld(dt, view);
    this.updateGuide(dt);
    this.draw(dt);
    this.streamCreatures(dt);
    this.fx.update(dt);
    this.updateHud(dt);
    this.updateFloaters(dt);
  }
  /** objective guidance: a pulsing arrow beside the player along the real walkable route, a goal marker, a minimap trail */
  private updateGuide(dt: number) {
    const s = this.sim,
      p = s.player;
    const target = s.objectiveTarget;
    this.routeTimer -= dt;
    const far = !!target && dist(target, p) > 7;
    if (this.routeTimer <= 0) {
      this.routeTimer = 1.4;
      this.route = far && target ? findRoute(this.world.grid, p, target) : [];
    }
    if (!this.guideArrow) {
      this.guideArrow = this.add.image(0, 0, "icon-arrow").setDepth(9.5e5).setScale(0.62);
      this.guideMark = this.add.image(0, 0, "icon-find").setDepth(9.5e5).setScale(0.62).setTint(0xffd36a);
    }
    const hide = !far || !target || s.player.hp <= 0;
    this.guideArrow.setVisible(!hide);
    const mark = this.guideMark!;
    const creatureTarget = !!target && s.actors.some((a) => a.state !== "dead" && !a.npc && dist(a, target) < 1.3);
    if (hide || !target) {
      mark.setVisible(false);
      return;
    }
    const next = this.route.find((q) => dist(q, p) > 6) ?? this.route.at(-1) ?? target;
    const a = proj(p.x, p.y, this.world.grid.height(p.x, p.y)),
      b = proj(next.x, next.y, this.world.grid.height(next.x, next.y));
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const reach = 120 + 6 * Math.sin(s.time * 4);
    const threat = s.actors.some((x) => x.state === "windup" || x.state === "strike");
    this.guideArrow.setPosition(a.x + Math.cos(ang) * reach, a.y - 30 + Math.sin(ang) * reach * 0.8).setRotation(ang).setAlpha(threat ? 0.3 : 0.9);
    const tp = proj(target.x, target.y, this.world.grid.height(target.x, target.y) + 1.6 + Math.sin(s.time * 3) * 0.12);
    mark.setVisible(!creatureTarget && this.cameras.main.worldView.contains(tp.x, tp.y)).setPosition(tp.x, tp.y).setDepth(tp.y + 40);
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
    const nearby = new Set(this.sim.actors.filter((a) => a.state !== "dead" && dist(a, this.sim.player) < 52).map(atlasFor));
    nearby.add(this.playerAtlasId());
    for (const id of nearby) void loadCreature(this, id);
    const active = new Set([...this.views.values()].map((v) => v.atlasId));
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
        return "hurt";
      case "recover":
        return "recover";
      case "roar":
        return "windup";
      default:
        return a.speedNow > 0.4 ? "run" : a.spec.id === "dragonfly" ? "hover" : "idle";
    }
  }
  /** colour of the strongest worn mutation: the character's visible evolution */
  private auraColor(): { color: number; alpha: number } | null {
    const worn = Object.values(this.sim.save.worn).filter(Boolean);
    const rank: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };
    const best = worn.reduce<Rarity | null>((b, m) => (m && (b === null || rank[m.rarity] > rank[b]) ? m.rarity : b), null);
    if (!best || best === "common") return null;
    const legendary = worn.find((m) => m?.rarity === "legendary");
    if (legendary && this.sim.d.feastGlow) return { color: 0xffd98a, alpha: 0.3 };
    return { color: RARITY_TINT[best], alpha: best === "rare" ? 0.1 : best === "epic" ? 0.16 : 0.24 };
  }
  private draw(dt: number) {
    const sim = this.sim,
      p = sim.player;
    const g = this.world.grid;
    const cues = this.cues,
      bars = this.bars;
    cues.clear();
    bars.clear();
    // --- player
    if (!this.player) this.swapPlayer(this.playerAtlasId());
    const pv = this.player!;
    let pose = p.pose as string;
    let prog: number | undefined;
    if (pose === "bite" || pose === "skill" || pose === "dodge" || pose === "hurt") prog = 1 - p.action / Math.max(0.001, p.actionLen);
    const pz = g.height(p.x, p.y);
    pv.scale = DINOS[sim.dino].stages[sim.tier].sprite * (1 + sim.feast.scale);
    pv.radius = sim.radius;
    const aura = this.auraColor();
    pv.glowColor = aura ? aura.color : null;
    pv.glowAlpha = aura?.alpha ?? 0;
    pv.update(dt, p.x, p.y, pz, p.face, pose, prog, 0, p.invuln > 0 && p.pose !== "dodge" ? 0.6 + 0.4 * Math.abs(Math.sin(sim.time * 24)) : 1);
    // ground ring under the player (white, like the mockups); brace shows a shield ring
    cues.lineStyle(2.5, p.brace ? 0x9ad1ff : 0xfff4d6, 0.85);
    this.ellipseOnGround(cues, p.x, p.y, sim.radius * 1.15, pz);
    if (p.frenzy > 0 || p.bellow > 0) {
      cues.lineStyle(2, p.frenzy > 0 ? 0xff7a52 : 0xffd36a, 0.5 + 0.3 * Math.sin(sim.time * 8));
      this.ellipseOnGround(cues, p.x, p.y, sim.radius * 1.5, pz);
    }
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
      v.hidden = a.state === "dormant";
      v.glowColor = a.spec.archetype === "boss" || a.spec.archetype === "miniboss" ? 0xff5a3c : a.elite ? 0xffd36a : a.fx.poison ? 0x9be05c : a.fx.bleed ? 0xff4a4a : null;
      v.glowAlpha = a.spec.archetype === "boss" ? 0.18 : 0.14;
      v.scale = a.spec.scale * (a.elite ? 1.18 : 1);
      v.update(dt, a.x, a.y, z, a.face, this.poseFor(a), undefined, a.flash);
      this.drawCue(a, z);
      this.drawBar(bars, a, z, d);
      this.updateIcon(a, v, d, a === edible);
      this.npcMarker(a, z, d);
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        v.destroy();
        this.views.delete(id);
        this.icons.get(id)?.destroy();
        this.icons.delete(id);
        this.hud.callout("qm" + id, "", -999, -999, "quest-mark");
      }
    // --- ground loot, projectiles
    this.drawDrops(dt);
    this.drawShots();
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
    // hazards (steam vents warn before they burst)
    for (const h of sim.hazards) {
      if (dist(h, p) > 30 || (h.offFlag && sim.hasFlag(h.offFlag))) continue;
      const hz = g.height(h.x, h.y);
      if (h.kind === "steam") {
        const period = h.period ?? 6,
          warn = h.warn ?? 1.2;
        const ph = (sim.time + (h.phase ?? 0)) % period;
        const warning = ph >= period - warn;
        cues.lineStyle(2, warning ? 0xffe0a0 : 0x9fb0b0, warning ? 0.9 : 0.35);
        this.ellipseOnGround(cues, h.x, h.y, h.r * (warning ? 0.6 + 0.4 * ((ph - (period - warn)) / warn) : 0.5), hz);
        if (ph < 0.5) {
          cues.fillStyle(0xe8f4f4, 0.4 * (1 - ph / 0.5));
          this.fillEllipseOnGround(cues, h.x, h.y, h.r, hz);
        }
      } else {
        const col = h.kind === "toxic" ? 0x9be05c : h.kind === "mutagen" ? 0xffb347 : h.kind === "embers" ? 0xff7a2a : 0xd8bf86;
        cues.fillStyle(col, 0.16 + 0.06 * Math.sin(sim.time * 3 + h.x));
        this.fillEllipseOnGround(cues, h.x, h.y, h.r, hz);
        cues.lineStyle(2, col, 0.55);
        this.ellipseOnGround(cues, h.x, h.y, h.r, hz);
      }
    }
    // foliage fades in front of the hunt
    const hunt = sim.actors.filter((a) => a.state === "windup" || a.state === "strike").map((a) => proj(a.x, a.y, 0));
    this.props.fade(proj(p.x, p.y, pz), hunt, dt);
    this.drawFootsteps(dt);
  }
  private drawDrops(dt: number) {
    const sim = this.sim,
      g = this.world.grid;
    const live = new Set<string>();
    for (const d of sim.drops) {
      if (dist(d, sim.player) > 40) continue;
      live.add(d.id);
      let v = this.dropViews.get(d.id);
      const rarity: Rarity | "amber" = d.mutation ? d.mutation.rarity : "amber";
      const color = rarity === "amber" ? 0xffcf75 : RARITY_TINT[rarity];
      if (!v) {
        const gem = this.add.image(0, 0, "fx-gem").setTint(color);
        const shadow = this.add.image(0, 0, "fx-shadow").setAlpha(0.6);
        const beam = rarity === "epic" || rarity === "legendary" || rarity === "rare" ? this.add.image(0, 0, "fx-beam").setBlendMode(Phaser.BlendModes.ADD).setTint(color).setOrigin(0.5, 1) : undefined;
        v = { gem, beam, shadow };
        this.dropViews.set(d.id, v);
      }
      const z = g.height(d.x, d.y);
      const bob = Math.sin(sim.time * 3 + d.x) * 0.1;
      const q = proj(d.x, d.y, z + 0.55 + bob);
      const fresh = Math.min(1, (sim.time - (d.expires - 150)) / 0.3);
      void fresh;
      v.gem.setPosition(q.x, q.y).setDepth(q.y).setScale(rarity === "amber" ? 0.38 : 0.52 + (rarity === "legendary" ? 0.15 : rarity === "epic" ? 0.08 : 0)).setRotation(Math.sin(sim.time * 2 + d.y) * 0.12);
      const gq = proj(d.x, d.y, z);
      v.shadow.setPosition(gq.x, gq.y + 4).setDepth(gq.y - 1).setScale(0.35);
      if (v.beam) {
        const height = rarity === "legendary" ? 1.7 : rarity === "epic" ? 1.2 : 0.8;
        v.beam.setPosition(gq.x, gq.y + 2).setDepth(gq.y + 0.5).setScale(1.1, height).setAlpha((this.reduced ? 0.4 : 0.55 + 0.2 * Math.sin(sim.time * 4 + d.x)) * (rarity === "rare" ? 0.7 : 1));
      }
      if (d.mutation && dist(d, sim.player) < 6.5) {
        const c = this.toCss(q.x, q.y - 28);
        this.hud.callout("loot" + d.id, d.mutation.name, c.x, c.y, "loot r-" + d.mutation.rarity);
      }
    }
    for (const [id, v] of this.dropViews)
      if (!live.has(id)) {
        v.gem.destroy();
        v.beam?.destroy();
        v.shadow.destroy();
        this.dropViews.delete(id);
      }
    void dt;
  }
  private drawShots() {
    const g = this.world.grid;
    const live = new Set<number>();
    for (const s of this.sim.shots) {
      live.add(s.id);
      let img = this.shotViews.get(s.id);
      if (!img) {
        img = this.add.image(0, 0, "fx-glob").setBlendMode(Phaser.BlendModes.ADD);
        this.shotViews.set(s.id, img);
      }
      const q = proj(s.x, s.y, g.height(s.x, s.y) + 0.8);
      const tint = s.kind === "stone" ? 0xc8a070 : s.kind === "amber" ? 0xffc34d : 0x9be05c;
      img.setPosition(q.x, q.y).setDepth(q.y + 6).setTint(tint).setScale(0.8 + 0.12 * Math.sin(this.sim.time * 30));
      if (!this.reduced && Math.random() < 0.5) this.fx.spawn("fx-soft", q.x, q.y, { life: 0.3, s0: 0.35, s1: 0.1, a: 0.45, tint, depth: q.y + 5 });
    }
    for (const [id, img] of this.shotViews)
      if (!live.has(id)) {
        img.destroy();
        this.shotViews.delete(id);
      }
  }
  /** "!" over NPCs who have a quest, "?" over those waiting for a report; name plate when close */
  private npcMarker(a: Actor, z: number, d: number) {
    if (!a.npc || a.follow) return;
    const q = proj(a.x, a.y, z + (a.spec.r * 1.5 + 0.35) * a.spec.scale);
    const c = this.toCss(q.x, q.y);
    const m = this.sim.quests.marker(a.npc);
    if (m && d < 22) this.hud.callout("qm" + a.id, m === "offer" ? "!" : "?", c.x, c.y - 24, "quest-mark");
    if (d < 7) this.hud.callout("nm" + a.id, a.spec.name, c.x, c.y + 6, "npc");
  }
  private drawBar(bars: Phaser.GameObjects.Graphics, a: Actor, z: number, d: number) {
    if (a.npc || a.spec.role === "prey" || a.spec.archetype === "neutral" || d > 18) return;
    const boss = !!a.spec.boss;
    const hurt = a.hp < a.maxHp - 0.5;
    const engaged = a.state !== "idle" && a.state !== "dormant" && a.state !== "return";
    if (!hurt && !(engaged && (boss || a.elite)) && a.state !== "windup" && a.state !== "strike") return;
    const q = proj(a.x, a.y, z + a.spec.r * 2.5 * a.spec.scale + 0.7);
    const w = (boss ? 96 : 52) * (a.elite ? 1.15 : 1),
      h = boss ? 8 : 6;
    const x0 = q.x - w / 2,
      y0 = q.y - 4;
    bars.fillStyle(0x000000, 0.65);
    bars.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
    bars.fillStyle(0x3a1214, 1);
    bars.fillRect(x0, y0, w, h);
    const f = Math.max(0, a.hp / a.maxHp);
    bars.fillStyle(a.elite ? 0xffc34d : boss ? 0xff6a4a : 0xe8453c, 1);
    bars.fillRect(x0, y0, w * f, h);
    if (a.fx.stun || a.state === "stagger" || a.state === "recover") {
      bars.lineStyle(2, 0xfff0a0, 0.95);
      bars.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6);
    }
    if (a.fx.mark) {
      bars.fillStyle(0x8fd2ff, 1);
      bars.fillRect(x0, y0 + h + 3, w * Math.min(1, a.fx.mark.t / 6), 3);
    }
  }
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
      if (a.state === "dead" || a.spec.role === "armour" || a.npc) continue;
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
  private fillEllipseOnGround(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, z: number) {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const q = proj(x + Math.cos(a) * r, y + Math.sin(a) * r, z);
      pts.push(new Phaser.Math.Vector2(q.x, q.y));
    }
    g.fillPoints(pts, true);
  }
  /** Telegraphs: shape + inner "when" fill + label. Fans (lunge/sweep/charge), circles (slam), lines (spit/volley), rings (rally/summon). */
  private drawCue(a: Actor, z: number) {
    const cues = this.cues;
    const atk = a.atk;
    if ((a.state !== "windup" && a.state !== "strike") || !atk) return;
    const total = atk.windup * this.sim.diff.tell;
    const prog = a.state === "windup" ? Math.min(1, a.age / total) : 1;
    const striking = a.state === "strike";
    const fill = (pts: Phaser.Math.Vector2[], col: number, alpha: number, line: number) => {
      cues.fillStyle(col, alpha);
      cues.fillPoints(pts, true);
      if (line) {
        cues.lineStyle(line, 0xffc2b0, 0.95);
        cues.strokePoints(pts, true);
      }
    };
    const fan = (scale: number, col: number, alpha: number, line: number, arc: number) => {
      const pts: Phaser.Math.Vector2[] = [];
      const n = 14;
      const start = atk.kind === "sweep" ? 0 : a.spec.r * 0.6;
      const o = proj(a.x, a.y, z);
      pts.push(new Phaser.Math.Vector2(o.x, o.y));
      for (let i = 0; i <= n; i++) {
        const ang = a.dir - arc + (i / n) * arc * 2;
        const rr = start + (atk.reach - start) * scale;
        const q = proj(a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr, z);
        pts.push(new Phaser.Math.Vector2(q.x, q.y));
      }
      fill(pts, col, alpha, line);
    };
    const circle = (cx: number, cy: number, r: number, col: number, alpha: number, line: number) => {
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 32; i++) {
        const ang = (i / 32) * Math.PI * 2;
        const q = proj(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, z);
        pts.push(new Phaser.Math.Vector2(q.x, q.y));
      }
      fill(pts, col, alpha, line);
    };
    const lane = (dir: number, length: number, width: number, col: number, alpha: number, line: number, scale = 1) => {
      const cs = Math.cos(dir),
        sn = Math.sin(dir);
      const pts = [
        [0, -width],
        [length * scale, -width],
        [length * scale, width],
        [0, width],
      ].map(([u, v]) => {
        const q = proj(a.x + cs * u - sn * v, a.y + sn * u + cs * v, z);
        return new Phaser.Math.Vector2(q.x, q.y);
      });
      fill(pts, col, alpha, line);
    };
    switch (atk.kind) {
      case "lunge":
      case "sweep": {
        const arc = atk.arc ?? 0.3;
        fan(1, 0xff4a34, striking ? 0.42 : 0.2, 2.5, arc);
        if (!striking) fan(Math.max(0.05, prog), 0xff7a52, 0.4, 0, arc);
        break;
      }
      case "charge": {
        lane(a.dir, atk.reach, 0.9, 0xff4a34, striking ? 0.42 : 0.2, 2.5);
        if (!striking) lane(a.dir, atk.reach, 0.9, 0xff7a52, 0.4, 0, Math.max(0.05, prog));
        break;
      }
      case "slam": {
        const at = a.aim ?? a;
        circle(at.x, at.y, atk.reach, 0xff4a34, striking ? 0.42 : 0.2, 2.5);
        if (!striking) circle(at.x, at.y, Math.max(0.15, atk.reach * prog), 0xff7a52, 0.4, 0);
        break;
      }
      case "spit":
        lane(a.dir, atk.reach, 0.22, 0xb6ff5c, 0.16 + 0.2 * prog, 1.5);
        break;
      case "volley": {
        const n = atk.count ?? 3;
        for (let i = 0; i < n; i++) {
          const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.0;
          lane(a.dir + off, atk.reach, 0.18, 0xffb347, 0.14 + 0.2 * prog, 1.2);
        }
        break;
      }
      case "rally":
      case "summon": {
        circle(a.x, a.y, Math.max(0.5, (atk.reach || 3) * (0.4 + 0.6 * prog)), atk.kind === "rally" ? 0x7be08a : 0xc58bff, 0.14, 2);
        break;
      }
      default:
        break;
    }
  }
  private updateIcon(a: Actor, v: ActorView, d: number, targeted: boolean) {
    let tex = "";
    const spec = a.spec;
    if (a.npc) tex = "";
    else if (spec.role === "prey" && d < 8 && a.state !== "flee" && !this.sim.safe) tex = "icon-food";
    else if (spec.role !== "prey" && spec.archetype !== "neutral" && (a.state === "alert" || a.state === "windup" || (a.state === "stalk" && d < 10))) tex = "icon-warn";
    else if (spec.archetype === "tank" && d < 6) tex = "icon-shield";
    else if (spec.archetype === "neutral" && d < 6) tex = "icon-shield";
    let ic = this.icons.get(a.id);
    if (!tex) {
      ic?.setVisible(false);
      return;
    }
    if (!ic) {
      ic = this.add.image(0, 0, tex);
      this.icons.set(a.id, ic);
    }
    const q = proj(a.x, a.y, this.world.grid.height(a.x, a.y) + Math.max(0.7, spec.r * 2.2 + 0.4) * Math.max(1, spec.scale * 0.9) + (a.hp < a.maxHp ? 0.35 : 0));
    const bob = Math.sin(this.sim.time * 5 + a.id) * 3;
    ic.setTexture(tex).setVisible(true).setPosition(q.x, q.y + bob).setDepth(q.y + 20);
    ic.setScale(tex === "icon-warn" ? 0.55 + (a.state === "windup" ? 0.1 * Math.sin(this.sim.time * 22) : 0) : targeted ? 0.52 : 0.4);
    ic.setAlpha(tex === "icon-food" && !targeted ? 0.7 : 1);
    void v;
  }
  // ---------------------------------------------------------------- events -> feedback
  private dmgNumber(text: string, x: number, y: number, color: string, size: number, life = 0.9, vy = -60, vx = 0) {
    if (this.dmgTexts.length > 22) return;
    const t = this.add
      .text(x, y, text, { fontFamily: "Palatino Linotype, Palatino, Georgia, serif", fontSize: size + "px", color, fontStyle: "bold", stroke: "#10241b", strokeThickness: Math.max(3, size / 6) })
      .setOrigin(0.5)
      .setDepth(2e5);
    this.dmgTexts.push({ t, age: 0, life, vx: this.reduced ? 0 : vx, vy: this.reduced ? -20 : vy });
  }
  private onEvent(e: AdventureEvent) {
    const audio = this.registry.get("audio") as Audio;
    const g = this.world.grid;
    const q = proj(e.x, e.y, g.height(e.x, e.y));
    const fx = this.fx;
    const calm = this.reduced;
    const sim = this.sim;
    const burst = (tex: string, n: number, speed: number, o: { life?: number; tint?: number; g?: number; s0?: number; s1?: number; up?: number; a?: number; blend?: Phaser.BlendModes } = {}) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2,
          s = speed * (0.4 + Math.random() * 0.8);
        fx.spawn(tex, q.x, q.y - 14, { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.55 - (o.up ?? 20), g: o.g ?? 90, life: o.life ?? 0.55, s0: o.s0 ?? 0.5, s1: o.s1 ?? 0.2, tint: o.tint, a: o.a ?? 0.9, spin: Math.random() * 6 - 3, blend: o.blend });
      }
    };
    const ring = (x: number, y: number, r: number, color: number, ms = 600, a = 0.85) => {
      const c = proj(x, y, g.height(x, y));
      const img = this.add.image(c.x, c.y, "fx-ring").setDepth(c.y - 2).setAlpha(a).setScale(0.2, 0.115).setTint(color);
      const s = (r * 80 * 1.414) / 128;
      this.tweens.add({ targets: img, scaleX: s, scaleY: s * 0.577, alpha: 0, duration: calm ? 250 : ms, ease: "Cubic.easeOut", onComplete: () => img.destroy() });
    };
    switch (e.type) {
      case "bite": {
        audio.play(e.kind === "finisher" ? "slam" : "bite", sim.tier + 1);
        const f = e.dir ?? 0;
        const reach = sim.radius + (e.kind === "finisher" ? 1.4 : 0.9);
        const tip = proj(sim.player.x + Math.cos(f) * reach, sim.player.y + Math.sin(f) * reach, g.height(sim.player.x, sim.player.y) + 0.5);
        const slash = this.add.image(tip.x, tip.y, "fx-slash").setDepth(tip.y + 30).setRotation(f * 0.55 - Math.PI * 0.18).setTint(this.attackColor()).setBlendMode(Phaser.BlendModes.ADD).setScale(e.kind === "finisher" ? 1.25 : 0.85).setAlpha(0.9);
        this.tweens.add({ targets: slash, alpha: 0, scale: (e.kind === "finisher" ? 1.25 : 0.85) * 1.35, duration: calm ? 120 : 200, onComplete: () => slash.destroy() });
        break;
      }
      case "hit":
        audio.play(e.crit ? "crit" : "hit");
        this.hitStop = calm ? 0 : e.crit ? 0.07 : 0.045;
        burst("fx-spark", calm ? 3 : e.crit ? 11 : 6, 120, { life: 0.35, s0: 0.5, s1: 0.1, blend: Phaser.BlendModes.ADD, tint: e.crit ? 0xffb347 : undefined });
        if (!calm) this.cameras.main.shake(e.crit ? 90 : 60, e.crit ? 0.0035 : 0.0022);
        break;
      case "dmg": {
        const crit = !!e.crit;
        const amt = Math.round(e.amount ?? 0);
        if (e.kind === "taken") this.dmgNumber("-" + amt, q.x, q.y - 52, "#ff7a6a", 30, 1, -50);
        else if (e.kind === "dot") this.dmgNumber(String(amt), q.x + 10, q.y - 44, "#b9e66a", 20, 0.8, -36);
        else if (e.kind === "arc") this.dmgNumber(String(amt), q.x, q.y - 44, "#9fe0ff", 22, 0.8, -50);
        else this.dmgNumber(crit ? amt + "!" : String(amt), q.x + (Math.random() - 0.5) * 24, q.y - 46, crit ? "#ffb347" : "#fff4d8", crit ? 38 : 25, crit ? 1.1 : 0.85, -64, (Math.random() - 0.5) * 30);
        break;
      }
      case "heal":
        if ((e.amount ?? 0) > 0) this.dmgNumber("+" + e.amount, q.x, q.y - 50, "#8fe39b", 24, 0.9, -50);
        burst("fx-leaf", calm ? 2 : 5, 50, { life: 0.8, tint: 0x9be05c, g: 20 });
        break;
      case "xp":
        if ((e.amount ?? 0) > 0) this.dmgNumber(`+${e.amount} xp`, q.x, q.y - 70, "#ffe08a", 20, 1.1, -34);
        break;
      case "eat":
        audio.play("eat", sim.tier + 1);
        burst("fx-leaf", calm ? 3 : 8, 90, { life: 0.8, g: 140, s0: 0.9, s1: 0.5, tint: 0xb7ee62 });
        if (!this.celebratedCatch && e.reward) {
          this.celebratedCatch = true;
          this.hud.toast(`First catch! · +${e.reward} xp`, "catch");
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
      case "perfect":
        audio.play("perfect");
        this.floater("Perfect dodge!", q.x, q.y - 80, "#9fe0ff");
        burst("fx-spark", calm ? 4 : 14, 150, { life: 0.5, tint: 0x9fe0ff, blend: Phaser.BlendModes.ADD });
        if (!calm) this.slowmo = 0.22;
        break;
      case "roar": {
        audio.play("roar");
        this.zoomPulse = 1;
        if (!calm) this.cameras.main.shake(260, 0.004);
        const color = e.kind === "screech" ? 0xb0e0ff : e.kind === "brace" ? 0x9ad1ff : e.kind === "frenzy" ? 0xff8a5a : 0xfff1c2;
        ring(e.x, e.y, e.radius ?? 6, color, 650);
        if (e.text) this.floater(e.text, q.x, q.y - 70, "#fff0c4");
        break;
      }
      case "skill":
        audio.play("whoosh");
        break;
      case "pounce":
        audio.play(e.kind === "shadow-out" ? "whoosh" : "dodge");
        burst("fx-dust", 8, 90, { life: 0.5, g: 0, a: 0.6, tint: e.kind?.startsWith("shadow") ? 0x6a5acd : undefined });
        if (e.text && e.kind !== "shadow-out") this.floater(e.text, q.x, q.y - 60, "#fff0c4");
        break;
      case "slam": {
        audio.play("slam");
        if (!calm) this.cameras.main.shake(150, 0.004);
        const k = e.kind ?? "circle";
        if (k === "circle" || k === "quake" || k === "shock" || k === "whip" || k === "rally") ring(e.x, e.y, e.radius ?? 3, k === "rally" ? 0x7be08a : k === "shock" ? 0xffe9a8 : 0xffb085, 500);
        else if (k === "sweep" || k === "cone" || k === "slash" || k === "line") {
          const ang = e.dir ?? 0;
          for (let i = 0; i < (calm ? 3 : 8); i++) {
            const r = ((i + 1) / 8) * (e.radius ?? 3);
            const c = proj(e.x + Math.cos(ang) * r, e.y + Math.sin(ang) * r, g.height(e.x, e.y));
            fx.spawn("fx-dust", c.x, c.y, { life: 0.5, s0: 0.5, s1: 1.2, a: 0.6, depth: c.y });
          }
        }
        break;
      }
      case "shot":
        audio.play("spit");
        break;
      case "impact":
        burst("fx-soft", calm ? 2 : 6, 70, { life: 0.35, tint: e.kind === "spit" ? 0x9be05c : e.kind === "amber" ? 0xffc34d : 0xc8a070, a: 0.7 });
        break;
      case "tell": {
        audio.play("tell");
        const a = sim.actors.find((x) => x.id === e.actor);
        if (a) {
          const c = this.toCss(q.x, q.y - 130);
          this.hud.callout("tell" + a.id, (e.text ?? "Attack") + " · punish the recovery", c.x, c.y, "danger");
          this.calloutUntil.set("tell" + a.id, sim.time + 1.4);
        }
        break;
      }
      case "notice":
        if (e.text) {
          audio.play("nope");
          this.hud.toast(e.text, "hint");
        }
        break;
      case "bounce":
        audio.play("nope");
        if (e.text) this.hud.toast(e.text);
        break;
      case "stagger":
        audio.play("hit");
        if (e.text) this.floater(e.text, q.x, q.y - 70, "#ffd9a8");
        break;
      case "status":
        burst("fx-soft", calm ? 2 : 5, 40, { life: 0.6, tint: e.kind === "bleed" ? 0xff4a4a : e.kind === "poison" ? 0x9be05c : e.kind === "shock" ? 0x9fe0ff : 0x8fd2ff, a: 0.8, g: 10 });
        break;
      case "decoy":
        burst("fx-soft", 8, 60, { life: 0.8, tint: 0xc58bff, a: 0.7 });
        break;
      case "grow":
        if (e.kind === "feast") {
          audio.play("eat", 3);
          this.floater(e.text ?? "Feast", q.x, q.y - 80, "#c8f090");
          break;
        }
        audio.play("grow", sim.tier + 1);
        this.zoomPulse = 1;
        this.hud.announce(e.text ?? "You grew!", "Your body has changed. New reach, new strength.", "levelup");
        if (!calm) this.cameras.main.shake(300, 0.004);
        burst("fx-spark", calm ? 8 : 26, 220, { life: 1.0, s0: 0.9, s1: 0.2, g: 40, blend: Phaser.BlendModes.ADD });
        ring(e.x, e.y, 5, 0xffe08a, 900, 0.9);
        this.persist();
        break;
      case "levelup": {
        audio.play("levelup");
        this.zoomPulse = 1;
        const pts = sim.skillPoints;
        this.hud.announce(`Level ${e.amount}`, pts > 0 ? `${pts} skill point${pts === 1 ? "" : "s"} to spend · press O` : "Stronger every step", "levelup");
        burst("fx-spark", calm ? 8 : 24, 200, { life: 1.0, s0: 0.9, s1: 0.2, g: 40, blend: Phaser.BlendModes.ADD });
        ring(sim.player.x, sim.player.y, 5, 0xffe08a, 900, 0.9);
        this.persist();
        break;
      }
      case "discovery":
        audio.play("grow", 1);
        burst("fx-spark", calm ? 4 : 12, 110, { life: 0.9, g: 30, blend: Phaser.BlendModes.ADD });
        if (e.text) this.hud.toast(e.text + (e.reward ? ` · +${e.reward} xp` : ""), e.reward ? "reward" : "study");
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
        if (e.kind === "kill") break;
        audio.play("grow", 3);
        if (e.text) this.hud.toast(e.text, "grow");
        if (e.kind === "boss") this.hud.announce(e.text ?? "Victory", "Loot dropped nearby", "questdone");
        this.persist();
        break;
      case "phase":
        audio.play("phase");
        if (!calm) this.cameras.main.shake(400, 0.006);
        this.hud.announce(e.text ?? "The boss changes tactics", "", "phase");
        break;
      case "loot":
        // a drop appeared; the pickup event plays the fanfare
        break;
      case "pickup": {
        if (e.kind === "amber") {
          audio.play("amber");
          this.dmgNumber(`+${e.amount} amber`, q.x, q.y - 40, "#ffcf75", 20, 0.9, -40);
        } else {
          const r = (e.rarity ?? "common") as Rarity;
          audio.play("loot-" + r);
          this.hud.toast(`${e.text}`, r === "common" ? "reward" : "loot-" + r);
          burst("fx-spark", calm ? 4 : r === "legendary" ? 22 : 10, 120, { life: 0.8, tint: RARITY_TINT[r], blend: Phaser.BlendModes.ADD });
          window.dispatchEvent(new CustomEvent("rex-adventure-loot", { detail: { id: e.id } }));
        }
        this.persist();
        break;
      }
      case "salvage":
        audio.play("amber");
        break;
      case "combo":
        if (!calm) this.cameras.main.shake(110, 0.004);
        break;
      case "quest":
        audio.play("quest");
        if (e.text) this.hud.toast(e.text, "quest");
        this.persist();
        break;
      case "questdone":
        audio.play("questdone");
        this.hud.announce("Quest complete", e.text ?? "", "questdone");
        burst("fx-spark", calm ? 6 : 22, 180, { life: 1.0, g: 40, blend: Phaser.BlendModes.ADD, tint: 0x9be05c });
        this.persist();
        break;
      case "world":
        if (e.id && !e.kind) this.persist();
        break;
      case "hazard":
        if (e.text) this.hud.toast(e.text, "bad");
        if (e.kind === "steam-burst") burst("fx-soft", calm ? 4 : 14, 90, { life: 0.8, tint: 0xeef6f6, a: 0.7, up: 60, g: -10 });
        break;
      case "defeat":
        audio.play("shrink");
        this.flash("rgba(10,20,14,0.6)");
        if (e.text) this.hud.toast(e.text, "bad");
        this.snapCamera();
        this.persist();
        break;
      default:
        break;
    }
  }
  private attackColor() {
    const c = this.sim.d.effects;
    if (c.razorTalons || c.bleed) return 0xff7a6a;
    if (c.venomBurst || c.poison) return 0x9be05c;
    if (c.shock) return 0x9fe0ff;
    return 0xfff1c2;
  }
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
    for (let i = this.dmgTexts.length - 1; i >= 0; i--) {
      const d = this.dmgTexts[i];
      d.age += dt;
      d.t.x += d.vx * dt;
      d.t.y += d.vy * dt;
      d.vy *= Math.pow(0.12, dt);
      const k = d.age / d.life;
      d.t.setAlpha(k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3));
      d.t.setScale(k < 0.12 ? 0.6 + k * 5 : 1);
      if (d.age >= d.life) {
        d.t.destroy();
        this.dmgTexts.splice(i, 1);
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
  private hudState(): HudState {
    const s = this.sim;
    const spec = DINOS[s.dino];
    const cdOf = (t: number, max: number) => (max > 0 ? Math.min(1, t / max) : 0);
    const skillOf = (slot: 0 | 1) => {
      const sk = s.skillAt(slot);
      if (slot === 1 && s.level < 5) return { name: "", icon: "lock", locked: true, hidden: false, cd: 0, note: "Lv 5" };
      if (!sk) return { name: "", icon: "", locked: false, hidden: true, cd: 0 };
      return { name: sk.name, icon: sk.icon, locked: false, hidden: false, cd: cdOf(s.skillCd[slot], s.skillMax[slot]) };
    };
    const p = s.player;
    const statuses: { id: string; label: string }[] = [];
    if (p.venom) statuses.push({ id: "poison", label: "Venom" });
    if (p.brace) statuses.push({ id: "brace", label: "Brace" });
    if (p.frenzy > 0) statuses.push({ id: "frenzy", label: "Frenzy" });
    if (p.bellow > 0) statuses.push({ id: "brace", label: "Rallied" });
    if (p.lastStandT > 0) statuses.push({ id: "star", label: "Last Stand" });
    if (p.perfectT > 0) statuses.push({ id: "star", label: "Counter" });
    if (p.slow) statuses.push({ id: "mark", label: "Slowed" });
    const boss = s.actors.find((a) => a.spec.boss && a.state !== "dead" && a.state !== "dormant" && a.state !== "idle" && dist(a, p) < 28 && a.state !== "return");
    const q = s.quests.tracker();
    const ready = s.dodgeCds.filter((c) => c === 0).length;
    const nextCd = Math.min(...s.dodgeCds);
    return {
      name: s.save.name,
      species: s.dino,
      level: s.level,
      stageName: STAGE_NAMES[s.tier],
      hp: Math.max(0, p.hp),
      maxHp: s.d.maxHp,
      xp: s.xpBar,
      feast: s.feast.stacks,
      amber: s.save.amber,
      region: byRegion(s.region).name,
      quest: q ? { title: q.quest, text: q.text, dist: q.target && dist(q.target, p) > 8 ? dist(q.target, p) : null } : null,
      dodge: { cd: ready > 0 ? 0 : Math.min(1, nextCd / Math.max(0.1, s.d.dodgeCd)), charges: ready, max: s.dodgeCds.length },
      combo: { n: p.pose === "bite" || p.comboT > 0 ? p.combo + 1 : 0, chain: s.d.chain },
      skills: [skillOf(0), skillOf(1)],
      interact: s.interactLabel ? `${s.interactLabel}` : null,
      boss: boss ? { name: boss.spec.name, hp: boss.hp, max: boss.maxHp, phase: boss.phase, phases: boss.spec.boss!.phases.length, title: boss.spec.boss!.title } : null,
      statuses,
      portrait: () => this.portrait(),
    };
  }
  private updateHud(dt: number) {
    const s = this.sim;
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
      this.hud.callout(id, `${a.atk?.name ?? "Attack"} · punish the recovery`, c.x, c.y, "danger");
    }
    // vulnerable window prompt
    for (const a of s.actors) {
      if ((a.state === "recover" || a.state === "stagger") && a.spec.role !== "prey" && !a.npc && dist(a, s.player) < 12) {
        const q = proj(a.x, a.y, this.world.grid.height(a.x, a.y) + a.spec.r * 2.4 + 0.8);
        const c = this.toCss(q.x, q.y);
        this.hud.callout("rec" + a.id, "Exposed · strike now", c.x, c.y, "good");
      }
    }
    for (const gate of GATES) {
      if (s.save.gates.includes(gate.id) || dist(gate, s.player) > 10) continue;
      const q = proj(gate.x, gate.y, this.world.grid.height(gate.x, gate.y) + 1.2);
      const c = this.toCss(q.x, q.y);
      const requirement = s.tier < gate.requiredStage ? `${STAGE_NAMES[gate.requiredStage]} needed` : gate.id === "trike-rubble" ? "Triceratops · charge the rubble" : gate.id === "raptor-roots" ? "Raptor root passage" : gate.kind === "breakable" ? "Attack to clear the route" : "Cross the shallow ford";
      this.hud.callout("gate-" + gate.id, `${gate.name} · ${requirement}`, c.x, c.y, "good");
    }
    this.hud.endCallouts();
    const pts = s.skillPoints;
    this.hud.setSkillPip(pts > 0);
    this.lastPoints = pts;
    this.hud.update(this.hudState(), dt);
    this.mapTimer -= dt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 0.12;
      const mk: MapMarker[] = [{ x: s.player.x, y: s.player.y, kind: "player", face: s.player.face }];
      for (const a of s.actors) {
        if (a.state === "dead" || dist(a, s.player) > 40) continue;
        if (a.npc && !a.follow) mk.push({ x: a.x, y: a.y, kind: "npc" });
        else if (a.spec.role !== "prey" && a.spec.archetype !== "neutral" && !a.npc && a.state !== "dormant") mk.push({ x: a.x, y: a.y, kind: "threat" });
      }
      for (const r of REGIONS) if (r.built) mk.push({ x: r.nest.x, y: r.nest.y, kind: "nest" });
      for (const d of DISCOVERIES) if (d.kind !== "forage" && !s.save.discoveries.includes(d.id) && dist(d, s.player) < 30) mk.push({ x: d.x, y: d.y, kind: "find" });
      for (const d of s.drops) if (d.mutation && dist(d, s.player) < 30) mk.push({ x: d.x, y: d.y, kind: "loot" });
      for (const portal of PORTALS) {
        if (dist(portal, s.player) < 40) mk.push({ x: portal.x, y: portal.y, kind: "goal" });
        if (portal.bidirectional && dist(portal.to, s.player) < 40) mk.push({ x: portal.to.x, y: portal.to.y, kind: "goal" });
      }
      const goal = s.objectiveTarget;
      if (goal && dist(goal, s.player) > 7) mk.push({ x: goal.x, y: goal.y, kind: "goal" });
      this.hud.drawMap(s.player.x, s.player.y, mk, this.route);
    }
  }
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
    const saved = this.store.save(this.profileId, this.sim.checkpoint());
    this.lastSave = this.sim.time;
    window.dispatchEvent(new CustomEvent("rex-adventure-save", { detail: { id: this.profileId, book: this.store.read(this.profileId), character: saved.id } }));
  }
  requestPause() {
    if (this.scene.isPaused() || !this.ready) return;
    this.stick = { x: 0, y: 0, mag: 0 };
    this.stickPointer = null;
    this.hud.stick(0, 0, false);
    this.held = { bite: false, dodge: false, skillA: false, skillB: false };
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
      level: this.sim.level,
      region: this.sim.region,
      hp: this.sim.player.hp,
      maxHp: this.sim.d.maxHp,
      xp: this.sim.save.xp,
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
  if (a.spec.tint !== undefined) return a.spec.tint;
  if (a.rival) return 0xffe2d6;
  return 0xffffff;
}
void hex;
void idleInput;
