import * as Phaser from "phaser";
import { SaveStore, type Profile } from "../platform/storage";
import { connectSync } from "../platform/sync";
import { charDelDocId, charDocId } from "../platform/sync-plan";
import { Audio } from "../platform/audio";
import { esc } from "./markup";
import { AVATARS, matchesProfilePin } from "../platform/validation";
import type { AdventureScene } from "../scenes/AdventureScene";
import { AdventureStore } from "../adventure/save";
import { CharacterStore } from "../rpg/store";
import { level as levelOf, type Character } from "../rpg/character";
import { CREATURES, DINOS, DINO_NAMES, DISCOVERIES, REGIONS, OBJECTIVES, objectiveDescription, type Dino } from "../adventure/data";
import { QUESTS, NPCS } from "../adventure/content";
import type { World } from "../world/world";
import { worldMap } from "./screens/world-map";
import { ICONS, slotIcon } from "./icons";
import { BAG_LIMIT, RARITY_NAMES, SLOT_NAMES, SLOT_ORDER, SLOTS_FOR, STAT_SPECS, compareMutations, describeMutation, fmtStat, mutationScore, rerollCost, salvageValue, sortMutations, uniqueById, type SortKey } from "../rpg/mutations";
import { EFFECTS } from "../rpg/effects";
import { ACTIVES, BRANCHES, TIER_GATE, activesFor, branchPoints, nodesFor, respecCost } from "../rpg/skills";
import { MAX_LEVEL, STAGE_NAMES, stageForLevel } from "../rpg/progression";
import type { Mutation, Slot, Difficulty } from "../rpg/types";

const byRegionName = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id;
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CLASSES: Record<Dino, { role: string; blurb: string; traits: string[]; portrait: string }> = {
  rex: { role: "Heavy bruiser", blurb: "Hits like a landslide. Roar to break an attack, stomp to stun, bite combos that end in a crushing finisher.", traits: ["Tough", "Roar & Stomp", "Slower dodge"], portrait: "rex_1" },
  raptor: { role: "Agile skirmisher", blurb: "Four lightning strikes per combo, bleeds and poison, pounces and shadowsteps. Glass-quick and rewarded for flanking.", traits: ["Fast", "Bleed & Poison", "Fragile"], portrait: "raptor" },
  trike: { role: "Defensive charger", blurb: "Armoured frill, horn charges that hurl enemies aside, a brace that turns blows back. Grazes ferns for Feast.", traits: ["Armoured", "Charge & Brace", "Plant-eater"], portrait: "trike" },
};
const DIFFICULTIES: { id: Difficulty; name: string; blurb: string }[] = [
  { id: "gentle", name: "Gentle", blurb: "Longer telegraphs, 40% less damage taken, wider aim." },
  { id: "standard", name: "Standard", blurb: "The intended game." },
  { id: "fierce", name: "Fierce", blurb: "Tougher creatures, +20% XP and better drops." },
];
const portraitUrl = (c: Character) => import.meta.env.BASE_URL + `art/portraits/${c.species === "rex" ? "rex_" + stageForLevel(levelOf(c)) : c.species}.webp`;
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
};
const mainQuests = QUESTS.filter((q) => q.kind === "main");
const progressOf = (c: Character) => {
  const done = mainQuests.filter((q) => c.quests[q.id]?.status === "done").length;
  return { done, total: mainQuests.length, pct: Math.round((done / Math.max(1, mainQuests.length)) * 100) };
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
  readonly chars = new CharacterStore(this.adventures);
  private view = { sort: "rarity" as SortKey, filter: "all" as "all" | Slot, sel: "" as string, jtab: "quests", skillTab: "tree", wearable: true };
  private journalTab = "quests";
  private dialogueState: { page: number } = { page: 0 };
  private createDraft = { name: "", species: "rex" as Dino, difficulty: "standard" as Difficulty };
  constructor(private game: Phaser.Game) {
    this.audio.enabled = this.store.settings.sound !== false;
    game.registry.set("audio", this.audio);
    game.registry.set("reducedMotion", this.reducedMotion);
    document.body.classList.toggle("reduced-motion", this.reducedMotion);
    window.addEventListener("rex-ready", () => this.screen === "loading" && this.splash());
    window.addEventListener("rex-failed", () => this.shell("loading", '<div class="loading-screen"><p class="eyebrow">TINY REX</p><h1>The valley would not wake.</h1><p>Check your connection and reload.</p></div>'));
    window.addEventListener("rex-adventure-pause", () => this.adventurePause());
    window.addEventListener("rex-adventure-nest", () => this.adventureNest());
    window.addEventListener("rex-adventure-dialogue", () => this.dialogue());
    window.addEventListener("rex-adventure-menu", ((e: CustomEvent) => {
      const m = e.detail?.menu;
      if (m === "pack") this.mutations();
      else if (m === "skills") this.skills();
      else if (m === "journal") this.journal();
    }) as EventListener);
    window.addEventListener("rex-adventure-save", ((event: CustomEvent) => {
      const { id, character } = event.detail as { id: string; character: string };
      const c = this.chars.get(id, character);
      if (c) this.store.onSave(charDocId(id, c.id), c);
    }) as EventListener);
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.install = e as InstallEvent;
    });
    this.store.onChange = () => {
      if (this.screen === "profiles") this.profiles();
      if (this.screen === "characters") this.characters();
    };
    this.ui.addEventListener("click", (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-action]");
      if (!button || button.disabled) return;
      this.audio.unlock();
      this.audio.play(button.dataset.action === "equip" ? "equip" : "click");
      this.action(button.dataset.action!, button.dataset.value, button.dataset.extra);
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
  private button(label: string, action: string, value?: string, classes = "", disabled = false, extra?: string) {
    return `<button class="button ${classes}" data-action="${action}" ${value === undefined ? "" : `data-value="${esc(value)}"`} ${extra === undefined ? "" : `data-extra="${esc(extra)}"`} ${disabled ? "disabled" : ""}>${label}</button>`;
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
  private get lastChar() {
    if (!this.profile) return null;
    const book = this.chars.read(this.profile.id, this.profile.name);
    return (book.active && book.characters[book.active]) || null;
  }
  private summary(p: Profile) {
    const list = this.chars.list(p.id, p.name);
    if (!list.length) return "No characters yet";
    const best = list.reduce((a, c) => (levelOf(c) > levelOf(a) ? c : a), list[0]);
    return `${list.length} character${list.length === 1 ? "" : "s"} · best Lv ${levelOf(best)} ${DINO_NAMES[best.species]}`;
  }
  // ---------------------------------------------------------------- home
  splash() {
    this.stopAdventure();
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    const last = this.store.profiles.find((p) => p.id === this.store.settings.lastProfile);
    const lastChar = last ? (() => { const b = this.chars.read(last.id, last.name); return (b.active && b.characters[b.active]) || null; })() : null;
    this.shell(
      "splash",
      `<div class="splash-content"><p class="eyebrow">A LITTLE DINOSAUR. A VERY BIG WORLD.</p><h1 class="wordmark">TINY <span>REX</span></h1><p class="tagline">Hunt. Evolve. Explore.</p><div class="splash-bottom">${last ? this.button((lastChar ? `Continue as ${esc(lastChar.name)}` : `Continue as ${esc(last.name)}`) + " →", "continue", last.id, "primary big") + `<p class="hint">${esc(lastChar ? `Lv ${levelOf(lastChar)} ${DINO_NAMES[lastChar.species]} · ${byRegionName(lastChar.snapshot.nest)}` : this.summary(last))}</p>` : this.button("Start hatching →", "profiles", undefined, "primary big")}${last ? this.button("Choose a player", "profiles", undefined, "quiet") : ""}${this.footer()}</div></div>`,
    );
  }
  profiles() {
    this.stopAdventure();
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    this.shell(
      "profiles",
      `<section class="panel"><header class="page-heading"><div><p class="eyebrow">TINY REX</p><h1>Who’s hatching?</h1><p>Every player can have several dinosaurs, each with its own adventure.</p></div></header><div class="profile-list">${this.store.profiles.map((p) => this.button(`<span class="avatar">${esc(p.avatar)}</span><span><b>${esc(p.name)}</b><small>${esc(this.summary(p))}${p.pin ? " · PIN protected" : ""}</small></span> →`, "select", p.id, "profile")).join("")}</div>${this.button("+ New player", "new", undefined, "primary")}${this.button("Back", "splash", undefined, "quiet")}${this.footer()}</section>`,
    );
  }
  private select(id: string, autoplay = false) {
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
        this.enter(profile, autoplay);
      };
    } else this.enter(profile, autoplay);
  }
  private enter(p: Profile, autoplay = false) {
    this.profile = p;
    this.store.write("settings", { ...this.store.settings, lastProfile: p.id });
    document.querySelector(".modal-backdrop")?.remove();
    const last = this.lastChar;
    if (autoplay && last) this.startAdventure(last.id);
    else this.characters();
  }
  private newProfile() {
    this.modal(
      `<p class="eyebrow">WELCOME</p><h2>A new player</h2><form id="profile-form"><label>Your name<input name="name" maxlength="24" required autocomplete="off" placeholder="What should we call you?"></label><label>Your avatar<select name="avatar">${AVATARS.map((a) => `<option>${a}</option>`).join("")}</select></label><label>Family PIN <small>Optional · four digits</small><input name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" type="password" autocomplete="off"></label><p class="form-error" role="alert"></p><button class="button primary">Continue →</button></form>${this.button("Cancel", "close", undefined, "quiet")}`,
    );
    document.querySelector<HTMLFormElement>("#profile-form")!.onsubmit = (e) => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement,
        data = new FormData(form),
        name = String(data.get("name")).trim();
      if (!name) {
        form.querySelector(".form-error")!.textContent = "Please tell us your name.";
        return;
      }
      this.enter(this.store.add(name, String(data.get("avatar")), String(data.get("pin")) || null));
    };
  }
  // ---------------------------------------------------------------- characters
  private characters() {
    if (!this.profile) return this.profiles();
    this.stopAdventure();
    if (!this.game.scene.isActive("Menu")) this.game.scene.start("Menu");
    const p = this.profile;
    const list = this.chars.list(p.id, p.name);
    const trash = this.chars.trash(p.id);
    const recovered = this.chars.recovered;
    const notice = recovered ? `<p class="notice" role="status">Your saves were repaired from ${recovered === "backup" ? "the latest backup" : recovered === "good" ? "an earlier safe copy" : "your original adventure"}. Nothing was lost.</p>` : "";
    const cards = list
      .map((c) => {
        const lvl = levelOf(c);
        const prog = progressOf(c);
        return `<article class="char-card"><img class="face" src="${portraitUrl(c)}" alt="" width="96" height="96"><div><h3>${esc(c.name)}</h3><div class="sub">Lv ${lvl} ${DINO_NAMES[c.species]} · ${STAGE_NAMES[stageForLevel(lvl)]}</div><div class="facts"><span>📍 <b>${esc(byRegionName(c.snapshot.nest))}</b></span><span>⏱ <b>${fmtTime(c.elapsed)}</b></span><span>Story <b>${prog.done}/${prog.total}</b></span><span>${c.difficulty === "standard" ? "" : c.difficulty === "gentle" ? "Gentle" : "Fierce"}</span></div><div class="bar" aria-hidden="true"><i style="width:${prog.pct}%"></i></div></div><div class="buttons">${this.button("Play →", "play", c.id, "primary")}${this.button("Delete", "ask-delete", c.id, "quiet small")}</div></article>`;
      })
      .join("");
    this.shell(
      "characters",
      `<section class="panel"><header class="page-heading"><div><p class="eyebrow">${esc(p.name.toUpperCase())}</p><h1>Choose your dinosaur</h1><p>Each dinosaur is a separate adventure with its own growth, mutations and story.</p></div></header>${notice}<div class="char-list">${cards || '<p class="notice">No dinosaurs yet. Hatch your first one!</p>'}</div>${this.button("+ Hatch a new dinosaur", "new-character", undefined, "primary")}${trash.length ? this.button(`Recently deleted (${trash.length})`, "trash", undefined, "quiet") : ""}${this.button("Back to players", "profiles", undefined, "quiet")}${this.footer()}</section>`,
    );
    if (!list.length && !recovered) this.createCharacter();
  }
  private createCharacter() {
    const d = this.createDraft;
    this.modal(
      `<p class="eyebrow">A NEW ADVENTURE</p><h2>Hatch a dinosaur</h2><form id="char-form"><label>Name<input name="name" maxlength="20" required autocomplete="off" placeholder="Pick a name" value="${esc(d.name)}"></label><fieldset style="border:0;padding:0;margin:0"><legend class="eyebrow">SPECIES · PERMANENT</legend><div class="species-pick">${(["rex", "raptor", "trike"] as Dino[])
        .map((id) => `<label class="species"><input type="radio" name="species" value="${id}" ${d.species === id ? "checked" : ""}><img src="${import.meta.env.BASE_URL}art/portraits/${CLASSES[id].portrait}.webp" alt=""><b>${DINO_NAMES[id]}</b><span class="role">${CLASSES[id].role}</span><small>${CLASSES[id].blurb}</small><span class="traits">${CLASSES[id].traits.map((t) => `<span>${t}</span>`).join("")}</span></label>`)
        .join("")}</div></fieldset><p class="warn">Choose carefully: a dinosaur’s species can’t be changed. You can hatch more dinosaurs any time.</p><fieldset style="border:0;padding:0;margin:0"><legend class="eyebrow">CHALLENGE</legend><div class="seg">${DIFFICULTIES.map((x) => `<label><input type="radio" name="difficulty" value="${x.id}" ${d.difficulty === x.id ? "checked" : ""}><span><b>${x.name}</b><small>${x.blurb}</small></span></label>`).join("")}</div></fieldset><p class="form-error" role="alert"></p><button class="button primary big">Hatch →</button></form>${this.button("Cancel", "close", undefined, "quiet")}`,
      "wide",
    );
    const form = document.querySelector<HTMLFormElement>("#char-form")!;
    form.onsubmit = (e) => {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name")).trim();
      const species = String(data.get("species")) as Dino;
      if (!name) {
        form.querySelector(".form-error")!.textContent = "Every dinosaur needs a name.";
        return;
      }
      if (!(["rex", "raptor", "trike"] as Dino[]).includes(species)) return;
      const c = this.chars.create(this.profile!.id, name, species);
      if (!c) {
        form.querySelector(".form-error")!.textContent = "That’s a full nest! Delete a dinosaur first.";
        return;
      }
      c.difficulty = (String(data.get("difficulty")) as Difficulty) || "standard";
      this.chars.save(this.profile!.id, c);
      this.createDraft = { name: "", species: "rex", difficulty: "standard" };
      this.store.onSave(charDocId(this.profile!.id, c.id), c);
      this.startAdventure(c.id);
    };
  }
  private askDelete(id: string) {
    const c = this.chars.get(this.profile!.id, id);
    if (!c) return;
    this.modal(
      `<p class="eyebrow">DELETE A DINOSAUR</p><h2>Delete ${esc(c.name)}?</h2><p>Lv ${levelOf(c)} ${DINO_NAMES[c.species]} · ${fmtTime(c.elapsed)} played · ${c.bag.length + Object.keys(c.worn).length} mutations.</p><p class="warn">They move to <b>Recently deleted</b> for 30 days, where you can bring them back. After that they are gone for good.</p>${this.button("Delete " + esc(c.name), "delete", id, "danger")}${this.button("Keep them", "close", undefined, "primary")}`,
    );
  }
  private showTrash() {
    const p = this.profile!;
    const list = this.chars.trash(p.id);
    this.modal(
      `<p class="eyebrow">RECENTLY DELETED</p><h2>Bring one back?</h2><div class="char-list">${list.map((t) => `<article class="char-card"><img class="face" src="${portraitUrl(t.character)}" alt="" width="96" height="96"><div><h3>${esc(t.character.name)}</h3><div class="sub">Lv ${levelOf(t.character)} ${DINO_NAMES[t.character.species]}</div><div class="facts"><span>Deleted ${new Date(t.deletedAt).toLocaleDateString()}</span></div></div><div class="buttons">${this.button("Restore", "restore", t.character.id, "primary")}</div></article>`).join("") || "<p>Nothing here.</p>"}</div>${this.button("Close", "close", undefined, "quiet")}`,
      "wide",
    );
  }
  // ---------------------------------------------------------------- modals
  private modal(content: string, cls = "") {
    document.querySelector(".modal-backdrop")?.remove();
    const div = document.createElement("div");
    div.className = "modal-backdrop";
    div.innerHTML = `<section class="modal ${cls}" role="dialog" aria-modal="true" aria-label="Tiny Rex">${content}</section>`;
    this.ui.append(div);
    div.querySelector<HTMLElement>("input,button")?.focus();
    div.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (this.screen === "adventure") this.action("adventure-resume");
        else this.action("close");
      }
      if (e.key === "Tab") {
        const nodes = [...div.querySelectorAll<HTMLElement>("input,select,button:not([disabled])")];
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
      `<p class="eyebrow">HOW TO PLAY</p><h2>Hunt. Dodge. Evolve.</h2><div class="help-rules"><p><b>Fight with rhythm.</b> Hold attack for a three-hit combo; the finisher hits hardest but leaves you open. A red shape on the ground shows where a creature will strike; the inner shape shows when.</p><p><b>Dodge the lethal moment.</b> A dodge makes you untouchable for a heartbeat. Dodging <i>into</i> a strike is a Perfect Dodge: your cooldowns refresh and your next hit is critical.</p><p><b>Punish the recovery.</b> A creature that has just attacked is Exposed and takes much more damage.</p><p><b>Eat to grow.</b> Prey you catch fills your Feast: a temporary boost to damage and speed. Level-ups are permanent.</p><p><b>Mutations.</b> Creatures drop biological upgrades (jaws, claws, hide, legs, tail, instincts). Rarer ones change how you fight.</p></div><p>Move WASD / arrows or left thumb · J attack · Space dodge · E and Q skills · I mutations · O skills · M journal · Enter talk or rest · Esc pause.</p><p>Install on iPad: Safari → Share → Add to Home Screen. PINs are convenience locks, not private passwords.</p>${this.install ? this.button("Install Tiny Rex", "install", undefined, "primary") : ""}${this.button(this.reducedMotion ? "Decorative motion off" : "Decorative motion on", "motion", undefined, "quiet")}${this.button("Got it", "close", undefined, "primary")}`,
    );
  }
  private action(action: string, value?: string, extra?: string) {
    const sim = this.screen === "adventure" ? this.adventureScene()?.sim : undefined;
    const scene = this.screen === "adventure" ? this.adventureScene() : undefined;
    switch (action) {
      case "adventure-resume":
        document.querySelector(".modal-backdrop")?.remove();
        document.querySelector(".dialogue-back")?.remove();
        scene?.resumeAdventure();
        break;
      case "adventure-pause":
        this.adventurePause();
        break;
      case "adventure-journal":
        this.journal();
        break;
      case "adventure-nest":
        this.adventureNest();
        break;
      case "adventure-mutations":
        this.mutations();
        break;
      case "adventure-skills":
        this.skills();
        break;
      case "adventure-quit":
        scene?.persist();
        this.characters();
        break;
      case "difficulty":
        if (sim) {
          sim.setDifficulty(value as Difficulty);
          scene?.persist();
          this.adventurePause();
        }
        break;
      case "splash":
        this.splash();
        break;
      case "profiles":
        this.profiles();
        break;
      case "continue":
        this.select(value!, true);
        break;
      case "select":
        this.select(value!);
        break;
      case "new":
        this.newProfile();
        break;
      case "new-character":
        this.createCharacter();
        break;
      case "play":
        this.startAdventure(value!);
        break;
      case "ask-delete":
        this.askDelete(value!);
        break;
      case "delete": {
        const id = value!;
        const c = this.chars.get(this.profile!.id, id);
        if (c && this.chars.remove(this.profile!.id, id)) {
          const t = this.chars.trash(this.profile!.id).find((x) => x.character.id === id);
          this.store.onSave(charDelDocId(this.profile!.id, id), { character: c, at: t?.deletedAt ?? Date.now() });
        }
        document.querySelector(".modal-backdrop")?.remove();
        this.characters();
        break;
      }
      case "trash":
        this.showTrash();
        break;
      case "restore": {
        const c = this.chars.restore(this.profile!.id, value!);
        if (c) this.store.onSave(charDocId(this.profile!.id, c.id), c);
        document.querySelector(".modal-backdrop")?.remove();
        this.characters();
        break;
      }
      case "close":
        document.querySelector(".modal-backdrop")?.remove();
        if (this.screen === "adventure") scene?.resumeAdventure();
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
        if (this.screen === "adventure") this.adventurePause();
        else this.help();
        break;
      case "install":
        void this.install?.prompt();
        break;
      // ---- mutations
      case "pick":
        this.view.sel = value!;
        this.mutations();
        break;
      case "equip":
        if (sim?.equip(value!)) {
          this.view.sel = "";
          scene?.persist();
        }
        this.mutations();
        break;
      case "unequip":
        if (sim?.unequip(value as Slot)) scene?.persist();
        this.view.sel = "";
        this.mutations();
        break;
      case "salvage":
        if (sim && sim.salvage(value!) >= 0) {
          this.view.sel = "";
          scene?.persist();
        }
        this.mutations();
        break;
      case "reroll":
        if (sim?.reroll(value!, Number(extra))) scene?.persist();
        this.mutations();
        break;
      case "sort":
        this.view.sort = value as SortKey;
        this.mutations();
        break;
      // ---- skills
      case "rank":
        if (sim?.rank(value!)) scene?.persist();
        this.skills();
        break;
      case "respec":
        if (sim?.respec()) scene?.persist();
        this.skills();
        break;
      case "loadout":
        if (sim?.setLoadout(Number(extra) as 0 | 1, value!)) scene?.persist();
        this.skills();
        break;
      case "skill-tab":
        this.view.skillTab = value!;
        this.skills();
        break;
      // ---- journal
      case "jtab":
        this.journalTab = value!;
        this.journal();
        break;
      case "track":
        sim?.quests.track(value!);
        this.journal();
        break;
      // ---- dialogue
      case "dlg-next": {
        const s = sim?.dialogue;
        if (!s) break;
        this.dialogueState.page++;
        if (this.dialogueState.page >= s.pages.length) this.endDialogue();
        else this.dialogue(true);
        break;
      }
      case "dlg-choice":
        this.endDialogue(value);
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
    document.querySelector(".dialogue-back")?.remove();
  }
  private startAdventure(characterId: string) {
    if (!this.profile) return;
    this.game.scene.stop("Menu");
    this.game.registry.set("reducedMotion", this.reducedMotion);
    this.shell("adventure", "");
    document.body.classList.add("adventure-mode");
    this.game.scene.start("Adventure", { profileId: this.profile.id, characterId, store: this.chars, world: this.world });
    document.getElementById("stage")!.focus();
  }
  private adventurePause() {
    if (this.screen !== "adventure") return;
    const a = this.adventureScene().sim;
    const diff = a.save.difficulty;
    this.modal(
      `<p class="eyebrow">${esc(a.save.name.toUpperCase())} · LV ${a.level} ${DINO_NAMES[a.dino].toUpperCase()}</p><h2>Take a breather.</h2><p>Your adventure is saved.</p>${this.button("Continue exploring →", "adventure-resume", undefined, "primary big")}<div class="row">${this.button(`${ICONS.pack} Mutations`, "adventure-mutations", undefined, "quiet")}${this.button(`${ICONS.tree} Skills${a.skillPoints ? " · " + a.skillPoints : ""}`, "adventure-skills", undefined, "quiet")}${this.button(`${ICONS.book} Journal`, "adventure-journal", undefined, "quiet")}</div><p class="eyebrow">CHALLENGE</p><div class="seg">${DIFFICULTIES.map((x) => `<label><input type="radio" name="d" ${diff === x.id ? "checked" : ""} disabled><span data-action="difficulty" data-value="${x.id}" role="button" tabindex="0"><b>${x.name}</b><small>${x.blurb}</small></span></label>`).join("")}</div><div class="row">${this.button(this.audio.enabled ? "Sound on" : "Sound off", "sound", undefined, "quiet small")}${this.button(this.reducedMotion ? "Motion: calm" : "Motion: full", "motion", undefined, "quiet small")}${this.button("Help", "help", undefined, "quiet small")}</div>${this.button("Save & choose another dinosaur", "adventure-quit", undefined, "quiet")}`,
    );
    // the difficulty chips are spans so a keyboard press must work too
    document.querySelectorAll<HTMLElement>('.seg span[data-action="difficulty"]').forEach((el) => {
      el.onclick = () => this.action("difficulty", el.dataset.value);
      el.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && this.action("difficulty", el.dataset.value);
    });
  }
  private adventureNest() {
    if (this.screen !== "adventure") return;
    const a = this.adventureScene().sim;
    if (!a.nearNest) return this.adventurePause();
    this.modal(
      `<p class="eyebrow">A SAFE PLACE TO RETURN</p><h2>Rest at the refuge</h2><p>You are fully rested. Change what you wear, spend skill points, and decide how to face the next hunt.</p><div class="row">${this.button(`${ICONS.pack} Mutations${a.save.bag.some((m) => m.fresh) ? " · new" : ""}`, "adventure-mutations", undefined, "primary")}${this.button(`${ICONS.tree} Skills${a.skillPoints ? " · " + a.skillPoints + " points" : ""}`, "adventure-skills", undefined, "primary")}${this.button(`${ICONS.book} Journal`, "adventure-journal", undefined, "quiet")}</div>${this.button("Continue exploring →", "adventure-resume", undefined, "primary")}${this.button("Save & choose another dinosaur", "adventure-quit", undefined, "quiet")}`,
    );
  }
  // ---------------------------------------------------------------- mutations
  private mutDetail(m: Mutation | undefined, sim: ReturnType<App["adventureScene"]>["sim"], where: "bag" | "worn") {
    if (!m) return `<div class="detail"><p class="empty">Tap a mutation to see what it does.</p></div>`;
    const lines = [m.primary, ...m.affixes].map((r) => `<li>${fmtStat(r.stat, r.value)} ${STAT_SPECS[r.stat].label}${r.min !== r.max ? ` <small>(${fmtStat(r.stat, r.min).slice(1)}–${fmtStat(r.stat, r.max).slice(1)})</small>` : ""}</li>`);
    const fx = m.effects.map((e) => `<li class="fx">✦ <b>${esc(EFFECTS[e.id]?.name ?? e.id)}</b> — ${esc(describeFx(e.id, e.value))}</li>`);
    const uniq = m.unique ? uniqueById(m.unique) : undefined;
    const worn = sim.save.worn[m.slot];
    const diff = where === "bag" ? compareMutations(worn, m) : [];
    const dup = m.unique && [...sim.save.bag, ...Object.values(sim.save.worn)].some((x) => x && x.id !== m.id && x.unique === m.unique);
    const gain = Math.round(salvageValue(m, !!dup) * sim.d.amberMult);
    const canRe = !m.rerolled && !m.unique && m.affixes.length > 0;
    const rerolls = canRe ? m.affixes.map((r, i) => this.button(`↻ ${STAT_SPECS[r.stat].label} · ${rerollCost(m)}`, "reroll", m.id, "quiet small", sim.save.amber < rerollCost(m), String(i))).join("") : "";
    return `<div class="detail r-${m.rarity}"><h3>${esc(m.name)}</h3><div class="meta">${RARITY_NAMES[m.rarity]} · ${SLOT_NAMES[m.slot]} · item level ${m.ilvl}</div><ul>${lines.join("")}${fx.join("")}</ul>${uniq ? `<p class="flavour">“${esc(uniq.flavour)}”</p>` : ""}${diff.length ? `<div class="diff"><b>Compared with what you wear</b>${diff.map((d) => `<span class="${d.better ? "up" : "down"}">${d.better ? "▲" : "▼"} ${esc(d.label)}: ${esc(d.from)} → ${esc(d.to)}</span>`).join("")}</div>` : where === "bag" && !worn ? `<div class="diff"><span class="up">▲ Nothing worn in this slot yet</span></div>` : ""}<div class="actions-row">${where === "bag" ? this.button("Wear", "equip", m.id, "primary") + this.button(`Salvage +${gain}`, "salvage", m.id, "quiet") : this.button("Take off", "unequip", m.slot, "quiet", sim.save.bag.length >= BAG_LIMIT)}</div>${canRe ? `<div class="actions-row">${rerolls}</div><p class="hint" style="margin-top:6px">Reroll swaps one bonus stat, once per mutation.</p>` : ""}</div>`;
  }
  private mutations() {
    if (this.screen !== "adventure") return;
    const sim = this.adventureScene().sim;
    const slots = SLOTS_FOR[sim.dino];
    const bag = sortMutations(sim.save.bag.filter((m) => this.view.filter === "all" || m.slot === this.view.filter), this.view.sort);
    const all = [...Object.values(sim.save.worn), ...sim.save.bag].filter(Boolean) as Mutation[];
    const sel = all.find((m) => m.id === this.view.sel);
    const wornSel = sel && Object.values(sim.save.worn).some((m) => m?.id === sel.id);
    const sheet = sim.d;
    const stat = (l: string, v: string) => `<div><span>${l}</span><b>${v}</b></div>`;
    const sheetRows = [
      stat("Health", String(sheet.maxHp)),
      stat("Damage per hit", sheet.damage.toFixed(1)),
      stat("Hits per second", (1 / sheet.swing).toFixed(1)),
      stat("Critical", `${Math.round(sheet.crit * 100)}% · ×${sheet.critMult.toFixed(2)}`),
      stat("Damage reduction", `${Math.round(sheet.armour * 100)}%`),
      stat("Speed", `×${sheet.speedMult.toFixed(2)}`),
      stat("Dodge cooldown", `${sheet.dodgeCd.toFixed(2)} s`),
      stat("Skill cooldowns", `×${sheet.skillCdMult.toFixed(2)}`),
      stat("Life on hit", `${Math.round(sheet.lifesteal * 100)}%`),
      stat("Luck · Amber", `+${Math.round(sheet.luck * 100)}% · +${Math.round((sheet.amberMult - 1) * 100)}%`),
    ].join("");
    this.modal(
      `<div class="modal-head"><div><p class="eyebrow">${esc(sim.save.name.toUpperCase())} · LV ${sim.level} ${DINO_NAMES[sim.dino].toUpperCase()}</p><h2>Mutations</h2></div><span class="chip">${ICONS.amber} ${sim.save.amber} Amber</span></div><div class="menu-cols"><div><div class="slots">${slots
        .map((s) => {
          const m = sim.save.worn[s];
          return m
            ? `<button class="slot r-${m.rarity} ${this.view.sel === m.id ? "sel" : ""}" data-action="pick" data-value="${m.id}"><span class="gl">${slotIcon(s)}</span><b>${esc(m.name)}</b><small>${SLOT_NAMES[s]} · ${RARITY_NAMES[m.rarity]}</small></button>`
            : `<div class="slot empty"><span class="gl">${slotIcon(s)}</span><b>${SLOT_NAMES[s]}</b><small>Empty</small></div>`;
        })
        .join("")}</div><div class="bag-tools"><b>Bag <span class="count">${sim.save.bag.length}/${BAG_LIMIT}</span></b><label class="sr-only" for="sort">Sort</label><select id="sort" onchange="this.dispatchEvent(new CustomEvent('rex-sort',{bubbles:true,detail:this.value}))">${(["rarity", "slot", "level", "recent", "score"] as SortKey[]).map((k) => `<option value="${k}" ${this.view.sort === k ? "selected" : ""}>Sort: ${{ rarity: "rarity", slot: "slot", level: "item level", recent: "newest", score: "power" }[k]}</option>`).join("")}</select><label class="sr-only" for="flt">Filter</label><select id="flt">${["all", ...slots].map((s) => `<option value="${s}" ${this.view.filter === s ? "selected" : ""}>${s === "all" ? "All slots" : SLOT_NAMES[s as Slot]}</option>`).join("")}</select></div><div class="bag">${bag
        .map((m) => `<button class="item r-${m.rarity} ${m.rarity === "legendary" ? "legendary" : ""} ${m.fresh ? "fresh" : ""} ${this.view.sel === m.id ? "sel" : ""}" data-action="pick" data-value="${m.id}" aria-label="${esc(m.name)}, ${RARITY_NAMES[m.rarity]} ${SLOT_NAMES[m.slot]}"><span class="gl">${slotIcon(m.slot)}</span><span class="lv">${m.ilvl}</span></button>`)
        .join("") || '<p class="hint" style="grid-column:1/-1">Nothing here yet. Creatures drop mutations as you hunt.</p>'}</div></div><div>${this.mutDetail(sel, sim, wornSel ? "worn" : "bag")}<h3 style="margin-top:16px">Character sheet</h3><div class="sheet">${sheetRows}</div></div></div>${this.button("Back", "adventure-pause", undefined, "quiet")}${this.button("Continue exploring →", "adventure-resume", undefined, "primary")}`,
      "wide",
    );
    const flt = document.querySelector<HTMLSelectElement>("#flt");
    if (flt) flt.onchange = () => {
      this.view.filter = flt.value as "all" | Slot;
      this.mutations();
    };
    const sort = document.querySelector<HTMLSelectElement>("#sort");
    if (sort) {
      sort.removeAttribute("onchange");
      sort.onchange = () => {
        this.view.sort = sort.value as SortKey;
        this.mutations();
      };
    }
    for (const m of sim.save.bag) if (m.fresh && m.id === this.view.sel) m.fresh = undefined;
    void mutationScore;
  }
  // ---------------------------------------------------------------- skills
  private skills() {
    if (this.screen !== "adventure") return;
    const sim = this.adventureScene().sim;
    const dino = sim.dino;
    const points = sim.skillPoints;
    const cost = respecCost(sim.level);
    const slotBOpen = sim.level >= 5;
    const loadout = `<div class="loadout">${activesFor(dino)
      .map((s) => {
        const locked = s.unlock > sim.level;
        const on0 = sim.save.loadout[0] === s.id,
          on1 = sim.save.loadout[1] === s.id;
        return `<div class="skill-card ${locked ? "locked" : ""} ${on0 || on1 ? "equipped" : ""}"><span class="gl">${ICONS[s.icon]}</span><div><b>${esc(s.name)}</b> <small>${locked ? "unlocks at level " + s.unlock : s.cd + " s cooldown"}</small><small>${esc(s.blurb)}</small>${locked ? "" : `<div class="slotpick">${this.button("Slot 1", "loadout", s.id, on0 ? "on small" : "small", false, "0")}${slotBOpen ? this.button("Slot 2", "loadout", s.id, on1 ? "on small" : "small", false, "1") : ""}</div>`}</div></div>`;
      })
      .join("")}</div>`;
    const tree = `<div class="tree">${BRANCHES[dino]
      .map((b) => {
        const invested = branchPoints(sim.save.skills, dino, b.id);
        return `<div class="branch"><h4>${esc(b.name)} <small style="display:inline;font-size:12px;color:var(--muted)">${invested} pts</small></h4><p>${esc(b.blurb)}</p>${nodesFor(dino)
          .filter((n) => n.branch === b.id)
          .sort((x, y) => x.tier - y.tier)
          .map((n) => {
            const r = sim.save.skills[n.id] ?? 0;
            const chk = sim.canRank(n.id);
            const gated = !chk.ok && /Spend/.test(chk.reason ?? "");
            return `<div class="node t${n.tier} ${r ? "ranked" : ""} ${r >= n.max ? "full" : ""} ${gated ? "gated" : ""}"><span class="rank">${r}/${n.max}</span><div><b>${esc(n.name)}</b><small>${esc(n.text)}</small>${gated ? `<small>🔒 ${TIER_GATE[n.tier]} points in this branch first</small>` : ""}</div><button class="add" data-action="rank" data-value="${n.id}" ${chk.ok ? "" : "disabled"} aria-label="Add a rank to ${esc(n.name)}">+</button></div>`;
          })
          .join("")}</div>`;
      })
      .join("")}</div>`;
    this.modal(
      `<div class="modal-head"><div><p class="eyebrow">${esc(sim.save.name.toUpperCase())} · LV ${sim.level}${sim.level >= MAX_LEVEL ? " · MAX" : ""}</p><h2>Skills</h2></div><span class="chip">${ICONS.star} ${points} point${points === 1 ? "" : "s"} to spend</span></div><div class="tabs" role="tablist">${[["tree", "Skill tree"], ["loadout", "Active skills"]].map(([id, label]) => `<button class="tab" role="tab" aria-selected="${this.view.skillTab === id}" data-action="skill-tab" data-value="${id}">${label}</button>`).join("")}</div>${this.view.skillTab === "loadout" ? loadout : tree}<div class="row">${this.button(cost === 0 ? "Reset skill points · free" : `Reset skill points · ${cost} Amber`, "respec", undefined, "quiet", sim.save.amber < cost || !Object.keys(sim.save.skills).length)}<span class="chip">${ICONS.amber} ${sim.save.amber}</span></div><p class="hint">The tree has more ranks than points: pick a style. Skill points come with every level. Respeccing is free until level 5.</p>${this.button("Back", "adventure-pause", undefined, "quiet")}${this.button("Continue exploring →", "adventure-resume", undefined, "primary")}`,
      "wide",
    );
    void ACTIVES;
  }
  // ---------------------------------------------------------------- journal
  private journal() {
    if (this.screen !== "adventure") return;
    const sim = this.adventureScene().sim;
    const a = sim.save;
    const entries = sim.quests.journal();
    const active = entries.filter((e) => e.status === "active");
    const done = entries.filter((e) => e.status === "done");
    const questHtml = (e: (typeof entries)[number]) => `<article class="quest ${e.kind} ${e.status}"><h4>${esc(e.title)} <span class="tag">${e.kind === "main" ? "Story" : "Side"}</span><span class="tag">${esc(byRegionName(e.region))}</span></h4><p>${esc(e.summary)}</p><ol>${e.steps.map((s) => `<li class="${s.state}">${esc(s.text)}</li>`).join("")}</ol>${e.status === "active" ? `<div class="row">${this.button(e.tracked ? "Following ✓" : "Follow this quest", "track", e.id, e.tracked ? "quiet small" : "small", e.tracked)}</div>` : ""}</article>`;
    const tabs = [["quests", `Quests<span class="count">${active.length}</span>`], ["map", "Map"], ["creatures", `Creatures<span class="count">${a.studied.length}/${CREATURES.filter((c) => c.archetype !== "neutral").length}</span>`], ["people", "People"]];
    let body = "";
    if (this.journalTab === "quests") body = `<div class="qlist">${active.map(questHtml).join("") || '<p class="notice">No active quests. Talk to the creatures of the valley; some have something on their mind.</p>'}${done.length ? `<h3>Completed</h3>${done.map(questHtml).join("")}` : ""}</div>`;
    else if (this.journalTab === "map") body = `<div class="journal-map" data-map></div><div class="journal-regions">${REGIONS.map((r) => `<section class="journal-region ${a.regions.includes(r.id) ? "known" : ""}"><b>${esc(r.name)}</b><p>${a.regions.includes(r.id) ? esc(r.blurb) : "Unexplored"}</p><small>${a.nests.includes(r.id) ? "Refuge found" : "Find the refuge"}</small></section>`).join("")}</div><h3>Mastery <small>${OBJECTIVES.filter((o) => a.challenges.includes(o.id)).length} of ${OBJECTIVES.length}</small></h3><div class="adventure-book">${OBJECTIVES.map((o) => `<p class="${a.challenges.includes(o.id) ? "known" : ""}"><b>${esc(o.name)} · ${esc(byRegionName(o.region))}</b><small>${esc(objectiveDescription(o))}</small><small>${a.challenges.includes(o.id) ? "Completed" : `${Math.floor(a.mastery[o.id] ?? 0)} / ${o.count ?? o.seconds ?? 1}`}</small></p>`).join("")}</div><p class="hint">${a.discoveries.filter((d) => d.startsWith("fossil")).length} of ${DISCOVERIES.filter((d) => d.kind === "fossil").length} fossils found</p>`;
    else if (this.journalTab === "creatures") body = `<div class="adventure-book">${CREATURES.filter((c) => c.archetype !== "neutral").map((c) => `<p class="${a.studied.includes(c.id) ? "known" : ""}"><b>${a.studied.includes(c.id) ? esc(c.name) : "Undiscovered creature"}</b><small>${a.studied.includes(c.id) ? esc(c.fact) : "Watch it from a distance, or hunt it, to learn its secrets."}</small>${a.studied.includes(c.id) ? `<small>Level ${c.level} · ${esc(c.archetype)}</small>` : ""}</p>`).join("")}</div>`;
    else body = `<div class="people">${NPCS.filter((n) => !n.appears || a.flags.includes(n.appears)).map((n) => `<p class="${a.flags.includes("met:" + n.id) ? "" : "unknown"}"><b>${a.flags.includes("met:" + n.id) ? esc(n.name) : "Someone you haven’t met"}</b>${a.flags.includes("met:" + n.id) ? esc(n.about) : esc(byRegionName(n.region))}</p>`).join("")}</div>`;
    this.modal(
      `<div class="modal-head"><div><p class="eyebrow">THE VALLEY JOURNAL</p><h2>${esc(sim.objective)}</h2></div></div><div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button class="tab" role="tab" aria-selected="${this.journalTab === id}" data-action="jtab" data-value="${id}">${label}</button>`).join("")}</div>${body}${this.button("Back", "adventure-pause", undefined, "quiet")}${this.button("Continue exploring →", "adventure-resume", undefined, "primary")}`,
      "wide",
    );
    const host = document.querySelector<HTMLElement>("[data-map]");
    if (host) host.append(worldMap(this.world.grid, a, sim.player));
  }
  // ---------------------------------------------------------------- dialogue
  private dialogue(keepPage = false) {
    if (this.screen !== "adventure") return;
    const sim = this.adventureScene().sim;
    const s = sim.dialogue;
    if (!s) return;
    if (!keepPage) {
      this.dialogueState.page = 0;
      sim.setFlag("met:" + s.npc);
    }
    document.querySelector(".modal-backdrop")?.remove();
    document.querySelector(".dialogue-back")?.remove();
    const i = Math.min(this.dialogueState.page, s.pages.length - 1);
    const page = s.pages[i];
    const last = i >= s.pages.length - 1;
    const div = document.createElement("div");
    div.className = "dialogue-back";
    div.innerHTML = `<section class="dialogue" role="dialog" aria-modal="true" aria-label="${esc(s.name)} speaking"><div class="who">${esc(page.speaker)}</div><div class="line">${esc(page.text)}</div><div class="dots" aria-hidden="true">${s.pages.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>${last && s.choices ? `<div class="choices">${s.choices.map((c) => this.button(esc(c.text), "dlg-choice", c.id, "primary")).join("")}</div>` : this.button(last ? (s.kind === "offer" ? "I’ll help ▸" : "Goodbye ▸") : "Next ▸", "dlg-next", undefined, "primary next")}</section>`;
    this.ui.append(div);
    div.querySelector<HTMLElement>("button")?.focus();
    div.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (s.choices) {
          sim.cancelDialogue();
          this.action("adventure-resume");
        } else this.endDialogue();
      }
    });
  }
  private endDialogue(choice?: string) {
    const scene = this.adventureScene();
    scene.sim.closeDialogue(choice);
    document.querySelector(".dialogue-back")?.remove();
    scene.persist();
    // a closing line may immediately offer something else; otherwise return to the valley
    scene.resumeAdventure();
  }
}
function describeFx(id: string, value: number) {
  return describeMutation({ effects: [{ id, value, min: value, max: value }], primary: { stat: "damage", value: 0, min: 0, max: 0 }, affixes: [] } as unknown as Mutation).at(-1) ?? "";
}
