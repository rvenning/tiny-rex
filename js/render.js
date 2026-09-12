// Drawing, input and the frame loop.
//
// js/game.js knows nothing about any of this, which is what lets the bots run
// the real engine with no canvas at all. Every event that wants a sound or a
// puff of dust arrives through Game.q, drained here once a frame — including on
// the frames where the game is over, because "the run ended" is itself an event
// and a loop that only drains while running leaves the game screen up forever.
//
// What a thing LOOKS like lives in js/art.js. This file decides when and where,
// keeps the little presentation-only timers that make an action feel like it
// landed, and never touches a number the simulation reads.

// How close something has to be before the game answers the question for you.
// Across the valley you judge by size; inside this radius a red rim says "this
// one can eat you" and a warm glow says "this one is yours". Keep it in step
// with CUE_RANGE in tests/brain.js, which models exactly this.
const CUE_RANGE = 110;

// Presentation-only timings. None of these are read by the simulation.
const GROW_SHOW = 0.95;     // seconds of growth animation
const BANNER_SHOW = 1.5;    // seconds the "Nipper!" ribbon stays up
const HURT_SHOW = 0.55;
const POP_SHOW = 0.3;       // the ghost of something you just ate

const Render = {
  canvas: null, ctx: null, DPR: 1, scale: 1,
  viewLW: LW, viewLH: LH, offX: 0, offY: 0,
  active: false, _last: 0, _wasPaused: false, drained: 0,
  cssW: 0, cssH: 0,
  world: null, tick: 0, heroTick: 0,

  // Juice state. All of it decays to nothing, and all of it is optional: with
  // prefers-reduced-motion on, Art.motion is 0 and every one of these either
  // holds still or is skipped.
  pops: [], growT: 0, hurtT: 0, banner: null, bannerT: 0,
  moving: 0, _px: 0, _py: 0, _dustAt: 0,

  /* ============================ boot / canvas ============================ */
  boot() {
    this.canvas = document.getElementById("cv");
    this.ctx = this.canvas.getContext("2d");

    // Respect the system setting, and keep respecting it if it changes while
    // the game is open. Art.motion is the single switch every drifting,
    // swaying, pulsing thing in the game multiplies by.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyMotion = () => {
      Art.motion = mq.matches ? 0 : 1;
      document.body.classList.toggle("reduced-motion", mq.matches);
    };
    applyMotion();
    mq.addEventListener ? mq.addEventListener("change", applyMotion)
      : mq.addListener && mq.addListener(applyMotion);

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

  // What the baked art layers need to know to line up with this canvas.
  geo() {
    return {
      pw: this.canvas.width, ph: this.canvas.height,
      px: this.scale * this.DPR,
      offX: this.offX, offY: this.offY,
    };
  },

  box() {
    return { L: -this.offX, T: -this.offY, R: LW + this.offX, B: LH + this.offY };
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
  // Shake and flash go through here so that one place decides whether the
  // screen is allowed to move at all.
  shake(n) { Fx.addShake(n * Art.motion); },
  flash(a, color) { Fx.addFlash(a * (0.4 + 0.6 * Art.motion), color); },

  resetJuice() {
    this.pops.length = 0;
    this.growT = 0; this.hurtT = 0; this.banner = null; this.bannerT = 0;
    this.moving = 0; this._dustAt = 0;
  },

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
          // The thing you ate reacts: a ghost of it swells and fades, a ring
          // goes out from where it stood, and then it is gone. Quick, readable,
          // satisfying, gone — never left on screen to pile up.
          this.pops.push({
            x: e.x, y: e.y, sp: e.sp, r: speciesRadius(e.sp), t: 0,
            big: !plant && e.value >= 12,
          });
          if (this.pops.length > 14) this.pops.shift();
          Fx.burst(e.x, e.y, e.sp.body, plant ? 6 : 12, plant ? 70 : 130, 0.45, plant ? 1.8 : 2.6);
          Fx.sparkle(e.x, e.y, "#fff3c4", plant ? 2 : 4);
          if (!plant) Fx.text(e.x, e.y, `+${e.value}`, { color: "#ffe9a8" });
          if (e.beast) {
            Sfx.roar(); this.shake(9);
            Fx.confetti(LW, LH, ["#ffd45e", "#ff8a5c", "#7fd08a"], 40);
            this.say(`${e.name || "Caught it"}!`);
          }
          break;
        }
        case "grow":
          Sfx.grow(e.tier);
          this.growT = GROW_SHOW;
          this.shake(5);
          this.flash(0.3, "#fff3c4");
          Fx.burst(e.x, e.y, "#ffe9a8", 26, 190, 0.7, 3.2);
          Fx.sparkle(e.x, e.y, "#fff7c0", 10);
          this.say(`${STAGE_NAME[e.tier]}!`);
          break;
        case "hurt":
          Sfx.scare();
          this.hurtT = HURT_SHOW;
          this.shake(11);
          this.flash(0.32, "#e0563f");
          Fx.burst(e.x, e.y, "#ffb4a1", 16, 150, 0.5, 2.6);
          document.getElementById("hud-hearts").classList.add("lost");
          setTimeout(() => document.getElementById("hud-hearts").classList.remove("lost"), 460);
          break;
        case "bump":
          Sfx.bump();
          Fx.dust(e.x, e.y + 3, 3, "rgba(255,250,230,0.5)");
          break;
        case "nope":
          Sfx.nope();
          Fx.dust(e.x, e.y + 4, 5, "rgba(216,224,240,0.75)");
          Fx.text(e.x, e.y - 12, "too spiky!", { color: "#e6ecf8", size: 11 });
          break;
        case "shrink":
          Sfx.shrink();
          this.flash(0.18, "#9fb0d0");
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

  // A ribbon across the top of the valley. The growth moment used to be a
  // browser-chrome toast sliding in over the game; this is part of the picture,
  // which is the whole point of the difference.
  say(text) { this.banner = text; this.bannerT = BANNER_SHOW; },

  /* ============================== the loop =============================== */
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const real = Math.min(0.05, (t - this._last) / 1000 || 0);
    this._last = t;

    if (!this.active) {
      // The splash keeps a little Rex idling in her clearing, and the results
      // screen shows her in the mood the run ended in — so the first and last
      // thing anyone sees is the game's own art rather than a platform emoji.
      if (GK.UI.screen === "splash") { this.heroTick += real; this.paintHero(); }
      else if (GK.UI.screen === "results") { this.heroTick += real; this.paintResArt(); }
      return;
    }

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
      this.juice(real);
      this.drainEvents();
      this.render();
      this.hud();
    } else {
      // Still drain: quitting and losing both emit from outside update(), and a
      // loop that only drains while running leaves the game screen up forever.
      this.drainEvents();
      this.render();
    }
  },

  // Presentation timers, and the only thing here that reads the simulation:
  // how fast she is actually travelling, which decides where she looks and
  // whether her feet kick up dust.
  juice(dt) {
    if (this.growT > 0) this.growT = Math.max(0, this.growT - dt);
    if (this.hurtT > 0) this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.bannerT > 0) this.bannerT = Math.max(0, this.bannerT - dt);
    for (let i = this.pops.length - 1; i >= 0; i--) {
      this.pops[i].t += dt;
      if (this.pops[i].t >= POP_SHOW) this.pops.splice(i, 1);
    }

    const p = Game.player;
    if (!p) return;
    const d = Math.hypot(p.x - this._px, p.y - this._py) / Math.max(0.0001, dt);
    this._px = p.x; this._py = p.y;
    this.moving = GK.util.clamp(d / Math.max(1, p.speed * 0.55), 0, 1);
    if (Art.motion && this.moving > 0.55 && this.tick > this._dustAt) {
      this._dustAt = this.tick + 0.11;
      Fx.dust(p.x - p.vxSign * p.r * 0.4, p.y + p.r * 0.78, 2,
        "rgba(240,232,208,0.55)");
    }
  },

  /* ============================== rendering ============================== */
  render() {
    const ctx = this.ctx;
    if (!ctx || !Game.player) return;
    const w = this.world || WORLDS[0];
    const A = Art.art(w);
    const s = this.scale * this.DPR;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.translate(this.offX, this.offY);
    const box = this.box();

    // The valley itself: baked once, blitted here.
    Art.ensure(w, this.geo());
    Art.drawScene(ctx, box);
    Art.drawClouds(ctx, this.tick, box);

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
    this.drawPops(ctx);

    Fx.render(ctx);
    ctx.restore();

    // Foliage over the rim and the corners falling away: the frame around the
    // picture, drawn after everything alive so there is something in front of
    // the player as well as behind her.
    Art.drawOverlay(ctx, box);
    Art.drawMotes(ctx, A, this.tick, box);
    this.drawBanner(ctx);

    if (this.hurtT > 0) this.drawHurtRim(ctx, box);

    if (Fx.flash > 0) {
      ctx.globalAlpha = Math.min(1, Fx.flash);
      ctx.fillStyle = Fx.flashColor;
      ctx.fillRect(box.L, box.T, box.R - box.L, box.B - box.T);
      ctx.globalAlpha = 1;
    }
  },

  /* ------------------------------ creatures ------------------------------ */
  drawEnt(ctx, e, p) {
    const rel = relation(e.sp, p.tier);
    const d = Math.hypot(e.x - p.x, e.y - p.y);

    // Up close, the game answers the question. This is the safety net under the
    // whole size mechanic: she reads size across the valley and is never
    // punished for a judgement the picture could not settle.
    if (d < CUE_RANGE && e.kind !== "plant") {
      Art.cue(ctx, e.x, e.y, e.r, rel, 1 - d / CUE_RANGE, this.tick);
    }

    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.beast) ctx.scale(1.1, 1.1);
    // Just been bumped or bitten: a quick recoil. The engine already tracks
    // the cooldown, so the target reacting costs no new state at all.
    if (e.nope > 0) {
      const k = e.nope / 0.9;
      const s = 1 + k * k * 0.13 * Art.motion;
      ctx.scale(s, 2 - s);
    }
    // Plants have no step of their own, so they get the breeze instead: the
    // engine already hands every one of them a phase it was not using.
    const step = e.kind === "plant"
      ? (e.sway || 0) + this.tick * 1.1
      : (e.step || 0);
    Art.paintSpecies(ctx, e.sp, e.r, e.face || 1, step, false, this.tick);
    ctx.restore();

    if (e.beast && e.name) this.drawNameplate(ctx, e.name, e.x, e.y - e.r - 13);
  },

  // A named beast gets a plate rather than outlined text floating in the air.
  drawNameplate(ctx, name, x, y) {
    ctx.font = "800 11px 'Baloo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(name).width + 14;
    Art.rr(ctx, x - w / 2, y - 8, w, 16, 8);
    ctx.fillStyle = "rgba(32,20,12,0.72)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,196,77,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ffdb92";
    ctx.fillText(name, x, y);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  },

  drawPlayer(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    Art.paintPlayer(ctx, {
      r: p.r, tier: p.tier, face: p.vxSign, step: this.tick * 6, t: this.tick,
      chomp: GK.util.clamp(p.chomp / 0.22, 0, 1),
      grow: this.growT / GROW_SHOW,
      invuln: p.invuln, moving: this.moving,
    });
    // Just been caught: a ring of grace rather than a strobe. The flicker the
    // first version used is a horrible thing to put in a small child's game,
    // and it also hid her at the exact moment she needed to see where she was.
    if (p.invuln > 0) Art.guardRing(ctx, p.r, p.invuln);
    // Growing: a shockwave out from her feet, and a bloom of warm light around
    // her. The ring on its own read as a debug circle.
    if (this.growT > 0) {
      const k = 1 - this.growT / GROW_SHOW;
      ctx.globalAlpha = (1 - k) * (1 - k);
      Art.softBlob(ctx, 0, 0, p.r * (1.6 + k * 2), p.r * (1.6 + k * 2), "rgba(255,232,158,0.6)");
      ctx.globalAlpha = (1 - k) * 0.75;
      ctx.strokeStyle = "#fff3c4";
      ctx.lineWidth = 5 * (1 - k) + 0.6;
      ctx.beginPath(); ctx.arc(0, 0, p.r * (1 + k * 3.4), 0, 6.28); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  },

  // The ghost of something just eaten, swelling and fading. Drawn with the same
  // painter as the living animal, so the thing that vanishes is recognisably
  // the thing that was there.
  drawPops(ctx) {
    for (const o of this.pops) {
      const k = o.t / POP_SHOW;
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.translate(o.x, o.y);
      ctx.scale(1 + k * 0.6, 1 + k * 0.6);
      Art.paintSpecies(ctx, o.sp, o.r, 1, 0, false, 0);
      ctx.restore();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = o.big ? "#ffd45e" : "#fff3c4";
      ctx.lineWidth = 2.4 * (1 - k) + 0.4;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * (1 + k * 2.2), 0, 6.28);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  },

  // "Something important just happened" — a gold ribbon that pops in, holds,
  // and slides away.
  drawBanner(ctx) {
    if (!this.banner || this.bannerT <= 0) return;
    const k = 1 - this.bannerT / BANNER_SHOW;
    const inK = Math.min(1, k / 0.14);
    const outK = k > 0.82 ? (k - 0.82) / 0.18 : 0;
    const pop = Art.motion ? 0.7 + 0.3 * inK + Math.sin(inK * Math.PI) * 0.12 : 1;
    const y = LH * 0.2 - outK * 22;
    ctx.save();
    ctx.globalAlpha = Math.min(1, inK) * (1 - outK);
    ctx.translate(LW / 2, y);
    ctx.scale(pop, pop);
    ctx.font = "800 21px 'Baloo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = Math.max(120, ctx.measureText(this.banner).width + 46);
    const g = ctx.createLinearGradient(0, -18, 0, 18);
    g.addColorStop(0, "#ffd870");
    g.addColorStop(1, "#e8a12c");
    Art.rr(ctx, -w / 2, -18, w, 36, 18);
    ctx.fillStyle = "rgba(40,25,12,0.4)";
    ctx.fill();
    Art.rr(ctx, -w / 2 + 2, -16, w - 4, 32, 16);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#40260c";
    ctx.fillText(this.banner, 0, 1);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  },

  // Caught: the edges of the valley go red for half a second. Easier to read
  // than a whole-screen wash, and it does not hide what is chasing her.
  drawHurtRim(ctx, box) {
    const k = this.hurtT / HURT_SHOW;
    ctx.globalAlpha = k * 0.55;
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = "rgba(226,80,63," + (0.45 - i * 0.09).toFixed(2) + ")";
      ctx.lineWidth = 16 - i * 3;
      Art.rr(ctx, box.L + 3 + i * 5, box.T + 3 + i * 5,
        (box.R - box.L) - 6 - i * 10, (box.B - box.T) - 6 - i * 10, 18);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },

  /* --------------------------------- HUD --------------------------------- */
  hud() {
    const p = Game.player;
    const el = (id) => document.getElementById(id);

    const hearts = el("hud-hearts");
    if (hearts.dataset.n !== String(Game.hearts)) {
      hearts.dataset.n = String(Game.hearts);
      let html = "";
      for (let i = 0; i < 3; i++) {
        html += `<svg class="hp${i < Game.hearts ? "" : " gone"}" viewBox="0 0 24 22" aria-hidden="true"><use href="#ico-heart"/></svg>`;
      }
      hearts.innerHTML = html;
      hearts.setAttribute("aria-label", `${Math.max(0, Game.hearts)} hearts left`);
    }

    const stage = el("hud-stage");
    const name = STAGE_NAME[p.tier];
    if (stage.dataset.v !== name) {
      stage.dataset.v = name;
      stage.textContent = name;
      stage.classList.remove("pop");
      void stage.offsetWidth;                   // restart the animation
      stage.classList.add("pop");
    }

    const belly = el("belly-fill");
    const frac = Game.bellyFrac();
    belly.style.width = `${Math.round(frac * 100)}%`;
    belly.parentElement.classList.toggle("full", frac > 0.82);

    const score = el("hud-score");
    const sv = Game.score.toLocaleString();
    if (score.dataset.v !== sv) {
      score.dataset.v = sv;
      score.textContent = sv;
      score.classList.remove("pop");
      void score.offsetWidth;
      score.classList.add("pop");
    }

    const goal = el("hud-goal");
    if (Game.mode === "feast") {
      goal.textContent = `wave ${Game.wave + 1} · ${Math.floor(Game.T)}s`;
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
      clock.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      clock.classList.toggle("low", t <= 20);
    }
  },

  /* ------------------------------- odd jobs ------------------------------ */
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
    ctx.translate(w / 2, h / 2 + h * 0.04);
    Art.paintSpecies(ctx, sp, Math.min(w, h) * 0.32, 1, 0.6, false, 0);
    ctx.restore();
  },

  // How the run ended, on Rex's own face. Happy bounces with her mouth open,
  // sad sits still with her brow down, sleepy shuts her eyes — the same three
  // moods the old trophy / egg / moon emoji stood for, in the game's own hand.
  resMood: "happy", resTier: 3,

  paintResArt() {
    const cv = document.getElementById("res-art");
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w < 40 || h < 30) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = this.heroTick;
    const happy = this.resMood === "happy";
    const r = Math.min(h * 0.34, w * 0.26);
    // A hop on the happy ending, and nothing on the others.
    const hop = happy && Art.motion ? Math.abs(Math.sin(t * 2.6)) * r * 0.42 : 0;

    Art.softBlob(ctx, w / 2, h * 0.52, r * 2.6, r * 2,
      happy ? "rgba(255,214,120,0.3)" : "rgba(255,255,255,0.08)");
    if (happy && Art.motion) {
      // Three sparks turning about her, rather than a particle system running
      // on a screen nobody is playing.
      for (let i = 0; i < 3; i++) {
        const a = t * 1.7 + i * 2.094;
        const s = 2 + Math.sin(t * 4 + i) * 1.1;
        ctx.fillStyle = "rgba(255,240,180,0.9)";
        ctx.beginPath();
        ctx.arc(w / 2 + Math.cos(a) * r * 1.9, h * 0.52 + Math.sin(a) * r * 0.9, s, 0, 6.28);
        ctx.fill();
      }
    }
    ctx.save();
    ctx.translate(w / 2, h * 0.66 - hop);
    Art.paintPlayer(ctx, {
      r, tier: this.resTier, face: 1, step: happy ? t * 5 : t * 0.7, t,
      chomp: happy ? 0.55 + Math.sin(t * 2.6) * 0.3 : 0,
      grow: 0, invuln: 0, moving: 0,
      sad: this.resMood === "sad", sleepy: this.resMood === "sleepy",
    });
    ctx.restore();
  },

  // The splash's little clearing. Same painter, same palette, same character —
  // the title screen is the game's first promise about what it looks like, and
  // three emoji in a row was not it.
  paintHero() {
    const cv = document.getElementById("hero");
    if (!cv) return;
    const w = cv.clientWidth, h = cv.clientHeight;
    if (w < 40 || h < 30) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const t = this.heroTick;
    const A = Art.art(WORLDS[0]);
    const gy = h * 0.82;

    // A mound of sunlit ground, and the light above it.
    Art.softBlob(ctx, w / 2, gy - h * 0.28, w * 0.42, h * 0.42, A.sun);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(w / 2, gy + h * 0.3, w * 0.42, h * 0.36, 0, 0, 6.28);
    ctx.clip();
    const g = ctx.createLinearGradient(0, gy - h * 0.1, 0, h);
    g.addColorStop(0, A.floor[0]);
    g.addColorStop(1, A.floor[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      const hx = w * (0.16 + GK.util.hash2(i, 11) * 0.68);
      DECOR.tuft(ctx, hx, gy + h * 0.06 + GK.util.hash2(i, 17) * h * 0.1,
        1 + GK.util.hash2(i, 23) * 0.5, (k) => GK.util.hash2(i + k, 31), A);
    }
    ctx.restore();

    // A fern either side, swaying, and Rex in the middle of it.
    const r = Math.min(h * 0.3, w * 0.16);
    for (const s of [-1, 1]) {
      ctx.save();
      ctx.translate(w / 2 + s * r * 2.4, gy);
      Art.paintSpecies(ctx, species("fern"), r * 0.62, s, t * 0.9 + (s > 0 ? 1.6 : 0), false, t);
      ctx.restore();
    }
    ctx.save();
    ctx.translate(w / 2, gy - r * 0.72);
    Art.paintPlayer(ctx, {
      r, tier: 4, face: 1, step: t * 1.6, t,
      chomp: 0, grow: 0, invuln: 0, moving: 0,
    });
    ctx.restore();
  },
};
