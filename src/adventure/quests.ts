/** Quest engine: data-driven steps (talk, track, kill, boss, find, goto, choice, escort, protect, plates, collect, flag), journal
 *  lines, guidance targets and rewards. Pure TS; the simulation feeds it events and the HUD/journal read it.
 *
 *  No soft locks, by construction:
 *   - every step is idempotent and checks the world on entry, so a boss already beaten or a fossil already found completes it;
 *   - kill steps count respawning creatures and quest-spawned reinforcements are re-spawned when they are gone;
 *   - escort/protect steps never fail; dying simply restarts the wave from the refuge;
 *   - progress lives in `Character.quests` and is saved with the character.
 */
import type { Point, RegionId } from "./data";
import type { Character } from "../rpg/character";
import type { Rarity, Slot } from "../rpg/types";
import type { AdventureEvent } from "./sim-types";

export interface SpawnDef {
  id: string;
  at: Point;
  count?: number;
  level?: number;
  /** spread radius for count > 1 */
  spread?: number;
  /** begin as a rustling ambusher */
  dormant?: boolean;
  /** spawn as a talkative NPC with this id instead of a creature */
  npc?: string;
  /** hatchlings that follow the player (escort steps) */
  follow?: boolean;
}
export type LootSpec = { rarity: Rarity; slot?: Slot; unique?: string };
export interface Effects {
  flag?: string[];
  unflag?: string[];
  spawn?: SpawnDef[];
  xp?: number;
  amber?: number;
  loot?: LootSpec;
  toast?: string;
  /** remove every quest-spawned creature carrying this quest's tag */
  clear?: boolean;
}
interface StepBase {
  /** journal line */
  text: string;
  /** the step only exists on the branch where this world flag is set (set by a choice); otherwise it is skipped */
  onlyIf?: string;
  /** where the guide arrow points; steps that have a natural target compute it themselves */
  at?: Point;
  onEnter?: Effects;
  onDone?: Effects;
  /** hint shown once when the step begins */
  hint?: string;
}
export interface TalkStep extends StepBase {
  type: "talk";
  npc: string;
  /** dialogue pages played when the player talks to the NPC during this step */
  dialogue: DialoguePage[];
}
export interface GotoStep extends StepBase {
  type: "goto";
  at: Point;
  radius: number;
}
export interface KillStep extends StepBase {
  type: "kill";
  creature?: string;
  archetype?: string;
  count: number;
  /** only kills inside this region count */
  region?: RegionId;
  /** only creatures this quest spawned count (set automatically when the step has a spawn list) */
  tagged?: boolean;
  /** creatures spawned when the step starts (tagged to the quest) */
  spawn?: SpawnDef[];
}
export interface BossStep extends StepBase {
  type: "boss";
  rival: string;
}
export interface FindStep extends StepBase {
  type: "find";
  discovery: string;
}
export interface TrackStep extends StepBase {
  type: "track";
  clues: Point[];
  /** what the player notices at each clue, in order */
  lines: string[];
  radius?: number;
}
export interface CollectStep extends StepBase {
  type: "collect";
  items: Point[];
  label: string;
}
export interface ChoiceStep extends StepBase {
  type: "choice";
  prompt: DialoguePage[];
  options: { id: string; text: string; flag?: string }[];
  npc?: string;
}
export interface PlatesStep extends StepBase {
  type: "plates";
  plates: Point[];
  /** indices in the order they must be stepped on */
  order: number[];
  /** shown on a wrong step */
  wrong: string;
  /** shown when the order is hinted (e.g. footprint sizes) */
  clue: string;
  radius?: number;
}
export interface ProtectStep extends StepBase {
  type: "protect";
  at: Point;
  radius: number;
  waves: { spawn: SpawnDef[]; text: string }[];
}
export interface EscortStep extends StepBase {
  type: "escort";
  from: Point;
  to: Point;
  /** hatchlings that follow the player */
  count: number;
  radius: number;
  spawn?: SpawnDef[];
}
export interface FlagStep extends StepBase {
  type: "flag";
  flag: string;
}
export type StepDef = TalkStep | GotoStep | KillStep | BossStep | FindStep | TrackStep | CollectStep | ChoiceStep | PlatesStep | ProtectStep | EscortStep | FlagStep;

export interface DialoguePage {
  speaker: string;
  text: string;
}
export interface QuestReward {
  xp: number;
  amber?: number;
  loot?: LootSpec;
  flags?: string[];
  /** world change announced on completion */
  world?: string;
  text?: string;
}
export interface QuestRequires {
  quests?: string[];
  level?: number;
  flags?: string[];
  rivals?: string[];
}
export interface QuestDef {
  id: string;
  title: string;
  kind: "main" | "side";
  region: RegionId;
  level: number;
  /** NPC who offers it; null = starts by itself when its requirements are met */
  giver: string | null;
  summary: string;
  offer: DialoguePage[];
  steps: StepDef[];
  reward: QuestReward;
  requires?: QuestRequires;
  /** shown after completion when the giver is spoken to */
  after?: DialoguePage[];
}

export interface NpcDef {
  id: string;
  name: string;
  /** creature sprite id */
  creature: string;
  home: Point;
  region: RegionId;
  /** present only once this world flag is set */
  appears?: string;
  scale?: number;
  tint?: number;
  /** short, warm barks when nothing else is going on; may depend on world flags */
  chatter: { text: string; flag?: string; notFlag?: string }[];
  /** one-line description for the journal's "people" page */
  about: string;
}

export interface QuestHost {
  save: Character;
  readonly player: Point;
  readonly time: number;
  readonly level: number;
  emitEvent(type: AdventureEvent["type"], at: Point, extra?: Partial<AdventureEvent>): void;
  spawnTagged(tag: string, def: SpawnDef): void;
  clearTagged(tag: string): void;
  countTagged(tag: string, alive?: boolean): number;
  gainXp(n: number, at: Point): void;
  giveLoot(spec: LootSpec): void;
  setFlag(f: string): void;
  npcPosition(id: string): Point | null;
  nearestActor(pred: (a: { spec: { id: string; archetype: string }; x: number; y: number; state: string }) => boolean): Point | null;
  rivalHome(id: string): Point | null;
  discoveryAt(id: string): Point | null;
  escortStart(tag: string, from: Point, count: number): void;
  escortHome(tag: string): { alive: number; near: number };
  escortRelease(tag: string): void;
}

export interface DialogueSession {
  id: number;
  npc: string;
  name: string;
  pages: DialoguePage[];
  /** present when the last page asks the player to choose */
  choices?: { id: string; text: string }[];
  /** what happens when the session ends */
  kind: "chatter" | "offer" | "step" | "choice" | "after";
  quest?: string;
}
export interface JournalEntry {
  id: string;
  title: string;
  kind: "main" | "side";
  region: RegionId;
  status: "active" | "done" | "available";
  summary: string;
  steps: { text: string; state: "done" | "current" | "todo" }[];
  tracked: boolean;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export class QuestEngine {
  /** which quest the arrow follows; main quests win ties */
  tracked: string | null = null;
  private sessionId = 0;
  private pending = new Map<number, { quest: string; kind: DialogueSession["kind"]; step?: number }>();
  private plateProgress = new Map<string, number>();
  private clueShown = new Set<string>();
  private escortTick = 0;
  private lastBoot = false;
  constructor(
    private host: QuestHost,
    readonly defs: QuestDef[],
    readonly npcs: NpcDef[],
  ) {}

  // ------------------------------------------------------------ lookup
  def(id: string) {
    return this.defs.find((q) => q.id === id);
  }
  npc(id: string) {
    return this.npcs.find((n) => n.id === id);
  }
  private get save() {
    return this.host.save;
  }
  state(id: string) {
    return this.save.quests[id];
  }
  isDone(id: string) {
    return this.save.quests[id]?.status === "done";
  }
  /** requirement check for offering or auto-starting a quest */
  eligible(q: QuestDef): boolean {
    const r = q.requires;
    if (this.state(q.id)) return false;
    if (!r) return true;
    if (r.level && this.host.level < r.level) return false;
    if (r.quests?.some((id) => !this.isDone(id))) return false;
    if (r.flags?.some((f) => !this.save.flags.includes(f))) return false;
    if (r.rivals?.some((id) => !this.save.rivals.includes(id))) return false;
    return true;
  }
  available(): QuestDef[] {
    return this.defs.filter((q) => q.giver && this.eligible(q));
  }
  activeIds() {
    return Object.entries(this.save.quests)
      .filter(([id, s]) => s.status === "active" && !!this.def(id))
      .map(([id]) => id);
  }
  stepOf(id: string): StepDef | undefined {
    const s = this.state(id);
    return s && s.status === "active" ? this.def(id)?.steps[s.step] : undefined;
  }

  // ------------------------------------------------------------ lifecycle
  /** called once after the world is built: auto-start eligible main quests, re-enter active steps, catch up migrated saves */
  boot() {
    if (this.lastBoot) return;
    this.lastBoot = true;
    this.catchUp();
    for (const id of this.activeIds()) this.enterStep(id, true);
    this.autoStart();
    this.retrack();
  }
  /** a migrated adventure keeps what it earned: chapters that its progress already proves are marked done */
  private catchUp() {
    const s = this.save;
    if (!s.flags.includes("legacy") || s.flags.includes("legacy-caught-up")) return;
    s.flags.push("legacy-caught-up");
    const done = (id: string, at = Date.now()) => {
      if (!this.def(id) || s.quests[id]) return;
      s.quests[id] = { status: "done", step: this.def(id)!.steps.length, progress: 0, data: { legacy: true }, startedAt: at, doneAt: at };
      for (const f of this.def(id)!.reward.flags ?? []) if (!s.flags.includes(f)) s.flags.push(f);
    };
    if (s.rivals.includes("old-scar") || s.rivals.includes("river-hunter") || s.discoveries.includes("egg-hollow") || s.regions.includes("river")) {
      done("quiet-nest");
      done("missing-hatchlings");
    }
    if (s.rivals.includes("river-hunter")) done("river-hunter");
    if (s.rivals.includes("marsh-pack")) done("marsh-lanterns");
  }
  autoStart() {
    for (const q of this.defs) if (q.giver === null && this.eligible(q)) this.start(q.id);
  }
  start(id: string): boolean {
    const q = this.def(id);
    if (!q || this.state(id)) return false;
    this.save.quests[id] = { status: "active", step: 0, progress: 0, data: {}, startedAt: this.host.time };
    this.host.emitEvent("quest", this.host.player, { id, text: `New quest · ${q.title}`, kind: q.kind });
    if (!this.tracked || q.kind === "main") this.tracked = id;
    this.enterStep(id, false);
    return true;
  }
  private apply(e: Effects | undefined, quest: string) {
    if (!e) return;
    for (const f of e.flag ?? []) this.host.setFlag(f);
    for (const f of e.unflag ?? []) this.save.flags = this.save.flags.filter((x) => x !== f);
    if (e.clear) this.host.clearTagged(quest);
    for (const s of e.spawn ?? []) this.host.spawnTagged(quest, s);
    if (e.xp) this.host.gainXp(e.xp, this.host.player);
    if (e.amber) this.save.amber += e.amber;
    if (e.loot) this.host.giveLoot(e.loot);
    if (e.toast) this.host.emitEvent("notice", this.host.player, { text: e.toast });
  }
  /** begin a step: apply its entry effects, spawn its creatures, complete it at once if the world already satisfies it */
  private enterStep(id: string, resume: boolean): void {
    const q = this.def(id),
      st = this.state(id);
    if (!q || !st || st.status !== "active") return;
    const step = q.steps[st.step];
    if (!step) return this.finish(id);
    if (step.onlyIf && !this.save.flags.includes(step.onlyIf)) {
      st.step++;
      return this.enterStep(id, false);
    }
    if (!resume) {
      st.progress = 0;
      this.apply(step.onEnter, id);
      if (step.hint) this.host.emitEvent("notice", this.host.player, { text: step.hint });
    }
    if ((step.type === "kill" || step.type === "protect" || step.type === "escort") && "spawn" in step && step.spawn) {
      if (resume) this.respawnStepCreatures(id, step);
      else for (const s of step.spawn) this.host.spawnTagged(id, s);
    }
    if (step.type === "escort") this.host.escortStart(id, step.from, step.count);
    // a reload mid-defence: the wave's creatures are not saved, so they are called again rather than counted as beaten
    if (resume && step.type === "protect" && typeof st.data.wave === "number" && st.data.wave >= 0 && this.host.countTagged(id, true) === 0) this.startWave(id, step, Math.min(st.data.wave, step.waves.length - 1));
    this.checkInstant(id);
  }
  private respawnStepCreatures(id: string, step: KillStep | EscortStep) {
    if (step.type === "kill" && step.spawn && this.host.countTagged(id, true) === 0 && (this.state(id)?.progress ?? 0) < step.count) for (const s of step.spawn) this.host.spawnTagged(id, s);
  }
  private checkInstant(id: string) {
    const step = this.stepOf(id);
    if (!step) return;
    if (step.type === "boss" && this.save.rivals.includes(step.rival)) return this.advance(id);
    if (step.type === "find" && this.save.discoveries.includes(step.discovery)) return this.advance(id);
    if (step.type === "flag" && this.save.flags.includes(step.flag)) return this.advance(id);
  }
  advance(id: string) {
    const q = this.def(id),
      st = this.state(id);
    if (!q || !st || st.status !== "active") return;
    const step = q.steps[st.step];
    this.apply(step?.onDone, id);
    if (step?.type === "escort") this.host.escortRelease(id);
    st.step++;
    st.progress = 0;
    this.host.emitEvent("quest", this.host.player, { id, text: step?.text ?? "", kind: "step" });
    if (st.step >= q.steps.length) this.finish(id);
    else this.enterStep(id, false);
  }
  private finish(id: string) {
    const q = this.def(id),
      st = this.state(id);
    if (!q || !st) return;
    st.status = "done";
    st.doneAt = this.host.time;
    st.step = q.steps.length;
    this.host.clearTagged(id);
    const r = q.reward;
    this.host.gainXp(r.xp, this.host.player);
    if (r.amber) this.save.amber += r.amber;
    if (r.loot) this.host.giveLoot(r.loot);
    for (const f of r.flags ?? []) this.host.setFlag(f);
    if (r.world) this.host.setFlag(r.world);
    this.host.emitEvent("questdone", this.host.player, { id, text: q.title, reward: r.xp, kind: q.kind });
    if (r.text) this.host.emitEvent("notice", this.host.player, { text: r.text });
    if (this.tracked === id) this.tracked = null;
    this.autoStart();
    this.retrack();
  }
  /** choose what the arrow follows: the tracked quest if still active, else the first active main quest, else any */
  retrack() {
    const active = this.activeIds();
    if (this.tracked && active.includes(this.tracked)) return;
    this.tracked = active.find((id) => this.def(id)?.kind === "main") ?? active[0] ?? null;
  }
  track(id: string) {
    if (this.activeIds().includes(id)) this.tracked = id;
  }

  // ------------------------------------------------------------ events from the simulation
  handle(e: AdventureEvent) {
    for (const id of this.activeIds()) {
      const q = this.def(id)!,
        st = this.state(id)!,
        step = q.steps[st.step];
      if (!step) continue;
      switch (step.type) {
        case "kill":
          if (e.type === "kill" && this.killMatches(step, e, id)) {
            st.progress++;
            this.host.emitEvent("quest", e, { id, text: `${step.text} · ${Math.min(st.progress, step.count)}/${step.count}`, kind: "progress" });
            if (st.progress >= step.count) this.advance(id);
          }
          break;
        case "boss":
          if (e.type === "victory" && e.kind === "boss" && e.id === step.rival) this.advance(id);
          break;
        case "find":
          if (e.type === "discovery" && e.id === step.discovery) this.advance(id);
          break;
        case "flag":
          if (e.type === "world" && e.id === step.flag) this.advance(id);
          break;
        default:
          break;
      }
    }
  }
  private killMatches(step: KillStep, e: AdventureEvent, questId: string) {
    if ((step.tagged || (step.spawn && !step.creature && !step.archetype)) && e.tag !== questId) return false;
    if (step.creature && e.id !== step.creature) return false;
    if (step.archetype && e.kind !== step.archetype) return false;
    if (step.region && !this.inRegion(e, step.region)) return false;
    return true;
  }
  private regionOf?: (p: Point) => RegionId | undefined;
  setRegionLookup(fn: (p: Point) => RegionId | undefined) {
    this.regionOf = fn;
  }
  private inRegion(p: Point, r: RegionId) {
    return !this.regionOf || this.regionOf(p) === r;
  }

  // ------------------------------------------------------------ per-frame proximity steps
  update(dt: number) {
    const p = this.host.player;
    for (const id of this.activeIds()) {
      const q = this.def(id)!,
        st = this.state(id)!,
        step = q.steps[st.step];
      if (!step) continue;
      switch (step.type) {
        case "goto":
          if (dist(p, step.at) <= step.radius) this.advance(id);
          break;
        case "track": {
          const i = st.progress;
          const clue = step.clues[i];
          if (clue && dist(p, clue) <= (step.radius ?? 2.4)) {
            st.progress++;
            this.host.emitEvent("quest", clue, { id, text: step.lines[i] ?? "A clue", kind: "clue" });
            if (st.progress >= step.clues.length) this.advance(id);
          }
          break;
        }
        case "collect": {
          const got = (st.data.got as string | undefined)?.split(",").filter(Boolean) ?? [];
          for (let i = 0; i < step.items.length; i++) {
            if (got.includes(String(i)) || dist(p, step.items[i]) > 1.8) continue;
            got.push(String(i));
            st.data.got = got.join(",");
            st.progress = got.length;
            this.host.emitEvent("quest", step.items[i], { id, text: `${step.label} · ${got.length}/${step.items.length}`, kind: "progress" });
          }
          if (got.length >= step.items.length) this.advance(id);
          break;
        }
        case "plates": {
          const key = id + ":" + st.step;
          let progress = this.plateProgress.get(key) ?? 0;
          for (let i = 0; i < step.plates.length; i++) {
            if (dist(p, step.plates[i]) > (step.radius ?? 1.4)) continue;
            if (st.data.on === i) continue;
            st.data.on = i;
            if (step.order[progress] === i) {
              progress++;
              this.host.emitEvent("quest", step.plates[i], { id, text: `A stone hums · ${progress}/${step.order.length}`, kind: "plate" });
              if (progress >= step.order.length) {
                this.plateProgress.delete(key);
                return this.advance(id);
              }
            } else if (progress > 0 || i !== step.order[0]) {
              progress = i === step.order[0] ? 1 : 0;
              this.host.emitEvent("quest", step.plates[i], { id, text: step.wrong, kind: "plate-wrong" });
            }
            this.plateProgress.set(key, progress);
          }
          if (step.plates.every((pl) => dist(p, pl) > (step.radius ?? 1.4) + 0.3)) st.data.on = -1;
          st.progress = progress;
          break;
        }
        case "protect": {
          const wave = Math.floor(st.data.wave === undefined ? -1 : (st.data.wave as number));
          const near = dist(p, step.at) <= step.radius;
          if (wave < 0 && near) {
            st.data.wave = 0;
            this.startWave(id, step, 0);
          } else if (wave >= 0) {
            if (this.host.countTagged(id, true) === 0) {
              if (wave + 1 >= step.waves.length) this.advance(id);
              else {
                st.data.wave = wave + 1;
                this.startWave(id, step, wave + 1);
              }
            }
          }
          break;
        }
        case "escort": {
          this.escortTick -= dt;
          if (this.escortTick > 0) break;
          this.escortTick = 0.25;
          const h = this.host.escortHome(id);
          if (h.alive === 0) {
            // never a dead end: if the hatchlings are gone, they are brought back at the start
            this.host.escortStart(id, step.from, step.count);
          } else if (h.near >= h.alive && dist(p, step.to) <= step.radius) this.advance(id);
          break;
        }
        default:
          break;
      }
      this.maintain(id, step);
    }
  }
  private startWave(id: string, step: ProtectStep, i: number) {
    const w = step.waves[i];
    this.host.emitEvent("quest", step.at, { id, text: w.text, kind: "wave" });
    for (const s of w.spawn) this.host.spawnTagged(id, s);
  }
  /** keep long fights fair: a kill step whose reinforcements are all gone but the count is unmet re-spawns them (no dead ends) */
  private maintain(id: string, step: StepDef) {
    const st = this.state(id);
    if (!st || step.type !== "kill" || !step.spawn) return;
    if (st.progress < step.count && this.host.countTagged(id, true) === 0 && this.host.time - ((st.data.respawnAt as number) ?? -99) > 4) {
      st.data.respawnAt = this.host.time;
      for (const s of step.spawn) this.host.spawnTagged(id, s);
    }
  }
  /** the player was defeated: restart wave-style steps so the fight can be retried from the refuge */
  onDefeat() {
    for (const id of this.activeIds()) {
      const st = this.state(id)!,
        step = this.def(id)!.steps[st.step];
      if (step?.type === "protect") {
        this.host.clearTagged(id);
        delete st.data.wave;
        st.progress = 0;
        this.host.emitEvent("notice", this.host.player, { text: "The nest holds · return to try the defence again" });
      }
    }
  }

  // ------------------------------------------------------------ dialogue
  /** what an NPC says right now: a step's dialogue, a quest offer, a hand-in, a choice, or a bit of chatter */
  talk(npcId: string): DialogueSession | null {
    const npc = this.npc(npcId);
    if (!npc) return null;
    const mk = (kind: DialogueSession["kind"], pages: DialoguePage[], quest?: string, choices?: DialogueSession["choices"], step?: number): DialogueSession => {
      const id = ++this.sessionId;
      this.pending.set(id, { quest: quest ?? "", kind, step });
      return { id, npc: npc.id, name: npc.name, pages, kind, quest, choices };
    };
    // 1. an active quest waiting on this NPC
    for (const qid of this.activeIds()) {
      const q = this.def(qid)!,
        st = this.state(qid)!,
        step = q.steps[st.step];
      if (step?.type === "talk" && step.npc === npcId) return mk("step", step.dialogue, qid, undefined, st.step);
      if (step?.type === "choice" && (step.npc ?? q.giver) === npcId) return mk("choice", step.prompt, qid, step.options.map((o) => ({ id: o.id, text: o.text })), st.step);
    }
    // 2. an offer
    const offer = this.available().find((q) => q.giver === npcId);
    if (offer) return mk("offer", offer.offer, offer.id);
    // 3. a recently finished quest's closing words, once
    for (const q of this.defs) {
      if (q.giver === npcId && q.after && this.isDone(q.id) && !this.state(q.id)!.data.afterSeen) return mk("after", q.after, q.id);
    }
    // 4. chatter
    const lines = npc.chatter.filter((c) => (!c.flag || this.save.flags.includes(c.flag)) && (!c.notFlag || !this.save.flags.includes(c.notFlag)));
    const pick = lines.length ? lines[(this.save.stats.kills + this.sessionId) % lines.length] : { text: "…" };
    return mk("chatter", [{ speaker: npc.name, text: pick.text }]);
  }
  /** the dialogue session was dismissed or a choice was made */
  finishDialogue(sessionId: number, choice?: string) {
    const p = this.pending.get(sessionId);
    if (!p) return;
    this.pending.delete(sessionId);
    if (p.kind === "offer") this.start(p.quest);
    else if (p.kind === "step") {
      const st = this.state(p.quest);
      if (st && st.step === p.step) this.advance(p.quest);
    } else if (p.kind === "choice") {
      const st = this.state(p.quest);
      const step = this.def(p.quest)?.steps[st?.step ?? -1];
      if (st && step?.type === "choice" && st.step === p.step) {
        const opt = step.options.find((o) => o.id === choice) ?? step.options[0];
        st.data.choice = opt.id;
        if (opt.flag) this.host.setFlag(opt.flag);
        this.advance(p.quest);
      }
    } else if (p.kind === "after") {
      const st = this.state(p.quest);
      if (st) st.data.afterSeen = true;
    }
  }
  /** Is there something an NPC wants to say right now? (for the "!" marker above their head) */
  marker(npcId: string): "offer" | "turnin" | "choice" | "" {
    for (const qid of this.activeIds()) {
      const q = this.def(qid)!,
        step = this.stepOf(qid);
      if (step?.type === "talk" && step.npc === npcId) return "turnin";
      if (step?.type === "choice" && (step.npc ?? q.giver) === npcId) return "choice";
    }
    return this.available().some((q) => q.giver === npcId) ? "offer" : "";
  }

  // ------------------------------------------------------------ guidance and journal
  /** the point the arrow, minimap marker and distance chip follow for a quest */
  targetOf(id: string): Point | null {
    const q = this.def(id),
      st = this.state(id);
    if (!q || !st || st.status !== "active") return null;
    const step = q.steps[st.step];
    if (!step) return null;
    const p = this.host.player;
    switch (step.type) {
      case "talk":
        return this.host.npcPosition(step.npc) ?? step.at ?? null;
      case "goto":
        return step.at;
      case "track":
        return step.clues[Math.min(st.progress, step.clues.length - 1)];
      case "find":
        return this.host.discoveryAt(step.discovery) ?? step.at ?? null;
      case "boss":
        return this.host.rivalHome(step.rival) ?? step.at ?? null;
      case "kill":
        return this.host.nearestActor((a) => a.state !== "dead" && (!step.creature || a.spec.id === step.creature) && (!step.archetype || a.spec.archetype === step.archetype) && (!step.region || this.inRegion(a, step.region))) ?? step.at ?? step.spawn?.[0]?.at ?? null;
      case "collect": {
        const got = (st.data.got as string | undefined)?.split(",") ?? [];
        const left = step.items.filter((_, i) => !got.includes(String(i)));
        return left.sort((a, b) => dist(a, p) - dist(b, p))[0] ?? null;
      }
      case "plates": {
        const progress = this.plateProgress.get(id + ":" + st.step) ?? 0;
        return step.plates[step.order[Math.min(progress, step.order.length - 1)]] ?? null;
      }
      case "protect":
        return step.at;
      case "escort":
        return this.host.escortHome(id).near >= this.host.escortHome(id).alive ? step.to : step.from;
      case "choice":
        return this.host.npcPosition(step.npc ?? q.giver ?? "") ?? step.at ?? null;
      case "flag":
        return step.at ?? null;
      default:
        return null;
    }
  }
  /** HUD tracker line + target for the tracked quest */
  tracker(): { text: string; target: Point | null; quest: string } | null {
    this.retrack();
    const id = this.tracked;
    if (!id) return null;
    const q = this.def(id)!,
      st = this.state(id)!,
      step = q.steps[st.step];
    if (!step) return null;
    let text = step.text;
    if (step.type === "kill") text += ` · ${Math.min(st.progress, step.count)}/${step.count}`;
    if (step.type === "track") text += ` · ${st.progress}/${step.clues.length}`;
    if (step.type === "collect") text += ` · ${st.progress}/${step.items.length}`;
    return { text, target: this.targetOf(id), quest: q.title };
  }
  /** world markers for the current step of every active quest: clues, items, plates, destinations (drawn by the scene) */
  visuals(): { kind: "clue" | "item" | "plate" | "goal"; x: number; y: number; on?: boolean; quest: string }[] {
    const out: { kind: "clue" | "item" | "plate" | "goal"; x: number; y: number; on?: boolean; quest: string }[] = [];
    for (const id of this.activeIds()) {
      const q = this.def(id)!,
        st = this.state(id)!,
        step = q.steps[st.step];
      if (!step) continue;
      if (step.type === "track") {
        const c = step.clues[Math.min(st.progress, step.clues.length - 1)];
        if (c) out.push({ kind: "clue", x: c.x, y: c.y, quest: id });
      } else if (step.type === "collect") {
        const got = (st.data.got as string | undefined)?.split(",") ?? [];
        step.items.forEach((p, i) => !got.includes(String(i)) && out.push({ kind: "item", x: p.x, y: p.y, quest: id }));
      } else if (step.type === "plates") {
        step.plates.forEach((p, i) => out.push({ kind: "plate", x: p.x, y: p.y, on: st.data.on === i, quest: id }));
      } else if (step.type === "goto" || step.type === "protect") out.push({ kind: "goal", x: step.at.x, y: step.at.y, quest: id });
    }
    return out;
  }
  journal(): JournalEntry[] {
    const out: JournalEntry[] = [];
    for (const q of this.defs) {
      const st = this.state(q.id);
      if (!st) continue;
      out.push({
        id: q.id,
        title: q.title,
        kind: q.kind,
        region: q.region,
        status: st.status,
        summary: q.summary,
        tracked: this.tracked === q.id,
        steps: q.steps.filter((s) => !s.onlyIf || this.save.flags.includes(s.onlyIf) || st.status === "done").map((s) => ({ text: s.text, state: (st.status === "done" || q.steps.indexOf(s) < st.step ? "done" : q.steps.indexOf(s) === st.step ? "current" : "todo") as "done" | "current" | "todo" })),
      });
    }
    // active first, main before side
    return out.sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || Number(b.kind === "main") - Number(a.kind === "main"));
  }
}
