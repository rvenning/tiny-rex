import type { WorldGrid } from "../world/grid";

export type ActionKey = "bite" | "dodge" | "skill";
export interface HudState {
  dinoName: string;
  stage: number;
  stageName: string;
  hp: number;
  growth: { have: number; need: number; blocked: string | null } | null;
  region: string;
  objective: string;
  cooldown: Record<ActionKey, number>; // 0..1 remaining fraction
  skillName: string;
  skillLocked: boolean;
  interact: string | null;
  portrait?: () => HTMLCanvasElement | null;
}
export interface MapMarker {
  x: number;
  y: number;
  kind: "player" | "threat" | "find" | "nest" | "goal";
  face?: number;
}

const ICONS: Record<string, string> = {
  bite: `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M7 31c4-13 15-21 25-21s21 8 25 21l-5 2-4-6-4 7-4-6-4 7-4-6-4 7-4-6-4 7-4-6-4 7z"/><path fill="currentColor" d="M9 38l5 2 4-6 4 7 4-6 4 7 4-6 4 7 4-6 4 7 5-2c-3 11-13 17-24 17S12 49 9 38z"/></svg>`,
  dodge: `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M10 20h22l-6 6H10zM6 32h28l-6 6H6zM14 44h20l-6 6H14z" opacity=".6"/><path fill="currentColor" d="M34 14l22 18-22 18v-11H24V25h10z"/></svg>`,
  roar: `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M8 40c0-10 7-18 17-18l12-6 4 8 6 2-6 6 6 12-14-4-8 8-4-8c-9 0-13-4-13-12z"/><path fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" d="M46 24c4 3 6 6 6 10M52 18c6 5 9 10 9 16"/></svg>`,
  pounce: `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" d="M10 48C20 18 40 12 54 22M54 22l-14-2M54 22l-4 13"/></svg>`,
  charge: `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M6 40c4-12 16-18 30-16l14-10-2 14 8 8-14 2-6 10-6-9-24-3z"/><path fill="currentColor" d="M2 30h14v4H2zM0 40h12v4H0z" opacity=".6"/></svg>`,
  lock: `<svg viewBox="0 0 64 64" aria-hidden="true"><path fill="currentColor" d="M16 28h32v26H16z"/><path fill="none" stroke="currentColor" stroke-width="6" d="M22 28v-8a10 10 0 0 1 20 0v8"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 4h6c1 0 1.5.4 1 1v15c-.5-.6-1-1-2-1H5zM19 4h-6c-1 0-1.5.4-1 1v15c.5-.6 1-1 2-1h5z"/></svg>`,
};
const heart = (fill: number, id: number) =>
  `<svg viewBox="0 0 32 30" class="heart" aria-hidden="true"><defs><clipPath id="hc${id}"><rect width="${Math.max(0, Math.min(1, fill)) * 32}" height="30"/></clipPath></defs><path d="M16 28C4 19 1 13 1 8a7 7 0 0 1 15-2 7 7 0 0 1 15 2c0 5-3 11-15 20z" fill="#1d0f12" stroke="#f2a1a1" stroke-width="2"/><path clip-path="url(#hc${id})" d="M16 28C4 19 1 13 1 8a7 7 0 0 1 15-2 7 7 0 0 1 15 2c0 5-3 11-15 20z" fill="#e8454d"/></svg>`;

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
  constructor(
    parent: HTMLElement,
    private handlers: {
      press: (k: ActionKey, down: boolean) => void;
      pause: () => void;
      journal: () => void;
      interact: () => void;
    },
    touch: boolean,
  ) {
    this.root = document.createElement("div");
    this.root.className = "hud" + (touch ? " touch" : "");
    this.root.innerHTML = `
      <div class="hud-card"><canvas class="portrait" width="120" height="120" aria-hidden="true"></canvas><div class="hud-card-body"><b class="stage"></b><div class="hearts" role="img"></div><span class="growth-label"></span><div class="growth-bar"><i></i></div></div></div>
      <div class="hud-region"><span class="leaf" aria-hidden="true">❦</span><span class="region-name"></span><span class="leaf flip" aria-hidden="true">❦</span></div>
      <div class="hud-topright">
        <div class="minimap"><canvas width="224" height="224" aria-hidden="true"></canvas><i class="north">N</i></div>
        <div class="hud-buttons"><button class="round" data-journal aria-label="Map and creature book">${ICONS.book}</button><button class="round" data-pause aria-label="Pause">${ICONS.pause}</button></div>
        <div class="objective"><i></i><span></span></div>
      </div>
      <div class="callouts" aria-hidden="true"></div>
      <div class="toast" role="status" aria-live="polite"></div>
      <div class="stick" aria-hidden="true"><i></i></div>
      <div class="actions">
        <button class="act" data-act="bite" aria-label="Bite"><span class="ring"></span>${ICONS.bite}<b>Bite</b><kbd>J</kbd></button>
        <button class="act" data-act="dodge" aria-label="Dodge"><span class="ring"></span>${ICONS.dodge}<b>Dodge</b><kbd>Space</kbd></button>
        <button class="act" data-act="skill" aria-label="Species skill"><span class="ring"></span><span class="ico"></span><b class="skill-name"></b><kbd>E</kbd></button>
      </div>
      <button class="interact" data-interact></button>`;
    parent.append(this.root);
    this.mapCtx =
      this.q<HTMLCanvasElement>(".minimap canvas").getContext("2d")!;
    this.q("[data-pause]").onclick = () => handlers.pause();
    this.q("[data-journal]").onclick = () => handlers.journal();
    this.q("[data-interact]").onclick = () => handlers.interact();
    for (const b of this.root.querySelectorAll<HTMLButtonElement>(
      "[data-act]",
    )) {
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
  update(s: HudState, dt: number) {
    const hearts = [0, 1, 2].map((i) => heart(s.hp - i, i)).join("");
    const sig = JSON.stringify([
      s.dinoName,
      s.stage,
      Math.ceil(s.hp * 8),
      s.growth,
      s.region,
      s.objective,
      s.skillName,
      s.skillLocked,
      s.interact,
    ]);
    if (sig !== this.sig) {
      this.sig = sig;
      this.q(".stage").textContent =
        s.stage >= 3 && !s.growth
          ? s.stageName + " " + s.dinoName
          : s.stageName + " " + s.dinoName;
      this.q(".hearts").innerHTML = hearts;
      this.q(".hearts").setAttribute(
        "aria-label",
        `${s.hp.toFixed(1)} of 3 health`,
      );
      const g = s.growth;
      this.q(".growth-label").textContent = g
        ? g.blocked
          ? `Defeat the ${g.blocked}`
          : `Growth ${g.have} / ${g.need}`
        : "Growth complete";
      this.q<HTMLElement>(".growth-bar i").style.width =
        (g ? Math.min(100, (g.have / g.need) * 100) : 100) + "%";
      this.q(".region-name").textContent = s.region;
      this.q(".objective span").textContent = s.objective;
      this.q(".skill-name").textContent = s.skillLocked
        ? "Locked"
        : s.skillName;
      this.q(".act[data-act=skill] .ico").innerHTML = s.skillLocked
        ? ICONS.lock
        : (ICONS[s.skillName.toLowerCase()] ?? ICONS.roar);
      const biteButton = this.q<HTMLButtonElement>(".act[data-act=bite]");
      biteButton.querySelector("b")!.textContent =
        s.dinoName === "Triceratops" ? "Graze" : "Bite";
      biteButton.setAttribute(
        "aria-label",
        s.dinoName === "Triceratops" ? "Graze or defend with horns" : "Bite",
      );
      const skillButton = this.q<HTMLButtonElement>(".act[data-act=skill]");
      skillButton.classList.toggle("locked", s.skillLocked);
      skillButton.disabled = s.skillLocked;
      skillButton.setAttribute(
        "aria-label",
        s.skillLocked ? "Species skill unlocks as you grow" : s.skillName,
      );
      const it = this.q<HTMLButtonElement>("[data-interact]");
      it.style.display = s.interact ? "block" : "none";
      it.textContent = this.root.classList.contains("touch")
        ? (s.interact ?? "").replace(/ · Enter$/, "")
        : (s.interact ?? "");
    }
      const p = s.portrait?.();
      if (p && p !== this.portraitSource) {
        this.portraitSource = p;
        const c = this.q<HTMLCanvasElement>(".portrait").getContext("2d")!;
        c.clearRect(0, 0, 120, 120);
        c.drawImage(p, 0, 0, 120, 120);
      }
    for (const k of ["bite", "dodge", "skill"] as const) {
      const b = this.q<HTMLElement>(`.act[data-act=${k}]`);
      b.style.setProperty("--cd", String(s.cooldown[k]));
      b.classList.toggle("cooling", s.cooldown[k] > 0.02);
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
    const priority = kind === "grow" || kind === "bad" ? 3 : ["catch", "hint", "reward"].includes(kind) ? 2 : kind === "study" ? 0 : 1;
    if (this.toastTimer > 0 && priority < this.toastPriority) {
      if (!this.toastQueue.some(t => t.text === text)) {
        this.toastQueue.push({ text, kind });
        if (this.toastQueue.length > 3) this.toastQueue.shift();
      }
      return;
    }
    this.toastPriority = priority;
    const t = this.q(".toast");
    t.textContent = text;
    t.className = "toast show " + kind;
    this.toastTimer = 3.6;
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
        const col = wet
          ? (f & 4) !== 0
            ? colors.deep
            : colors.shallow
          : (f & 1) !== 0
            ? (colors[grid.surface(gx, gy)] ?? colors.grass)
            : colors.forest;
        c.fillStyle = col;
        const rx = (gx - gy) * Math.SQRT1_2 * s + ox,
          ry = (gx + gy) * Math.SQRT1_2 * s;
        c.fillRect(rx, ry, step * s * 0.75, step * s * 0.75);
      }
    this.map = { base, s, ox, oy: 0 };
  }
  drawMap(px: number, py: number, markers: MapMarker[]) {
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
    for (const k of markers) {
      const mx = cx + ((k.x - k.y) * Math.SQRT1_2 * m.s + m.ox - rx),
        my = cx + ((k.x + k.y) * Math.SQRT1_2 * m.s - ry);
      if (k.kind === "player") continue;
      c.fillStyle =
        k.kind === "threat"
          ? "#ff5a4a"
          : k.kind === "goal"
            ? "#ffb347"
            : k.kind === "nest"
              ? "#ffe9a8"
              : "#ffd86b";
      c.strokeStyle = "#1a1a1a";
      c.lineWidth = 1.5;
      c.beginPath();
      if (k.kind === "threat") {
        c.moveTo(mx, my - 6);
        c.lineTo(mx + 5.5, my + 4.5);
        c.lineTo(mx - 5.5, my + 4.5);
      } else {
        c.arc(mx, my, k.kind === "goal" ? 5 : 4, 0, 7);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
    // player arrow (always centred, pointing along its screen heading)
    const player = markers.find((k) => k.kind === "player");
    const a =
      Math.atan2(
        Math.sin(player?.face ?? 0) + Math.cos(player?.face ?? 0),
        Math.cos(player?.face ?? 0) - Math.sin(player?.face ?? 0),
      ) - 0; // heading in rotated map space
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
