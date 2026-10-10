import type { WorldGrid } from "../world/grid";
import { ICONS } from "./icons";

export type ActionKey = "bite" | "dodge" | "skillA" | "skillB";
export interface HudSkill {
  name: string;
  icon: string;
  locked: boolean;
  hidden: boolean;
  /** remaining cooldown fraction 0..1 */
  cd: number;
  /** extra line under the button, e.g. "Lv 5" while locked */
  note?: string;
}
export interface HudState {
  name: string;
  species: string;
  level: number;
  stageName: string;
  hp: number;
  maxHp: number;
  xp: { have: number; need: number; blocked: string | null; maxed: boolean };
  /** Feast stacks 0..5 */
  feast: number;
  amber: number;
  region: string;
  quest: { title: string; text: string; dist: number | null } | null;
  dodge: { cd: number; charges: number; max: number };
  combo: { n: number; chain: number };
  skills: [HudSkill, HudSkill];
  interact: string | null;
  boss: { name: string; hp: number; max: number; phase: number; phases: number; title: string } | null;
  statuses: { id: string; label: string }[];
  portrait?: () => HTMLCanvasElement | null;
}
export interface MapMarker {
  x: number;
  y: number;
  kind: "player" | "threat" | "find" | "nest" | "goal" | "npc" | "loot";
  face?: number;
}

export class Hud {
  readonly root: HTMLElement;
  private q<T extends HTMLElement>(sel: string) {
    return this.root.querySelector<T>(sel)!;
  }
  private sig = "";
  private portraitSource?: HTMLCanvasElement;
  private toastTimer = 0;
  private toastPriority = 0;
  private toastQueue: { text: string; kind: string }[] = [];
  private callouts = new Map<string, HTMLElement>();
  private map?: { base: HTMLCanvasElement; s: number; ox: number; oy: number };
  private mapCtx: CanvasRenderingContext2D;
  private banner?: HTMLElement;
  constructor(
    parent: HTMLElement,
    private handlers: {
      press: (k: ActionKey, down: boolean) => void;
      pause: () => void;
      journal: () => void;
      pack: () => void;
      skills: () => void;
      interact: () => void;
    },
    touch: boolean,
  ) {
    this.root = document.createElement("div");
    this.root.className = "hud" + (touch ? " touch" : "");
    this.root.innerHTML = `
      <div class="hud-card">
        <canvas class="portrait" width="120" height="120" aria-hidden="true"></canvas>
        <div class="hud-card-body">
          <div class="who"><b class="lvl"></b><span class="name"></span></div>
          <div class="hp" role="progressbar" aria-label="Health"><i></i><span class="hp-num"></span></div>
          <div class="xp" role="progressbar" aria-label="Experience"><i></i></div>
          <div class="hud-row"><span class="feast" aria-label="Feast"></span><span class="amber">${ICONS.amber}<b class="amber-n">0</b></span><span class="xp-label"></span></div>
          <div class="statuses" aria-live="polite"></div>
        </div>
      </div>
      <div class="hud-region"><span class="leaf" aria-hidden="true">❦</span><span class="region-name"></span><span class="leaf flip" aria-hidden="true">❦</span></div>
      <div class="boss-bar" hidden><div class="boss-name"></div><div class="boss-hp"><i></i><u></u></div><div class="boss-title"></div></div>
      <div class="hud-topright">
        <div class="minimap"><canvas width="224" height="224" aria-hidden="true"></canvas><i class="north">N</i></div>
        <div class="hud-buttons">
          <button class="round" data-pack aria-label="Mutations">${ICONS.pack}<kbd>I</kbd></button>
          <button class="round" data-skills aria-label="Skills">${ICONS.tree}<kbd>O</kbd><u class="pip" hidden></u></button>
          <button class="round" data-journal aria-label="Journal, map and quests">${ICONS.book}<kbd>M</kbd></button>
          <button class="round" data-pause aria-label="Pause">${ICONS.pause}</button>
        </div>
        <div class="objective"><i></i><span><small class="quest-title"></small><span class="quest-text"></span></span></div>
      </div>
      <div class="callouts" aria-hidden="true"></div>
      <div class="toast" role="status" aria-live="polite"></div>
      <div class="stick" aria-hidden="true"><i></i></div>
      <div class="actions">
        <button class="act skill b" data-act="skillB" aria-label="Second skill"><span class="ring"></span><span class="ico"></span><b class="skill-name"></b><kbd>Q</kbd></button>
        <button class="act skill a" data-act="skillA" aria-label="First skill"><span class="ring"></span><span class="ico"></span><b class="skill-name"></b><kbd>E</kbd></button>
        <button class="act dodge" data-act="dodge" aria-label="Dodge"><span class="ring"></span>${ICONS.dodge}<b>Dodge</b><kbd>Space</kbd><span class="charges"></span></button>
        <button class="act bite" data-act="bite" aria-label="Attack"><span class="ring"></span>${ICONS.bite}<b>Bite</b><kbd>J</kbd><span class="combo" aria-hidden="true"></span></button>
      </div>
      <button class="interact" data-interact></button>`;
    parent.append(this.root);
    this.mapCtx = this.q<HTMLCanvasElement>(".minimap canvas").getContext("2d")!;
    this.q("[data-pause]").onclick = () => handlers.pause();
    this.q("[data-journal]").onclick = () => handlers.journal();
    this.q("[data-pack]").onclick = () => handlers.pack();
    this.q("[data-skills]").onclick = () => handlers.skills();
    this.q("[data-interact]").onclick = () => handlers.interact();
    for (const b of this.root.querySelectorAll<HTMLButtonElement>("[data-act]")) {
      const key = b.dataset.act as ActionKey;
      b.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        b.classList.add("down");
        handlers.press(key, true);
      };
      const up = () => {
        b.classList.remove("down");
        handlers.press(key, false);
      };
      b.onpointerup = up;
      b.onpointercancel = up;
      b.onlostpointercapture = up;
      b.oncontextmenu = (e) => e.preventDefault();
    }
  }
  destroy() {
    this.root.remove();
  }
  stick(dx: number, dy: number, active: boolean, ox?: number, oy?: number) {
    const el = this.q(".stick");
    el.classList.toggle("active", active);
    if (active && ox !== undefined && oy !== undefined) {
      el.style.left = ox + "px";
      el.style.top = oy + "px";
    }
    this.q(".stick i").style.transform = `translate(${dx * 38}px,${dy * 38}px)`;
  }
  /** show or hide the "unspent skill points" pip on the skills button */
  setSkillPip(on: boolean) {
    this.q<HTMLElement>(".pip").hidden = !on;
  }
  update(s: HudState, dt: number) {
    const sig = JSON.stringify([s.name, s.species, s.level, s.stageName, s.maxHp, s.xp.have, s.xp.need, s.xp.blocked, s.feast, s.amber, s.region, s.quest, s.skills.map((k) => [k.name, k.locked, k.hidden, k.note]), s.interact, s.statuses, s.dodge.max]);
    if (sig !== this.sig) {
      this.sig = sig;
      this.q(".lvl").textContent = "Lv " + s.level;
      this.q(".name").textContent = s.name + " · " + s.stageName;
      this.q(".hp").setAttribute("aria-valuemax", String(s.maxHp));
      this.q<HTMLElement>(".xp i").style.width = (s.xp.maxed ? 100 : Math.min(100, (s.xp.have / s.xp.need) * 100)) + "%";
      this.q(".xp").classList.toggle("blocked", !!s.xp.blocked);
      this.q(".xp-label").textContent = s.xp.blocked ? "Defeat " + s.xp.blocked + " to grow" : s.xp.maxed ? "Max level" : s.xp.have + " / " + s.xp.need + " xp";
      this.q(".feast").innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i < s.feast ? "on" : ""}">${ICONS.leaf}</i>`).join("");
      this.q(".feast").setAttribute("aria-label", `Feast ${s.feast} of 5`);
      this.q(".amber-n").textContent = String(s.amber);
      this.q(".region-name").textContent = s.region;
      const obj = this.q(".objective");
      obj.style.display = s.quest ? "" : "none";
      if (s.quest) {
        this.q(".quest-title").textContent = s.quest.title;
        this.q(".quest-text").textContent = s.quest.text + (s.quest.dist !== null ? " · " + Math.round(s.quest.dist) + " m" : "");
      }
      this.q(".statuses").innerHTML = s.statuses.map((x) => `<span class="st ${x.id}" title="${x.label}">${ICONS[x.id] ?? ICONS.star}<em>${x.label}</em></span>`).join("");
      const skillButtons = [this.q<HTMLButtonElement>(".act.a"), this.q<HTMLButtonElement>(".act.b")];
      s.skills.forEach((k, i) => {
        const b = skillButtons[i];
        b.hidden = k.hidden;
        b.classList.toggle("locked", k.locked);
        b.disabled = k.locked;
        b.querySelector(".skill-name")!.textContent = k.locked ? (k.note ?? "Locked") : k.name;
        b.querySelector(".ico")!.innerHTML = k.locked ? ICONS.lock : (ICONS[k.icon] ?? ICONS.roar);
        b.setAttribute("aria-label", k.locked ? `Skill locked, ${k.note ?? ""}` : k.name);
      });
      const it = this.q<HTMLButtonElement>("[data-interact]");
      it.style.display = s.interact ? "block" : "none";
      it.textContent = this.root.classList.contains("touch") ? (s.interact ?? "").replace(/ · Enter$/, "") : (s.interact ?? "") + " · Enter";
      this.q(".charges").innerHTML = s.dodge.max > 1 ? Array.from({ length: s.dodge.max }, (_, i) => `<i class="${i < s.dodge.charges ? "on" : ""}"></i>`).join("") : "";
      this.q(".bite b").textContent = s.species === "trike" ? "Gore" : s.species === "raptor" ? "Slash" : "Bite";
    }
    // fast-changing values
    this.q<HTMLElement>(".hp i").style.width = Math.max(0, Math.min(100, (s.hp / s.maxHp) * 100)) + "%";
    this.q(".hp-num").textContent = Math.max(0, Math.ceil(s.hp)) + " / " + s.maxHp;
    this.q(".hp").classList.toggle("low", s.hp / s.maxHp < 0.3);
    const combo = this.q(".combo");
    if (combo.children.length !== s.combo.chain) combo.innerHTML = Array.from({ length: s.combo.chain }, () => "<i></i>").join("");
    [...combo.children].forEach((c, i) => c.classList.toggle("on", i < s.combo.n));
    const p = s.portrait?.();
    if (p && p !== this.portraitSource) {
      this.portraitSource = p;
      const c = this.q<HTMLCanvasElement>(".portrait").getContext("2d")!;
      c.clearRect(0, 0, 120, 120);
      c.drawImage(p, 0, 0, 120, 120);
    }
    const dodgeBtn = this.q<HTMLElement>(".act.dodge");
    dodgeBtn.style.setProperty("--cd", String(s.dodge.cd));
    dodgeBtn.classList.toggle("cooling", s.dodge.cd > 0.02 && s.dodge.charges === 0);
    s.skills.forEach((k, i) => {
      const b = this.q<HTMLElement>(i === 0 ? ".act.a" : ".act.b");
      b.style.setProperty("--cd", String(k.cd));
      b.classList.toggle("cooling", k.cd > 0.02);
    });
    const boss = this.q<HTMLElement>(".boss-bar");
    boss.hidden = !s.boss;
    if (s.boss) {
      this.q(".boss-name").textContent = s.boss.name;
      this.q(".boss-title").textContent = s.boss.title;
      this.q<HTMLElement>(".boss-hp i").style.width = Math.max(0, (s.boss.hp / s.boss.max) * 100) + "%";
      this.q(".boss-hp").dataset.phase = String(s.boss.phase);
      const phases = s.boss.phases;
      const marks = Array.from({ length: Math.max(0, phases - 1) }, (_, i) => `<b style="left:${(1 - (i + 1) / phases) * 100}%"></b>`).join("");
      if (this.q(".boss-hp u").innerHTML !== marks) this.q(".boss-hp u").innerHTML = marks;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.q(".toast").classList.remove("show");
        const next = this.toastQueue.shift();
        if (next) this.toast(next.text, next.kind);
      }
    }
  }
  toast(text: string, kind = "") {
    const priority = kind === "grow" || kind === "bad" || kind === "levelup" || kind === "questdone" ? 3 : ["catch", "hint", "reward", "quest", "loot-legendary", "loot-epic"].includes(kind) ? 2 : kind === "study" ? 0 : 1;
    if (this.toastTimer > 0 && priority < this.toastPriority) {
      if (!this.toastQueue.some((t) => t.text === text)) {
        this.toastQueue.push({ text, kind });
        if (this.toastQueue.length > 4) this.toastQueue.shift();
      }
      return;
    }
    this.toastPriority = priority;
    const t = this.q(".toast");
    t.textContent = text;
    t.className = "toast show " + kind;
    this.toastTimer = kind === "levelup" || kind === "questdone" ? 4.2 : 3.4;
  }
  /** a large, brief banner for level-ups and quest completions */
  announce(title: string, sub = "", kind = "") {
    this.banner?.remove();
    const el = document.createElement("div");
    el.className = "announce " + kind;
    el.innerHTML = `<b></b><span></span>`;
    el.querySelector("b")!.textContent = title;
    el.querySelector("span")!.textContent = sub;
    this.root.append(el);
    this.banner = el;
    setTimeout(() => el.classList.add("out"), 2600);
    setTimeout(() => el.remove(), 3300);
  }
  /** world-anchored label chips (e.g. "Lunge · punish the recovery") */
  callout(id: string, text: string, x: number, y: number, kind: string) {
    let el = this.callouts.get(id);
    if (!el) {
      el = document.createElement("div");
      this.q(".callouts").append(el);
      this.callouts.set(id, el);
    }
    if (el.dataset.t !== text) {
      el.dataset.t = text;
      el.innerHTML = `<i></i><span></span>`;
      el.querySelector("span")!.textContent = text;
    }
    el.className = "callout " + kind;
    el.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
    el.dataset.seen = "1";
  }
  endCallouts() {
    for (const [id, el] of this.callouts)
      if (el.dataset.seen !== "1") {
        el.remove();
        this.callouts.delete(id);
      } else el.dataset.seen = "";
  }
  // ---------------------------------------------------------------- minimap
  buildMap(grid: WorldGrid, colors: Record<string, string>) {
    const s = 1.6; // px per unit
    const w = (grid.nx + grid.ny) * grid.cell * Math.SQRT1_2 * s + 8;
    const base = document.createElement("canvas");
    base.width = Math.ceil(w);
    base.height = Math.ceil(w);
    const c = base.getContext("2d")!;
    const ox = base.width / 2 - 0; // rotated space origin
    const step = grid.cell * 2;
    for (let gy = grid.y0; gy < grid.y0 + grid.ny * grid.cell; gy += step)
      for (let gx = grid.x0; gx < grid.x0 + grid.nx * grid.cell; gx += step) {
        const f = grid.flagsAt(gx, gy);
        const wet = (f & 2) !== 0;
        const col = wet ? ((f & 4) !== 0 ? colors.deep : colors.shallow) : (f & 1) !== 0 ? (colors[grid.surface(gx, gy)] ?? colors.grass) : colors.forest;
        c.fillStyle = col;
        const rx = (gx - gy) * Math.SQRT1_2 * s + ox,
          ry = (gx + gy) * Math.SQRT1_2 * s;
        c.fillRect(rx, ry, step * s * 0.75, step * s * 0.75);
      }
    this.map = { base, s, ox, oy: 0 };
  }
  drawMap(px: number, py: number, markers: MapMarker[], route: { x: number; y: number }[] = []) {
    const m = this.map;
    if (!m) return;
    const c = this.mapCtx,
      W = 224,
      cx = W / 2;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath();
    c.arc(cx, cx, cx - 3, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "#12291f";
    c.fillRect(0, 0, W, W);
    const rx = (px - py) * Math.SQRT1_2 * m.s + m.ox,
      ry = (px + py) * Math.SQRT1_2 * m.s;
    c.drawImage(m.base, cx - rx, cx - ry);
    if (route.length > 1) {
      c.strokeStyle = "#ffd36a";
      c.lineWidth = 3;
      c.setLineDash([6, 5]);
      c.beginPath();
      route.forEach((q, i) => {
        const x = cx + ((q.x - q.y) * Math.SQRT1_2 * m.s + m.ox - rx),
          y = cx + ((q.x + q.y) * Math.SQRT1_2 * m.s - ry);
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      });
      c.stroke();
      c.setLineDash([]);
    }
    for (const k of markers) {
      const mx = cx + ((k.x - k.y) * Math.SQRT1_2 * m.s + m.ox - rx),
        my = cx + ((k.x + k.y) * Math.SQRT1_2 * m.s - ry);
      if (k.kind === "player") continue;
      const color: Record<string, string> = { threat: "#ff5a4a", goal: "#ffb347", nest: "#ffe9a8", find: "#ffd86b", npc: "#8ff0ff", loot: "#d79bff" };
      c.fillStyle = color[k.kind] ?? "#ffd86b";
      c.strokeStyle = "#1a1a1a";
      c.lineWidth = 1.5;
      c.beginPath();
      if (k.kind === "threat") {
        c.moveTo(mx, my - 6);
        c.lineTo(mx + 5.5, my + 4.5);
        c.lineTo(mx - 5.5, my + 4.5);
      } else if (k.kind === "npc") {
        c.rect(mx - 4, my - 4, 8, 8);
      } else {
        c.arc(mx, my, k.kind === "goal" ? 5 : k.kind === "loot" ? 3 : 4, 0, 7);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
    // player arrow (always centred, pointing along its screen heading)
    const player = markers.find((k) => k.kind === "player");
    const a = Math.atan2(Math.sin(player?.face ?? 0) + Math.cos(player?.face ?? 0), Math.cos(player?.face ?? 0) - Math.sin(player?.face ?? 0));
    c.save();
    c.translate(cx, cx);
    c.rotate(a + Math.PI / 2);
    c.fillStyle = "#fffbe8";
    c.strokeStyle = "#143023";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(7, 8);
    c.lineTo(0, 4);
    c.lineTo(-7, 8);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  }
}
