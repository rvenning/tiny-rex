import * as Phaser from "phaser";
import { SaveStore, type Profile } from "../platform/storage";
import { connectSync } from "../platform/sync";
import { Audio } from "../platform/audio";
import { esc } from "./markup";
import { AVATARS, matchesProfilePin } from "../platform/validation";
import type { AdventureScene } from "../scenes/AdventureScene";
import { AdventureStore, type AdventureSave } from "../adventure/save";
import { CREATURES, DINOS, DINO_NAMES, DISCOVERIES, REGIONS, STAGES, type Dino } from "../adventure/data";
import type { World } from "../world/world";
import { worldMap } from "./screens/world-map";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const stageOf = (s: AdventureSave) => {
  const d = s.snapshot.dino;
  const x = s.xp[d];
  return x >= 90 ? 3 : x >= 30 ? 2 : x >= 8 ? 1 : 0;
};
export class App {
  private ui = document.getElementById("ui")!;
  private profile: Profile | null = null;
  private screen = "splash";
  private syncStatus = "Saves on this device";
  private install?: InstallEvent;
  readonly store = new SaveStore();
  readonly audio = new Audio();
  readonly adventures = new AdventureStore();
  constructor(private game: Phaser.Game) {
    this.audio.enabled = this.store.settings.sound !== false;
    game.registry.set("audio", this.audio);
    game.registry.set("reducedMotion", this.reducedMotion);
    document.body.classList.toggle("reduced-motion", this.reducedMotion);
    window.addEventListener("rex-ready", () => this.splash());
    window.addEventListener("rex-failed", () =>
      this.shell("loading", '<div class="loading-screen"><p class="eyebrow">TINY REX</p><h1>The valley would not wake.</h1><p>Check your connection and reload.</p></div>'),
    );
    window.addEventListener("rex-adventure-pause", () => this.adventurePause());
    window.addEventListener("rex-adventure-journal", () => this.adventureJournal());
    window.addEventListener("rex-adventure-nest", () => this.adventureNest());
    window.addEventListener("rex-adventure-save", ((event: CustomEvent) => this.store.onSave("adventure_v1_" + event.detail.id, event.detail.save)) as EventListener);
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.install = e as InstallEvent;
    });
    this.store.onChange = () => {
      if (this.screen === "profiles") this.profiles();
    };
    this.ui.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (!button || button.disabled) return;
      this.audio.unlock();
      this.audio.play("click");
      this.action(button.dataset.action!, button.dataset.value);
    });
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", () => {
      game.registry.set("reducedMotion", this.reducedMotion);
      document.body.classList.toggle("reduced-motion", this.reducedMotion);
    });
    if (game.registry.get("ready")) this.splash();
    else this.shell("loading", '<div class="loading-screen"><p class="eyebrow">TINY REX</p><h1>Your valley is waking up…</h1><p>Planting ferns. Hatching dinosaurs.</p></div>');
    void connectSync(this.store, (s) => {
      this.syncStatus = s;
      const badge = document.querySelector("[data-sync]");
      if (badge) badge.textContent = s;
    });
  }
  private get reducedMotion() {
    return this.store.settings.motion === false || matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  private get world() {
    return this.game.registry.get("world") as World;
  }
  private button(label: string, action: string, value?: string, classes = "", disabled = false) {
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
  private footer() {
    return `<footer><span data-sync>${esc(this.syncStatus)}</span>${this.button(this.audio.enabled ? "Sound on" : "Sound off", "sound", undefined, "quiet small")}${this.button("Help & install", "help", undefined, "quiet small")}</footer>`;
  }
  private summary(p: Profile) {
    const a = this.adventures.read(p.id);
    const fossils = a.discoveries.filter((d) => d.startsWith("fossil")).length;
    return `${STAGES[stageOf(a)]} ${DINO_NAMES[a.snapshot.dino]} · ${a.regions.length} region${a.regions.length === 1 ? "" : "s"} · ${fossils} fossil${fossils === 1 ? "" : "s"}`;
  }
  // ---------------------------------------------------------------- home
  splash() {
    this.stopAdventure();
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    const last = this.store.profiles.find((p) => p.id === this.store.settings.lastProfile);
    this.shell(
      "splash",
      `<div class="splash-content"><p class="eyebrow">A LITTLE DINOSAUR. A VERY BIG WORLD.</p><h1 class="wordmark">TINY <span>REX</span></h1><p class="tagline">Hunt. Grow. Explore.</p><div class="splash-bottom">${last ? this.button("Continue as " + esc(last.name) + " →", "select", last.id, "primary big") + `<p class="hint">${esc(this.summary(last))}</p>` : this.button("Start hatching →", "profiles", undefined, "primary big")}${last ? this.button("Choose a player", "profiles", undefined, "quiet") : ""}${this.footer()}</div></div>`,
    );
  }
  profiles() {
    this.stopAdventure();
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    this.shell(
      "profiles",
      `<section class="panel"><header class="page-heading"><div><p class="eyebrow">TINY REX</p><h1>Who’s hatching?</h1><p>Your growth, fossils and species stay with you.</p></div></header><div class="profile-list">${this.store.profiles.map((p) => this.button(`<span class="avatar">${esc(p.avatar)}</span><span><b>${esc(p.name)}</b><small>${esc(this.summary(p))}${p.pin ? " · PIN protected" : ""}</small></span> →`, "select", p.id, "profile")).join("")}</div>${this.button("+ New hatchling", "new", undefined, "primary")}${this.button("Back", "splash", undefined, "quiet")}${this.footer()}</section>`,
    );
  }
  private select(id: string) {
    const profile = this.store.profiles.find((p) => p.id === id);
    if (!profile) return;
    if (profile.pin) {
      this.modal(`<h2>Welcome back, ${esc(profile.name)}</h2><p>Enter your family PIN.</p><form id="pin-form"><label>PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off"></label><p class="form-error" role="alert"></p><button class="button primary">Let’s go →</button></form>${this.button("Cancel", "close", undefined, "quiet")}`);
      document.querySelector<HTMLFormElement>("#pin-form")!.onsubmit = (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        if (!matchesProfilePin(profile, String(new FormData(form).get("pin")))) {
          form.querySelector(".form-error")!.textContent = "That PIN doesn’t match. Try again.";
          return;
        }
        this.enter(profile);
      };
    } else this.enter(profile);
  }
  private enter(p: Profile) {
    this.profile = p;
    this.store.write("settings", { ...this.store.settings, lastProfile: p.id });
    this.startAdventure();
  }
  private newProfile() {
    this.modal(
      `<p class="eyebrow">YOUR ADVENTURE STARTS HERE</p><h2>A new hatchling</h2><form id="profile-form"><label>Your name<input name="name" maxlength="24" required autocomplete="off" placeholder="What should Rex call you?"></label><label>Your avatar<select name="avatar">${AVATARS.map((a) => `<option>${a}</option>`).join("")}</select></label><label>Family PIN <small>Optional · four digits</small><input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" type="password" autocomplete="off"></label><p class="form-error" role="alert"></p><button class="button primary">Start my adventure →</button></form>${this.button("Cancel", "close", undefined, "quiet")}`,
    );
    document.querySelector<HTMLFormElement>("#profile-form")!.onsubmit = (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement,
        data = new FormData(form),
        name = String(data.get("name")).trim();
      if (!name) {
        form.querySelector(".form-error")!.textContent = "Please give your hatchling a name.";
        return;
      }
      this.enter(this.store.add(name, String(data.get("avatar")), String(data.get("pin")) || null));
    };
  }
  private modal(content: string) {
    document.querySelector(".modal-backdrop")?.remove();
    const div = document.createElement("div");
    div.className = "modal-backdrop";
    div.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="Tiny Rex">${content}</section>`;
    this.ui.append(div);
    div.querySelector<HTMLElement>("input,button")?.focus();
    div.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.screen === "adventure") this.action("adventure-resume");
        else this.action("close");
      }
      if (e.key === "Tab") {
        const nodes = [...div.querySelectorAll<HTMLElement>("input,select,button")];
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
      `<p class="eyebrow">HOW TO HUNT</p><h2>Read the hunt.</h2><div class="help-rules"><p><b>Stalk.</b> Prey notices you when you run. Creep (hold Shift, or push the stick gently) and bite when you are close.</p><p><b>Read the tell.</b> A red fan on the ground shows where a hunter will strike, and the inner fan shows when.</p><p><b>Dodge, then bite.</b> A hunter that misses is helpless for a moment. That is your window.</p><p><b>Grow.</b> Food and discoveries fill your growth bar. Growing changes your bite, speed and the routes you can break open.</p></div><p>Move with WASD / arrows or the left thumb. J bites, Space dodges, E uses your species skill, Enter rests at a nest, Escape pauses.</p><p>Install on iPad: Safari → Share → Add to Home Screen. PINs are convenience locks, not private passwords.</p>${this.install ? this.button("Install Tiny Rex", "install", undefined, "primary") : ""}${this.button(this.reducedMotion ? "Decorative motion off" : "Decorative motion on", "motion", undefined, "quiet")}${this.button("Got it", "close", undefined, "primary")}`,
    );
  }
  private action(action: string, value?: string) {
    switch (action) {
      case "adventure-resume":
        document.querySelector(".modal-backdrop")?.remove();
        this.adventureScene().resumeAdventure();
        break;
      case "adventure-journal":
        this.adventureJournal();
        break;
      case "adventure-nest":
        this.adventureNest();
        break;
      case "adventure-species":
        this.adventureScene().sim.switchSpecies(value as Dino);
        this.adventureScene().persist();
        this.adventureNest();
        break;
      case "adventure-assist":
        this.adventureScene().sim.save.assist = !this.adventureScene().sim.save.assist;
        this.adventureScene().persist();
        this.adventurePause();
        break;
      case "adventure-quit":
        this.splash();
        break;
      case "splash":
        this.splash();
        break;
      case "profiles":
        this.profiles();
        break;
      case "select":
        this.select(value!);
        break;
      case "new":
        this.newProfile();
        break;
      case "close":
        document.querySelector(".modal-backdrop")?.remove();
        break;
      case "help":
        this.help();
        break;
      case "sound":
        this.audio.enabled = !this.audio.enabled;
        this.store.write("settings", { ...this.store.settings, sound: this.audio.enabled });
        for (const el of this.ui.querySelectorAll('[data-action="sound"]')) el.textContent = this.audio.enabled ? "Sound on" : "Sound off";
        if (this.screen === "adventure") this.adventurePause();
        break;
      case "motion":
        this.store.write("settings", { ...this.store.settings, motion: !this.reducedMotion });
        this.game.registry.set("reducedMotion", this.reducedMotion);
        document.body.classList.toggle("reduced-motion", this.reducedMotion);
        this.help();
        break;
      case "install":
        void this.install?.prompt();
        break;
    }
  }
  // ---------------------------------------------------------------- adventure
  private adventureScene() {
    return this.game.scene.getScene("Adventure") as AdventureScene;
  }
  private stopAdventure() {
    if (this.game.scene.isActive("Adventure") || this.game.scene.isPaused("Adventure")) this.game.scene.stop("Adventure");
    document.body.classList.remove("adventure-mode");
  }
  private startAdventure() {
    if (!this.profile) return;
    this.game.scene.stop("Menu");
    this.game.registry.set("reducedMotion", this.reducedMotion);
    this.shell("adventure", "");
    document.body.classList.add("adventure-mode");
    this.game.scene.start("Adventure", { profileId: this.profile.id, save: this.adventures.read(this.profile.id), world: this.world });
    document.getElementById("stage")!.focus();
  }
  private adventurePause() {
    if (this.screen !== "adventure") return;
    const a = this.adventureScene().sim;
    this.modal(
      `<p class="eyebrow">YOUR WORLD CAN WAIT</p><h2>Take a breather.</h2><p>Your growth and discoveries are saved.</p>${this.button("Continue exploring →", "adventure-resume", undefined, "primary big")}${this.button("Map & creature book", "adventure-journal", undefined, "quiet")}${this.button(a.save.assist ? "Assisted hunts: on" : "Assisted hunts: off", "adventure-assist", undefined, "quiet")}<p class="hint">Assisted hunts give longer tells, gentler damage and a wider bite. Rewards stay the same.</p><div class="row">${this.button(this.audio.enabled ? "Sound on" : "Sound off", "sound", undefined, "quiet small")}${this.button(this.reducedMotion ? "Motion: calm" : "Motion: full", "motion", undefined, "quiet small")}</div>${this.button("Save & return home", "adventure-quit", undefined, "quiet")}`,
    );
  }
  private adventureJournal() {
    if (this.screen !== "adventure") return;
    const a = this.adventureScene().sim;
    const known = a.save.studied;
    const fossils = DISCOVERIES.filter((d) => d.kind === "fossil");
    this.modal(
      `<p class="eyebrow">THE WORLD JOURNAL</p><h2>${esc(a.objective)}</h2><div class="journal-map" data-map></div><div class="journal-regions">${REGIONS.map((r) => `<section class="journal-region ${a.save.regions.includes(r.id) ? "known" : ""}"><b>${esc(r.name)}</b><p>${a.save.regions.includes(r.id) ? esc(r.blurb) : r.built ? "Unexplored" : "Beyond the horizon"}</p><small>${a.save.nests.includes(r.id) ? "Refuge found" : "Find the refuge"}</small></section>`).join("")}</div><h3>Creature book <small>${known.length} of ${CREATURES.length} studied</small></h3><div class="adventure-book">${CREATURES.map((c) => `<p class="${known.includes(c.id) ? "known" : ""}"><b>${known.includes(c.id) ? esc(c.name) : "Undiscovered creature"}</b><small>${known.includes(c.id) ? esc(c.fact) : "Watch it from a distance, or hunt it, to learn its secrets."}</small></p>`).join("")}</div><p class="hint">${a.save.discoveries.filter((d) => d.startsWith("fossil")).length} of ${fossils.length}+ fossils found · ${a.save.challenges.length} clean hunts and trails · ${a.save.rivals.length} rival encounters won</p>${this.button("Continue exploring →", "adventure-resume", undefined, "primary")}`,
    );
    const host = document.querySelector<HTMLElement>("[data-map]");
    if (host) host.append(worldMap(this.world.grid, a.save, a.player));
  }
  private adventureNest() {
    if (this.screen !== "adventure") return;
    const a = this.adventureScene().sim;
    if (!a.nearNest) return this.adventurePause();
    this.modal(
      `<p class="eyebrow">A SAFE PLACE TO RETURN</p><h2>Rest at the nest</h2><p>You are safe and healed. Each dinosaur keeps its own growth.</p><div class="nest-species">${(["rex", "raptor", "trike"] as const).map((d) => this.button(`${DINO_NAMES[d]}<small>${a.save.species.includes(d) ? DINOS[d].blurb : "Find its egg to unlock"}</small><small class="stage">${a.save.species.includes(d) ? STAGES[a.stageFor(d)] : ""}</small>`, "adventure-species", d, d === a.dino ? "primary" : "quiet", !a.save.species.includes(d))).join("")}</div>${this.button("Continue exploring →", "adventure-resume", undefined, "primary")}`,
    );
  }
}
