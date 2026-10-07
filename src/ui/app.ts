import { leaderboardMarkup } from "./screens/leaderboard";
import { bookMarkup } from "./screens/book";
import { mapMarkup } from "./screens/map";
import * as Phaser from "phaser";
import { SPECIES, STAGE_NAME } from "../game/content";
import { SaveStore, type Profile } from "../platform/storage";
import { connectSync } from "../platform/sync";
import { Audio } from "../platform/audio";
import { PlayScene } from "../scenes/PlayScene";
import type { Result } from "../game/types";
import { esc } from "./markup";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export class App {
  private ui = document.getElementById("ui")!;
  private profile: Profile | null = null;
  private screen = "splash";
  private world = 0;
  private syncStatus = "Saves on this device";
  private install?: InstallEvent;
  readonly store = new SaveStore();
  readonly audio = new Audio();
  constructor(private game: Phaser.Game) {
    this.audio.enabled = this.store.settings.sound !== false;
    game.registry.set("audio", this.audio);
    game.registry.set("reducedMotion", this.reducedMotion);
    window.addEventListener("rex-ready", () => this.splash());
    window.addEventListener("rex-pause", () => this.pause());
    window.addEventListener("rex-end", ((e: CustomEvent<Result>) =>
      this.results(e.detail)) as EventListener);
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.install = e as InstallEvent;
    });
    this.store.onChange = () => {
      if (this.screen === "map") this.map();
      else if (this.screen === "profiles") this.profiles();
    };
    this.ui.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-action]",
      );
      if (!button || button.disabled) return;
      this.audio.unlock();
      this.audio.play("click");
      this.action(button.dataset.action!, button.dataset.value);
    });
    // A live system setting change restarts decorative animation without touching rules.
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
      "change",
      () => {
        game.registry.set("reducedMotion", this.reducedMotion);
        document.body.classList.toggle("reduced-motion", this.reducedMotion);
        if (game.scene.isActive("Menu")) game.scene.start("Menu");
      },
    );
    if (game.registry.get("ready")) this.splash();
    else
      this.shell(
        "loading",
        '<div class="loading-screen"><p class="eyebrow">TINY REX</p><h1>Your valley is waking up…</h1><p>Planting ferns. Hatching dinosaurs.</p></div>',
      );
    void connectSync(this.store, (s) => {
      this.syncStatus = s;
      const badge = document.querySelector("[data-sync]");
      if (badge) badge.textContent = s;
    });
  }
  private get reducedMotion() {
    return (
      this.store.settings.motion === false ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }
  private button(
    label: string,
    action: string,
    value?: string,
    classes = "",
    disabled = false,
  ) {
    return `<button class="button ${classes}" data-action="${action}" ${value === undefined ? "" : `data-value="${esc(value)}"`} ${disabled ? "disabled" : ""}>${label}</button>`;
  }
  private shell(screen: string, content: string) {
    this.screen = screen;
    this.ui.className = screen;
    document.body.dataset.screen = screen;
    this.ui.innerHTML = content;
    this.ui.scrollTop = 0;
    const heading = this.ui.querySelector<HTMLElement>("h1,h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }
  private nav() {
    return `<nav>${this.button("Feast", "map", undefined, "quiet")}${this.button("Dino Book", "book", undefined, "quiet")}${this.button("Family", "leaderboard", undefined, "quiet")}</nav>`;
  }
  private top(title: string, subtitle: string) {
    return `<header class="page-heading"><div><p class="eyebrow">TINY REX · ENDLESS FEAST</p><h1>${title}</h1><p>${subtitle}</p></div>${this.button("←", "map", undefined, "icon quiet")}</header>`;
  }
  private footer() {
    return `<footer><span data-sync>${esc(this.syncStatus)}</span>${this.button(this.audio.enabled ? "Sound on" : "Sound off", "sound", undefined, "quiet small")}${this.button("Help & install", "help", undefined, "quiet small")}</footer>`;
  }
  splash() {
    this.game.scene.stop("Play");
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    const last = this.store.profiles.find(
      (p) => p.id === this.store.settings.lastProfile,
    );
    this.shell(
      "splash",
      `<div class="splash-content"><p class="eyebrow">A LITTLE DINOSAUR. A VERY BIG ADVENTURE.</p><h1 class="wordmark">TINY <span>REX</span></h1><p class="tagline">Eat small. Grow mighty.</p><div class="hero-space" aria-hidden="true"></div><div class="splash-bottom"><p>Four wild valleys. One endless feast.<br>How mighty can your little Rex become?</p>${last ? this.button("Keep going as " + esc(last.name), "select", last.id, "primary big") : this.button("Start hatching →", "profiles", undefined, "primary big")}${last ? this.button("Choose a player", "profiles", undefined, "quiet") : ""}<p class="hint">Tap or drag to run · Arrow keys or WASD</p>${this.footer()}</div></div>`,
    );
  }
  profiles() {
    this.game.scene.stop("Play");
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    this.shell(
      "profiles",
      `<section class="panel">${this.top("Who’s hatching?", "Your best feasts and discoveries stay with you.")}<div class="profile-list">${this.store.profiles.map((p) => this.button(`<span class="avatar">${esc(p.avatar)}</span><span><b>${esc(p.name)}</b><small>${this.store.progress(p.id).feastBest.toLocaleString()} best score · ${Object.keys(this.store.progress(p.id).met).length} discoveries${p.pin ? " · PIN protected" : ""}</small></span> →`, "select", p.id, "profile")).join("")}</div>${this.button("+ New hatchling", "new", undefined, "primary")}${this.button("Back", "splash", undefined, "quiet")}${this.footer()}</section>`,
    );
  }
  private select(id: string) {
    const profile = this.store.profiles.find((p) => p.id === id);
    if (!profile) return;
    if (profile.pin) {
      this.modal(
        `<h2>Welcome back, ${esc(profile.name)}</h2><p>Enter your family PIN.</p><form id="pin-form"><label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"></label><p class="form-error" role="alert"></p><button class="button primary">Let’s go →</button></form>${this.button("Cancel", "close", undefined, "quiet")}`,
      );
      document.querySelector<HTMLFormElement>("#pin-form")!.onsubmit = (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        if (new FormData(form).get("pin") !== profile.pin) {
          form.querySelector(".form-error")!.textContent =
            "That PIN doesn’t match. Try again.";
          return;
        }
        this.enter(profile);
      };
    } else this.enter(profile);
  }
  private enter(p: Profile) {
    this.profile = p;
    this.store.write("settings", { ...this.store.settings, lastProfile: p.id });
    this.map();
  }
  private newProfile() {
    this.modal(
      `<p class="eyebrow">YOUR ADVENTURE STARTS HERE</p><h2>A new hatchling</h2><form id="profile-form"><label>Your name<input name="name" maxlength="24" required autocomplete="off" placeholder="What should Rex call you?"></label><label>Your avatar<select name="avatar">${["🦖", "🦕", "🐊", "🦎", "🐢", "🐉", "🦊", "🐻", "🦉", "⭐"].map((a) => `<option>${a}</option>`).join("")}</select></label><label>Family PIN <small>Optional · four digits</small><input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" type="password" autocomplete="off"></label><p class="form-error" role="alert"></p><button class="button primary">Start my adventure →</button></form>${this.button("Cancel", "close", undefined, "quiet")}`,
    );
    document.querySelector<HTMLFormElement>("#profile-form")!.onsubmit = (
      e,
    ) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement,
        data = new FormData(form),
        name = String(data.get("name")).trim();
      if (!name) {
        form.querySelector(".form-error")!.textContent =
          "Please give your hatchling a name.";
        return;
      }
      const p = this.store.add(
        name,
        String(data.get("avatar")),
        String(data.get("pin")) || null,
      );
      this.enter(p);
    };
  }
  map() {
    if (!this.profile) return this.profiles();
    this.game.scene.stop("Play");
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    const progress = this.store.progress(this.profile.id);
    this.shell(
      "map",
      mapMarkup(
        this.profile,
        progress,
        this.world,
        this.button.bind(this),
        this.nav(),
        this.footer(),
      ),
    );
  }
  private start(level: number | null) {
    if (!this.profile) return;
    this.game.registry.set("reducedMotion", this.reducedMotion);
    this.game.scene.stop("Menu");
    this.game.scene.stop("Play");
    this.shell(
      "playing",
      `<div class="play-controls">${this.button("Ⅱ Pause", "pause", undefined, "quiet")}${this.button(this.audio.enabled ? "♪ Sound on" : "♪ Sound off", "sound", undefined, "quiet")}</div>`,
    );
    this.game.scene.start("Play", { level: null, world: this.world });
    document.getElementById("stage")!.focus();
  }
  private pause() {
    this.modal(
      `<p class="eyebrow">TAKE A BREATHER</p><h2>Your valley can wait.</h2><p>Rex is resting right where you left her.</p>${this.button("Keep feasting →", "resume", undefined, "primary big")}${this.button("Start a fresh feast", "restart", undefined, "quiet")}${this.button("Back to feast", "quit", undefined, "quiet")}`,
    );
  }
  private results(res: Result) {
    if (!this.profile) return;
    const progress = this.store.record(this.profile.id, res);
    this.game.scene.stop("Play");
    this.game.scene.start("Menu");
    this.shell(
      "results",
      `<section class="result-panel"><p class="eyebrow">ENDLESS FEAST</p><h1>What a feast!</h1><div class="hero-space" aria-hidden="true"></div><div class="result-score">${res.score.toLocaleString()}<small>POINTS</small></div><div class="result-stats"><span><b>${res.catches}</b> things eaten</span><span><b>${res.wave + 1}</b> wave reached</span><span><b>${STAGE_NAME[res.tier]}</b> final size</span></div><p class="result-note">Personal best: ${progress.feastBest.toLocaleString()} · ${Math.floor(res.elapsed / 60)}:${String(res.elapsed % 60).padStart(2, "0")} survived</p>${this.button("Feast again →", "feast", undefined, "primary big")}${this.button("Back to feast", "map", undefined, "quiet")}${this.footer()}</section>`,
    );
  }

  private book() {
    if (!this.profile) return;
    const p = this.store.progress(this.profile.id);
    this.shell(
      "book",
      bookMarkup(
        p,
        this.button.bind(this),
        this.nav(),
        this.footer(),
        this.top(
          "The Dino Book",
          Object.keys(p.met).length +
            " of " +
            SPECIES.length +
            " discoveries. Meet them to reveal their story.",
        ),
      ),
    );
    for (const element of this.ui.querySelectorAll<HTMLElement>(
      "[data-species]",
    )) {
      const id = element.dataset.species;
      if (!id) continue;
      const texture = this.game.textures.get("animal-" + id),
        frame = texture.get("0"),
        source = texture.getSourceImage() as HTMLCanvasElement;
      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 160;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(
        source,
        frame.cutX,
        frame.cutY,
        frame.cutWidth,
        frame.cutHeight,
        0,
        0,
        160,
        160,
      );
      element.append(canvas);
    }
  }
  private leaderboard() {
    const rows = this.store.profiles
      .map((p) => ({ p, progress: this.store.progress(p.id) }))
      .sort(
        (a, b) =>
          b.progress.feastBest - a.progress.feastBest ||
          b.progress.feastTier - a.progress.feastTier,
      );
    this.shell(
      "leaderboard",
      leaderboardMarkup(
        rows,
        this.profile,
        this.button.bind(this),
        this.nav(),
        this.footer(),
        this.top(
          "The family feast",
          "A little friendly competition. Your biggest feast takes the crown.",
        ),
      ),
    );
  }
  private modal(content: string) {
    document.querySelector(".modal-backdrop")?.remove();
    const div = document.createElement("div");
    div.className = "modal-backdrop";
    div.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="Tiny Rex">${content}</section>`;
    this.ui.append(div);
    const focus = div.querySelector<HTMLElement>("input,button");
    focus?.focus();
    div.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.screen === "playing") this.action("resume");
        else this.action("close");
      }
      if (e.key === "Tab") {
        const nodes = [
          ...div.querySelectorAll<HTMLElement>("input,select,button"),
        ];
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
          e.preventDefault();
          nodes[0]?.focus();
        }
      }
    });
  }
  private help() {
    this.modal(
      `<p class="eyebrow">THE ONE QUESTION</p><h2>Is it smaller than you?</h2><div class="help-rules"><p>🟡 <b>Smaller:</b> dinner. Fill your belly and grow.</p><p>🟢 <b>Same size:</b> safe. Bump noses and carry on.</p><p>🔴 <b>Bigger:</b> run! A red ring warns you up close.</p><p>🛡 <b>Spiky:</b> never food, at any size.</p></div><p>Tap a spot or drag to move. Arrow keys or WASD work too. Escape pauses. Keep eating to grow. Your belly drains as the waves get wilder.</p><p>Install on iPad: Safari → Share → Add to Home Screen. Once loaded, feasts work offline. Family saves sync when connected.</p>${this.install ? this.button("Install Tiny Rex", "install", undefined, "primary") : ""}${this.button(this.reducedMotion ? "Decorative motion off" : "Decorative motion on", "motion", undefined, "quiet")}${this.button("Got it", "close", undefined, "primary")}`,
    );
  }
  private action(action: string, value?: string) {
    const play = () => this.game.scene.getScene("Play") as PlayScene;
    switch (action) {
      case "splash":
        this.splash();
        break;
      case "profiles":
        this.profiles();
        break;
      case "map":
        this.map();
        break;
      case "select":
        this.select(value!);
        break;
      case "new":
        this.newProfile();
        break;
      case "world":
        this.world = Number(value);
        this.map();
        break;
      case "start":
        this.start(null);
        break;
      case "feast":
        this.start(null);
        break;
      case "pause":
        play().requestPause();
        break;
      case "resume":
        document.querySelector(".modal-backdrop")?.remove();
        play().resumeRun();
        break;
      case "restart":
        this.start(play().sim.level?.idx ?? null);
        break;
      case "quit": {
        const res = play().sim.end(false, "quit");
        if (res && this.profile) this.store.record(this.profile.id, res);
        this.map();
        break;
      }
      case "close":
        document.querySelector(".modal-backdrop")?.remove();
        break;
      case "book":
        this.book();
        break;
      case "leaderboard":
        this.leaderboard();
        break;
      case "help":
        this.help();
        break;
      case "sound":
        this.audio.enabled = !this.audio.enabled;
        this.store.write("settings", {
          ...this.store.settings,
          sound: this.audio.enabled,
        });
        for (const el of this.ui.querySelectorAll('[data-action="sound"]'))
          el.textContent = this.audio.enabled ? "♪ Sound on" : "♪ Sound off";
        break;
      case "motion":
        this.store.write("settings", {
          ...this.store.settings,
          motion: !this.reducedMotion,
        });
        this.game.registry.set("reducedMotion", this.reducedMotion);
        document.body.classList.toggle("reduced-motion", this.reducedMotion);
        if (this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
        this.help();
        break;
      case "install":
        void this.install?.prompt();
        break;
    }
  }
}
