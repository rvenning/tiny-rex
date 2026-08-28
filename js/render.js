// Drawing, input and the frame loop.
//
// js/game.js knows nothing about any of this, which is what lets the bots run
// the real engine with no canvas at all. Every event that wants a sound or a
// puff of dust arrives through Game.q, drained here once a frame — including on
// the frames where the game is over, because "the run ended" is itself an event
// and a loop that only drains while running leaves the game screen up forever.
//
// Everything is drawn from the species table, so a new dinosaur is a row of
// data and a shape name, not a new sprite.

// How close something has to be before the game answers the question for you.
// Across the valley you judge by size; inside this radius a red rim says "this
// one can eat you" and a warm glow says "this one is yours". Keep it in step
// with CUE_RANGE in tests/brain.js, which models exactly this.
const CUE_RANGE = 110;

// The player's hide deepens as she grows, so her own size is legible even in
// the corner of your eye.
const SKIN = ["", "#8ad39a", "#79c78b", "#67b97c", "#57a96e", "#4a9a63", "#3f8b59", "#35794e"];
const SKIN_TRIM = ["", "#d9f2dd", "#cdebd3", "#c0e4c9", "#b2dcbe", "#a6d4b4", "#9bccab", "#8fc3a1"];

const Render = {
  canvas: null, ctx: null, DPR: 1, scale: 1,
  viewLW: LW, viewLH: LH, offX: 0, offY: 0,
  active: false, _last: 0, _wasPaused: false, drained: 0,
  cssW: 0, cssH: 0,
  world: null, tick: 0,

  /* ============================ boot / canvas ============================ */
  boot() {
    this.canvas = document.getElementById("cv");
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    const re = () => this.resize();
    window.addEventListener("resize", re);
    // iOS settles its viewport lazily (toolbars, rotation, standalone launch),
    // so measure again well after the event as well as on it.
    window.addEventListener("orientationchange", () => setTimeout(re, 350));
    if (window.visualViewport) window.visualViewport.addEventListener("resize", re);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && Game.running && !Game.paused) App.pause();
    });
    this.bindInput();
    this._last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  resize() {
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    // The game screen is display:none until it is shown, which measures 0x0 —
    // retry rather than caching a broken layout.
    if (w < 50 || h < 50) { setTimeout(() => this.resize(), 200); return; }
    this.DPR = Math.min(window.devicePixelRatio || 1, 2);
    // A canvas is a replaced element: the width/height ATTRIBUTES are the
    // backing store. css/style.css pins the DISPLAY size to 100%/100% so it can
    // never disagree with the stage — an inline pixel size set here would be a
    // snapshot that goes stale the moment anything reflows.
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * this.DPR);
    this.canvas.height = Math.round(h * this.DPR);
    this.scale = Math.min(w / LW, h / LH);
    this.viewLW = w / this.scale;
    this.viewLH = h / this.scale;
    this.offX = (this.viewLW - LW) / 2;
    this.offY = (this.viewLH - LH) / 2;
  },

  /* =============================== input ================================= */
  // One gesture, two ways to use it: tap somewhere and she runs there, or hold
  // and drag and she follows your finger. Both end in the same call, so
  // supporting both costs nothing — and tapping is what a small hand does.
  bindInput() {
    const stage = document.querySelector(".game-stage");
    let down = false;

    const aim = (clientX, clientY) => {
      const r = stage.getBoundingClientRect();
      const lx = (clientX - r.left) / this.scale - this.offX;
      const ly = (clientY - r.top) / this.scale - this.offY;
      Game.input.tx = GK.util.clamp(lx, 0, LW);
      Game.input.ty = GK.util.clamp(ly, 0, LH);
    };

    stage.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      Sfx.init();
      // Set the gesture state BEFORE capturing: setPointerCapture throws
      // NotFoundError whenever the browser does not consider the pointer active,
      // and `?.` does not protect you — the throw escapes and takes the rest of
      // this handler with it.
      down = true;
      aim(e.clientX, e.clientY);
      try { stage.setPointerCapture?.(e.pointerId); } catch (_) {}
    }, { passive: false });

    // PointerEvent.pressure is ZERO for ordinary touch on iOS, so an
    // `if (e.pressure > 0)` guard silently drops every move of a drag. Ask what
    // KIND of pointer it is instead.
    stage.addEventListener("pointermove", (e) => {
      if (!down) return;
      e.preventDefault();
      aim(e.clientX, e.clientY);
    }, { passive: false });

    // Some iOS builds are stingy with pointermove during a fast drag, so take
    // the raw touch stream too. Both paths end in the same call.
    stage.addEventListener("touchmove", (e) => {
      if (!down || !e.touches.length) return;
      e.preventDefault();
      aim(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    const lift = () => { down = false; };
    stage.addEventListener("pointerup", lift);
    stage.addEventListener("pointercancel", lift);
    stage.addEventListener("pointerleave", lift);
    stage.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.code === "Escape" || e.code === "KeyP") { e.preventDefault(); App.togglePause(); return; }
      if (!Game.running || Game.paused) return;
      const step = 90;
      const map = { ArrowLeft: [-step, 0], KeyA: [-step, 0], ArrowRight: [step, 0], KeyD: [step, 0],
        ArrowUp: [0, -step], KeyW: [0, -step], ArrowDown: [0, step], KeyS: [0, step] };
      const d = map[e.code];
      if (!d) return;
      e.preventDefault();
      Game.input.tx = GK.util.clamp(Game.player.x + d[0], 0, LW);
      Game.input.ty = GK.util.clamp(Game.player.y + d[1], 0, LH);
    });

    // iOS ignores user-scalable=no for pinch; block the gesture at the source.
    document.addEventListener("gesturestart", (e) => e.preventDefault());
    document.addEventListener("gesturechange", (e) => e.preventDefault());

    this.clearInput = () => { down = false; };
  },

  /* ============================ events -> juice =========================== */
  drainEvents() {
    const q = Game.q;
    for (; this.drained < q.length; this.drained++) {
      const e = q[this.drained];
      switch (e.type) {
        case "start":
          this.world = Game.mode === "feast" ? WORLDS[1] : WORLDS[Game.level.world];
          if (Game.beastEnt) Sfx.roar();
          break;
        case "eat": {
          const plant = isPlant(e.sp);
          plant ? Sfx.nibble() : Sfx.chomp(Game.player.tier, e.value >= 12);
          Fx.burst(e.x, e.y, e.sp.body, plant ? 6 : 12, plant ? 70 : 130, 0.45, plant ? 1.8 : 2.6);
          if (!plant) Fx.text(e.x, e.y, `+${e.value}`, { color: "#ffe9a8" });
          if (e.beast) { Sfx.roar(); Fx.addShake(9); Fx.confetti(LW, LH, ["#ffd45e", "#ff8a5c", "#7fd08a"], 40); }
          break;
        }
        case "grow":
          Sfx.grow(e.tier);
          Fx.addShake(5);
          Fx.addFlash(0.32, "#fff3c4");
          Fx.burst(e.x, e.y, "#ffe9a8", 26, 190, 0.7, 3.2);
          Fx.text(e.x, e.y - 18, STAGE_NAME[e.tier] + "!", { color: "#ffd45e", size: 15 });
          GK.UI.toast(`🦖 ${STAGE_NAME[e.tier]}!`);
          break;
        case "hurt":
          Sfx.scare();
          Fx.addShake(11);
          Fx.addFlash(0.34, "#e0563f");
          Fx.burst(e.x, e.y, "#ffb4a1", 16, 150, 0.5, 2.6);
          break;
        case "nope":
          Sfx.nope();
          Fx.text(e.x, e.y - 12, "too spiky!", { color: "#cfd8e8", size: 11 });
          break;
        case "shrink":
          Sfx.shrink();
          Fx.addFlash(0.2, "#9fb0d0");
          Fx.text(e.x, e.y - 20, "hungry…", { color: "#cfd8e8", size: 12 });
          break;
        case "wave":
          if (e.wave > 0) { Sfx.wave(); GK.UI.toast(`🌋 The valley thickens — wave ${e.wave + 1}`); }
          break;
        case "end":
          App.onEnd(e.result);
          break;
      }
    }
  },

  /* ============================== the loop =============================== */
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const real = Math.min(0.05, (t - this._last) / 1000 || 0);
    this._last = t;
    if (!this.active) return;

    // A stage resizes with no resize event when the web font lands or the HUD
    // row rewraps — notice the drift rather than hunting every cause. Check BOTH
    // axes: the first version watched only the width, and the belly row landing
    // grew the stage 8px taller with the backing store left stale.
    const b = this.canvas.parentElement.getBoundingClientRect();
    if (b.width > 50 && b.height > 50 &&
        (Math.abs(b.width - this.cssW) > 1 || Math.abs(b.height - this.cssH) > 1)) this.resize();

    const paused = Game.paused || !Game.running;
    if (paused !== this._wasPaused) this._wasPaused = paused;

    if (Game.running && !Game.paused) {
      this.tick += real;
      Game.update(real);
      Fx.update(real);
      this.drainEvents();
      this.render(real);
      this.hud();
    } else {
      // Still drain: quitting and losing both emit from outside update(), and a
      // loop that only drains while running leaves the game screen up forever.
      this.drainEvents();
      this.render(0);
    }
  },

  /* ============================== rendering ============================== */
  render() {
    const ctx = this.ctx;
    if (!ctx || !Game.player) return;
    const w = this.world || WORLDS[0];
    const s = this.scale * this.DPR;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate(this.offX, this.offY);

    const L = -this.offX, T = -this.offY;
    const R = LW + this.offX, B = LH + this.offY;

    this.drawSurround(ctx, w, L, T, R, B);
    this.drawGround(ctx, w);

    const [shx, shy] = Fx.shakeOffset();
    ctx.save();
    ctx.translate(shx, shy);

    // Back to front by size, so the big ones sit properly over the small ones.
    const order = Game.ents.filter((e) => !e.dead).slice().sort((a, b) => a.r - b.r || a.y - b.y);
    const p = Game.player;
    let drewPlayer = false;
    for (const e of order) {
      if (!drewPlayer && e.r > p.r) { this.drawPlayer(ctx, p); drewPlayer = true; }
      this.drawEnt(ctx, e, p);
    }
    if (!drewPlayer) this.drawPlayer(ctx, p);

    Fx.render(ctx);
    ctx.restore();

    if (Fx.flash > 0) {
      ctx.globalAlpha = Math.min(1, Fx.flash);
      ctx.fillStyle = Fx.flashColor;
      ctx.fillRect(L, T, R - L, B - T);
      ctx.globalAlpha = 1;
    }
  },

  // Beyond the arena walls: more valley. The play field rarely matches a phone,
  // and a rectangle floating in a void reads as a bug rather than a boundary.
  drawSurround(ctx, w, L, T, R, B) {
    ctx.fillStyle = w.scrub;
    ctx.fillRect(L, T, R - L, B - T);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let i = 0; i < 90; i++) {
      const hx = L + GK.util.hash2(i, 3) * (R - L);
      const hy = T + GK.util.hash2(i, 9) * (B - T);
      if (hx > -6 && hx < LW + 6 && hy > -6 && hy < LH + 6) continue;
      const r = 3 + Math.floor(GK.util.hash2(i, 5) * 997) % 5;
      ctx.beginPath(); ctx.arc(hx, hy, r, 0, 6.28); ctx.fill();
    }
  },

  drawGround(ctx, w) {
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, w.sky[1]);
    g.addColorStop(1, w.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LW, LH);

    // Scattered scenery, stable because it comes from a positional hash.
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let i = 0; i < 46; i++) {
      const hx = GK.util.hash2(i, 11) * LW;
      const hy = GK.util.hash2(i, 17) * LH;
      const r = 5 + Math.floor(GK.util.hash2(i, 23) * 997) % 14;
      ctx.beginPath(); ctx.ellipse(hx, hy, r, r * 0.5, 0, 0, 6.28); ctx.fill();
    }
    ctx.fillStyle = w.rock;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 14; i++) {
      const hx = GK.util.hash2(i, 31) * LW;
      const hy = GK.util.hash2(i, 37) * LH;
      const r = 6 + Math.floor(GK.util.hash2(i, 41) * 997) % 10;
      ctx.beginPath(); ctx.ellipse(hx, hy, r, r * 0.62, 0.4, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // The valley wall.
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, LW - 3, LH - 3);
  },

  /* ------------------------------ creatures ------------------------------ */
  drawEnt(ctx, e, p) {
    const rel = relation(e.sp, p.tier);
    const d = Math.hypot(e.x - p.x, e.y - p.y);

    // Up close, the game answers the question. This is the safety net under the
    // whole size mechanic: she reads size across the valley and is never
    // punished for a judgement the picture could not settle.
    if (d < CUE_RANGE && e.kind !== "plant") {
      const near = 1 - d / CUE_RANGE;
      const pulse = 0.55 + 0.45 * Math.sin(this.tick * 6);
      ctx.lineWidth = 2.4;
      if (rel === "danger") {
        ctx.strokeStyle = `rgba(226,74,58,${(0.35 + 0.5 * near) * pulse})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, 6.28); ctx.stroke();
      } else if (rel === "food") {
        ctx.strokeStyle = `rgba(255,225,130,${0.3 + 0.45 * near})`;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 5, 0, 6.28); ctx.stroke();
      } else if (rel === "spiky") {
        ctx.strokeStyle = `rgba(190,200,220,${0.28 + 0.35 * near})`;
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 6, 0, 6.28); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.beast) ctx.scale(1.1, 1.1);
    this.paint(ctx, e.sp, e.r, e.face || 1, e.step || 0);
    ctx.restore();

    if (e.beast && e.name) {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = "700 11px 'Baloo 2', sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 3;
      ctx.strokeText(e.name, e.x, e.y - e.r - 10);
      ctx.fillText(e.name, e.x, e.y - e.r - 10);
      ctx.textAlign = "left";
    }
  },

  drawPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    // Just been caught: flicker, so the grace period is visible rather than
    // something she has to remember.
    if (p.invuln > 0 && Math.floor(this.tick * 12) % 2 === 0) ctx.globalAlpha = 0.45;
    const sp = {
      shape: "rex", body: SKIN[p.tier], trim: SKIN_TRIM[p.tier],
      spiky: false, kind: "creature",
    };
    this.paint(ctx, sp, p.r, p.vxSign, this.tick * 6, p.chomp > 0);
    ctx.restore();
  },

  // One painter for every dinosaur in the game. `r` is the radius the engine
  // uses for collisions, so what you can see and what you can touch cannot
  // drift apart.
  paint(ctx, sp, r, face, step, chomping) {
    ctx.scale(face < 0 ? -1 : 1, 1);
    const bob = Math.sin(step) * r * 0.06;
    ctx.translate(0, bob);
    const body = sp.body, trim = sp.trim;

    const ell = (x, y, rx, ry, fill, rot = 0) => {
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, 6.28); ctx.fill();
    };
    const leg = (x, len, phase) => {
      ctx.strokeStyle = body; ctx.lineWidth = Math.max(1.6, r * 0.17);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, r * 0.25);
      ctx.lineTo(x + Math.sin(step * 2 + phase) * r * 0.22, len);
      ctx.stroke();
    };
    const eye = (x, y) => {
      ell(x, y, Math.max(1, r * 0.1), Math.max(1, r * 0.1), "#1d2430");
      ell(x + r * 0.04, y - r * 0.04, Math.max(0.5, r * 0.04), Math.max(0.5, r * 0.04), "#fff");
    };

    switch (sp.shape) {
      case "fern": {
        ctx.strokeStyle = body; ctx.lineWidth = Math.max(1.4, r * 0.2); ctx.lineCap = "round";
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.moveTo(0, r * 0.8);
          ctx.quadraticCurveTo(i * r * 0.35, 0, i * r * 0.8, -r * 0.75);
          ctx.stroke();
        }
        ell(0, r * 0.85, r * 0.5, r * 0.22, trim);
        break;
      }
      case "bush": {
        ell(-r * 0.4, r * 0.1, r * 0.6, r * 0.55, body);
        ell(r * 0.4, r * 0.15, r * 0.55, r * 0.5, body);
        ell(0, -r * 0.3, r * 0.65, r * 0.6, body);
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7;
          ell(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.45, r * 0.16, r * 0.16, trim);
        }
        break;
      }
      case "bug": {
        ell(-r * 0.15, 0, r * 0.9, r * 0.62, body);
        ell(r * 0.65, -r * 0.05, r * 0.35, r * 0.32, trim);
        ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = Math.max(1, r * 0.12);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i * r * 0.3, r * 0.3);
          ctx.lineTo(i * r * 0.5, r * 0.85);
          ctx.stroke();
        }
        eye(r * 0.75, -r * 0.12);
        break;
      }
      case "flyer": {
        const flap = Math.sin(step * 3) * 0.5;
        ctx.fillStyle = trim;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.1);
          ctx.quadraticCurveTo(r * 0.5, s * r * (0.9 + flap), r * 1.15, s * r * 0.25);
          ctx.quadraticCurveTo(r * 0.4, s * r * 0.2, 0, -r * 0.1);
          ctx.fill();
        }
        ell(0, 0, r * 0.75, r * 0.3, body);
        ell(r * 0.75, -r * 0.12, r * 0.32, r * 0.26, body);
        eye(r * 0.85, -r * 0.16);
        break;
      }
      case "quad": case "club": case "plated": case "frilled": {
        // Tail
        ctx.strokeStyle = body; ctx.lineWidth = r * 0.34; ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.05);
        ctx.quadraticCurveTo(-r * 1.05, r * 0.1 + Math.sin(step * 2) * r * 0.14, -r * 1.25, -r * 0.2);
        ctx.stroke();
        leg(-r * 0.5, r * 0.85, 0); leg(r * 0.35, r * 0.85, 1.9);
        ell(0, -r * 0.05, r * 0.86, r * 0.5, body);
        if (sp.shape === "plated") {
          ctx.fillStyle = trim;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(i * r * 0.3 - r * 0.14, -r * 0.42);
            ctx.lineTo(i * r * 0.3, -r * 0.95);
            ctx.lineTo(i * r * 0.3 + r * 0.14, -r * 0.42);
            ctx.fill();
          }
          ctx.strokeStyle = trim; ctx.lineWidth = r * 0.1;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-r * 1.1, -r * 0.16);
            ctx.lineTo(-r * 1.4, -r * 0.16 + s * r * 0.36);
            ctx.stroke();
          }
        } else if (sp.shape === "club") {
          ell(-r * 1.32, -r * 0.2, r * 0.28, r * 0.26, trim);
          ctx.fillStyle = trim;
          for (let i = -2; i <= 1; i++) ell(i * r * 0.34, -r * 0.44, r * 0.14, r * 0.1, trim);
        } else if (sp.shape === "frilled") {
          ctx.fillStyle = trim;
          ctx.beginPath();
          ctx.ellipse(r * 0.55, -r * 0.3, r * 0.42, r * 0.52, -0.2, 0, 6.28);
          ctx.fill();
        } else if (sp.spiky) {
          ctx.fillStyle = trim;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(i * r * 0.3 - r * 0.1, -r * 0.4);
            ctx.lineTo(i * r * 0.3, -r * 1.0);
            ctx.lineTo(i * r * 0.3 + r * 0.1, -r * 0.4);
            ctx.fill();
          }
        }
        ell(r * 0.82, -r * 0.16, r * 0.36, r * 0.3, body);
        if (sp.shape === "frilled") {
          ctx.strokeStyle = trim; ctx.lineWidth = r * 0.11;
          ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.34); ctx.lineTo(r * 1.35, -r * 0.62); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(r * 0.95, -r * 0.1); ctx.lineTo(r * 1.32, -r * 0.3); ctx.stroke();
        }
        eye(r * 0.94, -r * 0.24);
        break;
      }
      default: {
        // Every biped — compy, oviraptor, raptor, gallimimus, dilophosaurus and
        // the player's own rex — is the same drawing at different weights.
        const heavy = sp.shape === "rex";
        const tailLen = heavy ? 1.3 : 1.15;
        ctx.strokeStyle = body; ctx.lineWidth = r * (heavy ? 0.34 : 0.24); ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-r * 0.4, -r * 0.05);
        ctx.quadraticCurveTo(-r * 0.95, r * 0.22 + Math.sin(step * 2) * r * 0.16, -r * tailLen, -r * 0.3);
        ctx.stroke();
        leg(-r * 0.12, r * 0.92, 0);
        leg(r * 0.2, r * 0.92, 2.1);
        ell(0, -r * 0.08, r * (heavy ? 0.8 : 0.66), r * (heavy ? 0.56 : 0.46), body);
        ctx.fillStyle = trim;
        ctx.beginPath();
        ctx.ellipse(-r * 0.05, r * 0.14, r * 0.5, r * 0.24, 0, 0, 6.28);
        ctx.fill();
        // Neck and head
        ctx.strokeStyle = body; ctx.lineWidth = r * (heavy ? 0.4 : 0.26);
        ctx.beginPath();
        ctx.moveTo(r * 0.3, -r * 0.2);
        ctx.lineTo(r * 0.6, -r * (heavy ? 0.5 : 0.62));
        ctx.stroke();
        const hx = r * (heavy ? 0.82 : 0.72), hy = -r * (heavy ? 0.58 : 0.72);
        ell(hx, hy, r * (heavy ? 0.44 : 0.3), r * (heavy ? 0.32 : 0.24), body);
        // The jaw, which opens on a bite.
        const gape = chomping ? r * 0.26 : r * 0.06;
        ctx.fillStyle = "#5a2430";
        ctx.beginPath();
        ctx.moveTo(hx + r * 0.06, hy + r * 0.04);
        ctx.lineTo(hx + r * (heavy ? 0.5 : 0.34), hy - r * 0.02);
        ctx.lineTo(hx + r * (heavy ? 0.48 : 0.32), hy + gape);
        ctx.fill();
        if (heavy && r > 16) {
          ctx.fillStyle = "#fff";
          for (let i = 0; i < 3; i++) {
            ell(hx + r * (0.18 + i * 0.12), hy + r * 0.06, r * 0.045, r * 0.075, "#fff");
          }
        }
        if (sp.shape === "crested") {
          ctx.fillStyle = trim;
          for (const s of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(hx - r * 0.02, hy - r * 0.3 + s * r * 0.05, r * 0.26, r * 0.16, -0.35, 0, 6.28);
            ctx.fill();
          }
        }
        if (heavy) {
          // Tiny arms. Non-negotiable.
          ctx.strokeStyle = body; ctx.lineWidth = r * 0.11;
          ctx.beginPath();
          ctx.moveTo(r * 0.34, -r * 0.02);
          ctx.lineTo(r * 0.5, r * 0.14);
          ctx.stroke();
        }
        eye(hx + r * 0.12, hy - r * (heavy ? 0.1 : 0.06));
        break;
      }
    }
  },

  /* --------------------------------- HUD --------------------------------- */
  hud() {
    const p = Game.player;
    const el = (id) => document.getElementById(id);
    el("hud-hearts").textContent = "❤️".repeat(Math.max(0, Game.hearts)) +
      "🖤".repeat(Math.max(0, 3 - Game.hearts));
    el("hud-stage").textContent = `🦖 ${STAGE_NAME[p.tier]}`;
    el("belly-fill").style.width = `${Math.round(Game.bellyFrac() * 100)}%`;
    el("hud-score").textContent = Game.score.toLocaleString();

    const goal = el("hud-goal");
    if (Game.mode === "feast") {
      goal.textContent = `🌋 wave ${Game.wave + 1}  ·  ${Math.floor(Game.T)}s`;
    } else if (p.tier < Game.level.target) {
      goal.textContent = `grow to ${STAGE_NAME[Game.level.target]}`;
    } else if (Game.level.beast && !Game.beastEaten) {
      goal.textContent = `catch ${Game.level.beast.name}!`;
    } else {
      goal.textContent = "done!";
    }

    const clock = el("hud-clock");
    if (Game.mode === "feast") { clock.style.display = "none"; }
    else {
      clock.style.display = "";
      const t = Math.ceil(Game.timeLeft);
      clock.textContent = `⏳ ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      clock.classList.toggle("low", t <= 20);
    }
  },

  // The Dino Book paints its cards with the same function the valley does, so a
  // creature can never look like one thing on the card and another in the game.
  paintCard(canvas, id) {
    const sp = species(id);
    if (!sp || !canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 56, h = canvas.clientHeight || 48;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2 + h * 0.06);
    this.paint(ctx, sp, Math.min(w, h) * 0.34, 1, 0.6);
    ctx.restore();
  },
};
