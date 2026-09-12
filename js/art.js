// The look of Tiny Rex: palettes, the illustrated valley, and every creature in
// it. js/render.js owns WHEN and WHERE things are drawn; this file owns WHAT
// they look like, so art direction is one file rather than a habit scattered
// through the frame loop.
//
// Two rules hold the whole thing together:
//
//   1. Nothing here may move a creature or change a number the engine reads.
//      Every position comes from js/game.js and every piece of scenery comes
//      from a positional hash, so the valley looks hand-placed and still plays
//      the identical level on every device.
//   2. The static parts are painted ONCE into an offscreen canvas and blitted.
//      The first version redrew sixty scattered ellipses every frame for a
//      picture that never changed; this draws several hundred pieces of
//      scenery and costs one drawImage, which is what pays for the detail.

// The player's hide deepens as she grows, so her own size is legible even in
// the corner of your eye.
const SKIN = ["", "#41c3a2", "#3ab798", "#34aa8d", "#2e9c82", "#298e78", "#24806c", "#1f7260"];
const SKIN_TRIM = ["", "#fff0cd", "#ffecc4", "#fbe6bc", "#f6dfb3", "#f1d9ab", "#ecd2a3", "#e7cc9c"];

// The arena's corner rounding. Small enough that a creature clamped into a
// corner by the engine is still standing on painted ground, big enough that the
// field reads as a drawn clearing rather than a rectangle in a void.
const ARENA_R = 13;

const Art = {
  // 1 normally, 0 when the player has asked for less movement. Everything that
  // drifts, sways, breathes, pulses or pops multiplies by this.
  motion: 1,

  _scene: null, _overlay: null, _key: "",
  _blobs: {}, _blobKeys: [],

  /* ============================== colour ================================= */
  rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  },
  shade(hex, amt) { return GK.util.shade(hex, amt); },

  /* ============================== helpers ================================ */
  // A rounded rectangle path, written out rather than using ctx.roundRect:
  // this runs on the family's older iPads too.
  rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    this.rrPath(ctx, x, y, w, h, r);
  },
  // The same path WITHOUT beginPath, for building a two-subpath clip.
  rrPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  // A soft round gradient blob, cached per colour. Sunlight pools, cloud
  // shadow, the glow under something edible and the growth shockwave are all
  // this one image at different sizes — a feathered edge is the single most
  // useful shape in the game, and rebuilding the gradient every frame is not
  // something a phone should be asked to pay for.
  // The colour handed in MUST be a constant: this keeps one canvas per colour
  // string for the life of the page, so a per-frame alpha would mint a new one
  // every frame. Vary brightness with ctx.globalAlpha at the call site instead.
  // The cap is a backstop for the next person who forgets.
  blob(color) {
    if (this._blobs[color]) return this._blobs[color];
    if (this._blobKeys.length >= 48) delete this._blobs[this._blobKeys.shift()];
    this._blobKeys.push(color);
    const S = 128;
    const inner = color.slice(color.indexOf("(") + 1, color.lastIndexOf(")"));
    const parts = inner.split(",").map(Number);
    const r = parts[0], g = parts[1], b = parts[2];
    const a = parts.length > 3 ? parts[3] : 1;
    const at = (k) => "rgba(" + r + "," + g + "," + b + "," + (a * k).toFixed(3) + ")";
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const cx = c.getContext("2d");
    const rad = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rad.addColorStop(0, at(1));
    rad.addColorStop(0.45, at(0.62));
    rad.addColorStop(0.75, at(0.2));
    rad.addColorStop(1, at(0));
    cx.fillStyle = rad;
    cx.fillRect(0, 0, S, S);
    this._blobs[color] = c;
    return c;
  },

  softBlob(ctx, x, y, rx, ry, color) {
    ctx.drawImage(this.blob(color), x - rx, y - ry, rx * 2, ry * 2);
  },

  art(world) { return WORLD_ART[world.id] || WORLD_ART.hollow; },

  /* ========================= the static valley =========================== */
  // Rebuilt only when the world changes or the canvas resizes. `geo` is the
  // renderer's view: pixel size, logical size, and how far the arena sits in
  // from the visible edge.
  ensure(world, geo) {
    const key = world.id + "|" + geo.pw + "x" + geo.ph +
      "|" + Math.round(geo.offX) + "," + Math.round(geo.offY);
    if (this._key === key && this._scene) return;
    this._key = key;
    this._scene = this.buildLayer(world, geo, (ctx, A, box) => {
      this.paintSurround(ctx, A, box);
      ctx.save();
      this.rr(ctx, 0, 0, LW, LH, ARENA_R);
      ctx.clip();
      this.paintFloor(ctx, A);
      ctx.restore();
      this.paintRim(ctx, A);
    });
    this._overlay = this.buildLayer(world, geo, (ctx, A, box) => {
      this.paintFringe(ctx, A, box);
      this.paintVignette(ctx, box);
    });
  },

  buildLayer(world, geo, draw) {
    const A = this.art(world);
    const c = document.createElement("canvas");
    c.width = Math.max(1, geo.pw);
    c.height = Math.max(1, geo.ph);
    const ctx = c.getContext("2d");
    ctx.setTransform(geo.px, 0, 0, geo.px, 0, 0);
    ctx.translate(geo.offX, geo.offY);
    draw(ctx, A, { L: -geo.offX, T: -geo.offY, R: LW + geo.offX, B: LH + geo.offY });
    return c;
  },

  // Beyond the arena walls: more valley, going soft and dark as it recedes.
  // There is no horizon to hang mountains on in a top-down field, so the depth
  // cue is atmospheric instead — the further from the clearing, the lower the
  // contrast and the bigger and vaguer the shapes.
  paintSurround(ctx, A, box) {
    const { L, T, R, B } = box;
    const g = ctx.createLinearGradient(0, T, 0, B);
    g.addColorStop(0, this.shade(A.far[1], -14));
    g.addColorStop(0.42, A.far[0]);
    g.addColorStop(1, this.shade(A.far[1], -10));
    ctx.fillStyle = g;
    ctx.fillRect(L, T, R - L, B - T);

    // Broad tonal drifts, so the surround is never a flat field of colour.
    for (let i = 0; i < 14; i++) {
      const hx = L + GK.util.hash2(i, 131) * (R - L);
      const hy = T + GK.util.hash2(i, 137) * (B - T);
      const rx = 60 + GK.util.hash2(i, 139) * 130;
      this.softBlob(ctx, hx, hy, rx, rx * 0.6, "rgba(0,0,0,0.10)");
    }

    // Vegetation and rock, in clumps. Each one is placed once and lives in the
    // baked layer, which is why there can be two hundred of them.
    for (let i = 0; i < 210; i++) {
      const hx = L + GK.util.hash2(i, 3) * (R - L);
      const hy = T + GK.util.hash2(i, 9) * (B - T);
      const dx = Math.max(0, -hx, hx - LW);
      const dy = Math.max(0, -hy, hy - LH);
      const out = Math.hypot(dx, dy);
      if (out < 12) continue;                       // keep clear of the field
      const far = Math.min(1, out / 240);
      const s = 4 + far * 13 + GK.util.hash2(i, 5) * 7;
      ctx.globalAlpha = 0.5 - far * 0.22;
      ctx.fillStyle = far > 0.55 ? this.shade(A.silh, 22) : A.silh;
      for (let k = 0; k < 3; k++) {
        const ox = (GK.util.hash2(i * 7 + k, 17) - 0.5) * s * 1.8;
        const oy = (GK.util.hash2(i * 7 + k, 23) - 0.5) * s * 1.1;
        ctx.beginPath();
        ctx.ellipse(hx + ox, hy + oy, s * (0.5 + GK.util.hash2(i + k, 29) * 0.6),
          s * (0.3 + GK.util.hash2(i + k, 31) * 0.4), GK.util.hash2(i + k, 37) * 3, 0, 6.28);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

  },

  // The playable ground: a lit floor, tonal variation, then litter.
  paintFloor(ctx, A) {
    const g = ctx.createLinearGradient(0, 0, 0, LH);
    g.addColorStop(0, A.floor[0]);
    g.addColorStop(0.62, GK.util.shade(A.floor[1], 12));
    g.addColorStop(1, A.floor[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LW, LH);

    for (let i = 0; i < 26; i++) {
      const rx = 16 + GK.util.hash2(i, 23) * 48;
      this.softBlob(ctx, GK.util.hash2(i, 11) * LW, GK.util.hash2(i, 17) * LH,
        rx, rx * 0.42, this.rgba(A.patch, 0.13));
    }
    for (let i = 0; i < 16; i++) {
      const rx = 14 + GK.util.hash2(i, 37) * 42;
      this.softBlob(ctx, GK.util.hash2(i, 29) * LW, GK.util.hash2(i, 31) * LH,
        rx, rx * 0.4, "rgba(0,0,0,0.055)");
    }

    // Where the light falls. One warm pool, high and to the left, and every
    // shadow in the game is cast down and right to agree with it.
    this.softBlob(ctx, LW * 0.32, LH * 0.22, LW * 0.86, LH * 0.46, A.sun);

    for (let d = 0; d < A.decor.length; d++) {
      const kind = A.decor[d][0], count = A.decor[d][1], sc = A.decor[d][2];
      const fn = DECOR[kind];
      if (!fn) continue;
      for (let i = 0; i < count; i++) {
        const salt = (d + 1) * 1013 + i * 17;
        const h = (k) => GK.util.hash2(salt + k * 7, 53 + k * 11);
        ctx.save();
        fn(ctx, GK.util.hash2(salt, 71) * LW, GK.util.hash2(salt, 97) * LH,
          sc * (0.75 + h(0) * 0.55), h, A);
        ctx.restore();
      }
    }

    // Dappled light over the top of the litter, so the scenery sits IN the
    // ground rather than on a sheet above it.
    for (let i = 0; i < 18; i++) {
      const rx = 10 + GK.util.hash2(i, 149) * 26;
      this.softBlob(ctx, GK.util.hash2(i, 151) * LW, GK.util.hash2(i, 157) * LH,
        rx, rx * 0.5, this.rgba(this.shade(A.floor[0], 40), 0.07));
    }
  },

  // The lip of the clearing: a shadow outside it, a lit edge inside.
  paintRim(ctx, A) {
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = "rgba(0,0,0," + (0.05 + i * 0.015).toFixed(3) + ")";
      ctx.lineWidth = 11 - i * 2;
      this.rr(ctx, -i * 1.2, -i * 1.2, LW + i * 2.4, LH + i * 2.4, ARENA_R + i);
      ctx.stroke();
    }
    ctx.save();
    this.rr(ctx, 0, 0, LW, LH, ARENA_R);
    ctx.clip();
    ctx.strokeStyle = "rgba(38,24,14,0.16)"; ctx.lineWidth = 16;
    this.rr(ctx, 0, 0, LW, LH, ARENA_R); ctx.stroke();
    ctx.strokeStyle = "rgba(38,24,14,0.16)"; ctx.lineWidth = 5;
    this.rr(ctx, 0, 0, LW, LH, ARENA_R); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = this.rgba(this.shade(A.floor[0], 56), 0.42);
    ctx.lineWidth = 1.6;
    this.rr(ctx, 1.6, 1.6, LW - 3.2, LH - 3.2, ARENA_R - 1.2);
    ctx.stroke();
  },

  // Foreground planting, rooted in the valley beyond and leaning in over the
  // rim. It reaches six logical pixels past the wall and no further: there is
  // depth to be had here, but not at the price of hiding something the engine
  // has pressed into a corner.
  paintFringe(ctx, A, box) {
    const fn = A.fringe === "rock" ? FRINGE.rock
      : A.fringe === "scrub" ? FRINGE.scrub : FRINGE.leaf;
    // Rooted 18-26px out and 8-14px tall, so the longest leaf lands about six
    // pixels inside the wall. That budget is the whole reason these numbers are
    // written out rather than eyeballed: the engine can press a creature right
    // against the wall, and foliage that hides it there would cost a heart.
    // Three passes down each edge: a deep faint layer, a middle one, and a few
    // big dark clumps right on the rim. One evenly spaced pass of one size is a
    // decorative border, which is what the first attempt looked like — depth
    // comes from the layers disagreeing about how big and how dark they are.
    const LAYERS = [
      { n: 10, out: [26, 22], size: [12, 9], alpha: 0.42, tint: 32 },
      { n: 13, out: [17, 13], size: [10, 7], alpha: 0.7, tint: 12 },
      { n: 11, out: [11, 6], size: [8, 4], alpha: 1, tint: -8 },
    ];
    const run = (salt, along, place) => {
      for (const L of LAYERS) {
        for (let i = 0; i < L.n; i++) {
          const h = (k) => GK.util.hash2(salt + i * 13 + k * 5 + L.n * 97, 61 + k * 9);
          const t = (i + h(1) * 0.9) / L.n;
          const out = L.out[0] + h(2) * L.out[1];
          const s = L.size[0] + h(3) * L.size[1];
          ctx.save();
          ctx.globalAlpha = L.alpha;
          place(along * t, out);
          fn(ctx, s, h, A, L.tint);
          ctx.restore();
        }
      }
    };
    // Each clump leans IN over the rim — one growing away from the field is
    // just more surround, and buys no depth at all.
    run(400, LW, (t, out) => { ctx.translate(t, -out); ctx.rotate(Math.PI); });
    run(900, LW, (t, out) => { ctx.translate(t, LH + out); });
    run(1400, LH, (t, out) => { ctx.translate(-out, t); ctx.rotate(Math.PI / 2); });
    run(1900, LH, (t, out) => { ctx.translate(LW + out, t); ctx.rotate(-Math.PI / 2); });
    ctx.globalAlpha = 1;
  },

  // The edges of the screen fall away, so the eye goes where the game is.
  //
  // Clipped to OUTSIDE the playfield, and that is not a detail: the first
  // version ran the gradient across the arena itself, which on a phone (where
  // the field fills the width) shaded the left and right walls — exactly the
  // ground a player has to read a creature's size against. The rim shadow in
  // paintRim frames the field; this frames the valley.
  paintVignette(ctx, box) {
    const { L, T, R, B } = box;
    const W = R - L, H = B - T;
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, T, W, H);
    this.rrPath(ctx, -2, -2, LW + 4, LH + 4, ARENA_R + 2);
    ctx.clip("evenodd");
    const band = (x, y, w, h, gx0, gy0, gx1, gy1) => {
      const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, "rgba(16,10,5,0.32)");
      g.addColorStop(1, "rgba(16,10,5,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
    };
    const dx = Math.min(Math.max(0, -L) * 1.5, 130);
    const dy = Math.min(Math.max(0, -T) * 1.5, 130);
    band(L, T, W, dy, L, T, L, T + dy);
    band(L, B - dy, W, dy, L, B, L, B - dy);
    band(L, T, dx, H, L, T, L + dx, T);
    band(R - dx, T, dx, H, R, T, R - dx, T);
    ctx.restore();
  },

  /* ======================== the moving background ======================== */
  // Cloud shadow crossing the valley. A fixed camera cannot have parallax, so
  // this is the depth cue that replaces it: something is passing overhead, and
  // the ground is underneath it.
  drawClouds(ctx, t, box) {
    if (!this.motion) return;
    const { L, T, R, B } = box;
    const W = R - L, H = B - T;
    for (let i = 0; i < 3; i++) {
      const sp = 5 + i * 3.5;
      const span = W + 420;
      const x = L - 210 + ((GK.util.hash2(i, 61) * span + t * sp) % span);
      const y = T + GK.util.hash2(i, 67) * H;
      const rx = 120 + GK.util.hash2(i, 71) * 120;
      this.softBlob(ctx, x, y, rx, rx * 0.48, "rgba(22,28,18,0.12)");
    }
  },

  // Pollen, dust, snow or embers, depending on where you are. Sixteen of them,
  // wrapped rather than respawned, so the air is never still and nothing
  // accumulates.
  drawMotes(ctx, A, t, box) {
    const m = A.mote;
    if (!m || !this.motion) return;
    const { L, T, R, B } = box;
    const W = R - L + 40, H = B - T + 40;
    ctx.fillStyle = m.color;
    for (let i = 0; i < m.n; i++) {
      const ph = GK.util.hash2(i, 83);
      const sp = 0.6 + GK.util.hash2(i, 89) * 0.9;
      const x = L - 20 + (((GK.util.hash2(i, 97) * W + t * m.drift * sp) % W) + W) % W;
      const y = T - 20 + (((GK.util.hash2(i, 101) * H + t * m.rise * sp) % H) + H) % H;
      const s = m.size * (0.7 + ph * 0.7);
      ctx.beginPath();
      ctx.arc(x + Math.sin(t * 1.4 + ph * 6.28) * 4, y, s, 0, 6.28);
      ctx.fill();
    }
  },

  drawScene(ctx, box) {
    if (this._scene) ctx.drawImage(this._scene, box.L, box.T, box.R - box.L, box.B - box.T);
  },
  drawOverlay(ctx, box) {
    if (this._overlay) ctx.drawImage(this._overlay, box.L, box.T, box.R - box.L, box.B - box.T);
  },

  /* ============================== creatures ============================== */
  // Everything stands on the ground, cast down and right to match the one light
  // source in paintFloor. Before this, every animal in the game floated.
  shadow(ctx, r, squash) {
    // Soft-edged, not a hard ellipse: a crisp dark oval under a creature reads
    // as a hole in the ground rather than as a shadow on it.
    this.softBlob(ctx, r * 0.1, r * 0.82, r * (0.95 * (squash || 1)), r * 0.34,
      "rgba(26,18,10,0.3)");
  },

  // The shared edge treatment. One dark rim and one top highlight on every
  // animal in the game is what makes eighteen procedural dinosaurs look like
  // one illustrator drew them, which is most of what "consistent art" means.
  pen(ctx, r, body) {
    const line = this.shade(body, -64);
    const hi = this.shade(body, 38);
    const lw = Math.max(0.7, r * 0.085);
    const ell = (x, y, rx, ry, fill, rot, outline) => {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.35, rx), Math.max(0.35, ry), rot || 0, 0, 6.28);
      ctx.fillStyle = fill; ctx.fill();
      if (outline !== false) { ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.stroke(); }
    };
    // A limb or a tail: the dark rim first as a fatter stroke, the body colour
    // over the top. The outline trick above, done for strokes.
    const limb = (path, w, fill) => {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); path();
      ctx.strokeStyle = line; ctx.lineWidth = w + lw * 2; ctx.stroke();
      ctx.beginPath(); path();
      ctx.strokeStyle = fill; ctx.lineWidth = w; ctx.stroke();
    };
    const poly = (pts, fill, outline) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      if (outline !== false) {
        ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.stroke();
      }
    };
    // A tapering ribbon along a quadratic curve — a tail. A round stroke of
    // constant width is what made every tail in the first version look like a
    // flipper, and a taper is most of the difference between "procedural
    // shapes" and "drawn animal".
    const ribbon = (x0, y0, cx, cy, x1, y1, w0, w1, fill) => {
      const N = 8, a = [], b = [];
      for (let i = 0; i <= N; i++) {
        const t = i / N, mt = 1 - t;
        const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1;
        const y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1;
        const dx = 2 * mt * (cx - x0) + 2 * t * (x1 - cx);
        const dy = 2 * mt * (cy - y0) + 2 * t * (y1 - cy);
        const len = Math.hypot(dx, dy) || 1;
        const w = w0 + (w1 - w0) * t;
        a.push([x - dy / len * w, y + dx / len * w]);
        b.push([x + dy / len * w, y - dx / len * w]);
      }
      ctx.beginPath();
      ctx.moveTo(a[0][0], a[0][1]);
      for (let i = 1; i <= N; i++) ctx.lineTo(a[i][0], a[i][1]);
      for (let i = N; i >= 0; i--) ctx.lineTo(b[i][0], b[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.lineJoin = "round"; ctx.stroke();
    };
    const eye = (x, y, rad, look, blink) => {
      if (blink) {
        ctx.strokeStyle = line; ctx.lineWidth = Math.max(0.8, rad * 0.6); ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(x - rad, y); ctx.lineTo(x + rad, y); ctx.stroke();
        return;
      }
      ell(x, y, rad, rad, "#fdfcf5", 0, rad > 1.7);
      ell(x + rad * 0.3 * (look || 0), y + rad * 0.06, rad * 0.56, rad * 0.64, "#1d2430", 0, false);
      ell(x + rad * 0.3 * (look || 0) - rad * 0.24, y - rad * 0.28,
        Math.max(0.35, rad * 0.22), Math.max(0.35, rad * 0.22), "rgba(255,255,255,0.92)", 0, false);
    };
    return { line, hi, lw, ell, limb, poly, ribbon, eye };
  },

  // One painter for every dinosaur in the game. `r` is the radius the engine
  // uses for collisions, so what you can see and what you can touch cannot
  // drift apart. `t` is wall-clock, used only for blinking.
  paintSpecies(ctx, sp, r, face, step, chomping, t) {
    const mo = this.motion;
    const plant = sp.kind === "plant";
    this.shadow(ctx, r, plant ? 0.72 : 1);
    ctx.save();
    ctx.scale(face < 0 ? -1 : 1, 1);
    ctx.translate(0, Math.sin(step) * r * 0.06 * mo);
    const P = this.pen(ctx, r, sp.body);
    const phase = sp.id ? sp.id.charCodeAt(0) * 0.17 : 0;
    const blink = !plant && ((t || 0) * 0.3 + phase) % 1 > 0.965 ? 1 : 0;
    const body = sp.body, trim = sp.trim;

    switch (sp.shape) {
      case "fern": {
        const sw = Math.sin(step) * 0.2 * mo;
        for (let i = -2; i <= 2; i++) {
          const bend = i * r * 0.35 + sw * r * 0.24;
          const tipX = i * r * 0.8 + sw * r * 0.5;
          P.limb(() => {
            ctx.moveTo(0, r * 0.8);
            ctx.quadraticCurveTo(bend, 0, tipX, -r * 0.75);
          }, Math.max(1.3, r * 0.19), i === 0 ? P.hi : body);
        }
        P.ell(0, r * 0.85, r * 0.5, r * 0.22, trim);
        break;
      }

      case "bush": {
        ctx.translate(Math.sin(step) * r * 0.05 * mo, 0);
        P.ell(-r * 0.4, r * 0.1, r * 0.6, r * 0.55, body);
        P.ell(r * 0.4, r * 0.15, r * 0.55, r * 0.5, body);
        P.ell(0, -r * 0.3, r * 0.65, r * 0.6, body);
        P.ell(-r * 0.12, -r * 0.52, r * 0.32, r * 0.2, this.rgba(P.hi, 0.5), 0, false);
        for (let i = 0; i < 4; i++) {
          const a = i * 1.7;
          P.ell(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.45, r * 0.17, r * 0.17, trim, 0, r > 7);
        }
        break;
      }

      case "bug": {
        for (let i = -1; i <= 1; i++) {
          const ix = i;
          P.limb(() => {
            ctx.moveTo(ix * r * 0.3, r * 0.3);
            ctx.lineTo(ix * r * 0.5 + Math.sin(step * 2 + ix) * r * 0.1, r * 0.85);
          }, Math.max(0.9, r * 0.1), this.shade(body, -22));
        }
        P.ell(r * 0.65, -r * 0.05, r * 0.35, r * 0.32, trim);
        P.ell(-r * 0.15, 0, r * 0.9, r * 0.62, body);
        P.ell(-r * 0.3, -r * 0.22, r * 0.45, r * 0.2, this.rgba(P.hi, 0.5), 0, false);
        ctx.strokeStyle = P.line; ctx.lineWidth = P.lw;
        ctx.beginPath(); ctx.moveTo(-r * 0.98, 0); ctx.lineTo(r * 0.45, 0); ctx.stroke();
        P.eye(r * 0.78, -r * 0.12, Math.max(1.1, r * 0.12), 0, blink);
        break;
      }

      case "flyer": {
        const flap = Math.sin(step * 3) * 0.5 * mo;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.1);
          ctx.quadraticCurveTo(r * 0.5, s * r * (0.9 + flap), r * 1.15, s * r * 0.25);
          ctx.quadraticCurveTo(r * 0.4, s * r * 0.2, 0, -r * 0.1);
          ctx.fillStyle = trim; ctx.fill();
          ctx.strokeStyle = P.line; ctx.lineWidth = P.lw * 0.85; ctx.stroke();
        }
        P.limb(() => {
          ctx.moveTo(-r * 0.55, 0);
          ctx.quadraticCurveTo(-r * 1.0, r * 0.1 + Math.sin(step * 2) * r * 0.12, -r * 1.25, -r * 0.1);
        }, Math.max(1, r * 0.14), body);
        P.ell(0, 0, r * 0.75, r * 0.3, body);
        P.ell(r * 0.75, -r * 0.12, r * 0.32, r * 0.26, body);
        P.eye(r * 0.85, -r * 0.16, Math.max(1.1, r * 0.13), 0, blink);
        break;
      }

      case "quad": case "club": case "plated": case "frilled": {
        const tsw = Math.sin(step * 2) * r * 0.14 * mo;
        P.ribbon(-r * 0.45, -r * 0.05, -r * 1.0, r * 0.1 + tsw, -r * 1.3, -r * 0.2,
          r * 0.2, sp.shape === "club" ? r * 0.09 : r * 0.045, body);
        const leg = (x, phase2) => {
          const kx = x + Math.sin(step * 2 + phase2) * r * 0.2 * mo;
          P.limb(() => { ctx.moveTo(x, r * 0.25); ctx.lineTo(kx, r * 0.76); },
            Math.max(1.4, r * 0.15), this.shade(body, -24));
          P.ell(kx + r * 0.04, r * 0.83, r * 0.17, r * 0.09, this.shade(body, -24));
        };
        leg(-r * 0.5, 0); leg(r * 0.35, 1.9);

        if (sp.shape === "plated") {
          for (let i = -2; i <= 2; i++) {
            P.poly([[i * r * 0.3 - r * 0.15, -r * 0.36], [i * r * 0.3, -r * 0.98],
              [i * r * 0.3 + r * 0.15, -r * 0.36]], trim);
          }
          for (const s of [-1, 1]) {
            P.limb(() => {
              ctx.moveTo(-r * 1.1, -r * 0.16);
              ctx.lineTo(-r * 1.42, -r * 0.16 + s * r * 0.38);
            }, Math.max(1.2, r * 0.09), trim);
          }
        } else if (sp.shape === "club") {
          P.ell(-r * 1.34, -r * 0.2, r * 0.3, r * 0.27, trim);
        } else if (sp.shape === "frilled") {
          // A shield with a scalloped edge, standing behind the head. A plain
          // pale ellipse there read as a balloon tied to the animal's nose.
          const fx = r * 0.58, fy = -r * 0.32, frx = r * 0.46, fry = r * 0.54;
          const shell = this.shade(trim, -34);
          P.ell(fx, fy, frx, fry, shell, -0.2);
          for (let i = 0; i < 5; i++) {
            const a = -1.45 + i * 0.72;
            P.ell(fx + Math.cos(a) * frx * 0.9, fy + Math.sin(a) * fry * 0.9,
              r * 0.12, r * 0.12, shell);
          }
          P.ell(fx + r * 0.04, fy, frx * 0.58, fry * 0.6,
            this.rgba(this.shade(trim, 10), 0.7), -0.2, false);
        } else if (sp.spiky) {
          for (let i = -2; i <= 2; i++) {
            P.poly([[i * r * 0.3 - r * 0.11, -r * 0.34], [i * r * 0.3, -r * 1.0],
              [i * r * 0.3 + r * 0.11, -r * 0.34]], trim);
          }
        }

        P.ell(0, -r * 0.05, r * 0.86, r * 0.5, body);
        P.ell(-r * 0.06, -r * 0.26, r * 0.56, r * 0.22, this.rgba(P.hi, 0.45), 0, false);
        if (sp.shape === "club") {
          for (let i = -2; i <= 1; i++) P.ell(i * r * 0.34, -r * 0.4, r * 0.15, r * 0.1, trim, 0, r > 14);
        }
        P.ell(r * 0.82, -r * 0.16, r * 0.37, r * 0.31, body);
        if (sp.shape === "frilled") {
          P.limb(() => { ctx.moveTo(r * 0.95, -r * 0.34); ctx.lineTo(r * 1.38, -r * 0.64); },
            Math.max(1.2, r * 0.1), trim);
          P.limb(() => { ctx.moveTo(r * 0.95, -r * 0.1); ctx.lineTo(r * 1.34, -r * 0.3); },
            Math.max(1.2, r * 0.1), trim);
        }
        P.eye(r * 0.96, -r * 0.24, Math.max(1.1, r * 0.12), 0.2, blink);
        break;
      }

      default: {
        // Every biped — compy, oviraptor, raptor, gallimimus, dilophosaurus and
        // the two big ones — is the same drawing at different weights.
        const heavy = sp.shape === "rex";
        const tailLen = heavy ? 1.36 : 1.2;
        P.ribbon(-r * 0.34, -r * 0.05, -r * 0.9, r * 0.2 + Math.sin(step * 2) * r * 0.16 * mo,
          -r * tailLen, -r * 0.3, r * (heavy ? 0.2 : 0.15), r * 0.035, body);
        const leg = (x, phase2, fill) => {
          const kx = x + Math.sin(step * 2 + phase2) * r * 0.22 * mo;
          P.limb(() => { ctx.moveTo(x, r * 0.22); ctx.lineTo(kx, r * 0.76); },
            Math.max(1.4, r * 0.15), fill);
          P.ell(kx + r * 0.06, r * 0.84, r * 0.18, r * 0.09, fill);
        };
        leg(-r * 0.16, 0, this.shade(body, -26));

        P.ell(0, -r * 0.08, r * (heavy ? 0.8 : 0.66), r * (heavy ? 0.56 : 0.46), body);
        P.ell(-r * 0.05, r * 0.14, r * 0.5, r * 0.24, trim, 0, false);
        P.ell(-r * 0.06, -r * 0.3, r * (heavy ? 0.5 : 0.4), r * 0.2, this.rgba(P.hi, 0.45), 0, false);
        leg(r * 0.22, 2.1, this.shade(body, -6));

        P.limb(() => {
          ctx.moveTo(r * 0.3, -r * 0.2);
          ctx.lineTo(r * 0.6, -r * (heavy ? 0.5 : 0.62));
        }, r * (heavy ? 0.38 : 0.25), body);

        const hx = r * (heavy ? 0.82 : 0.72), hy = -r * (heavy ? 0.58 : 0.72);
        if (sp.shape === "crested") {
          for (const s of [-1, 1]) {
            P.ell(hx - r * 0.02, hy - r * 0.3 + s * r * 0.05, r * 0.27, r * 0.16, trim, -0.35);
          }
        }
        P.ell(hx, hy, r * (heavy ? 0.44 : 0.3), r * (heavy ? 0.32 : 0.24), body);

        const gape = chomping ? r * 0.26 : r * 0.06;
        P.poly([[hx + r * 0.06, hy + r * 0.04],
          [hx + r * (heavy ? 0.52 : 0.36), hy - r * 0.02],
          [hx + r * (heavy ? 0.5 : 0.34), hy + gape]], "#5a2430", r > 12);
        if (heavy && r > 16) {
          for (let i = 0; i < 3; i++) {
            P.ell(hx + r * (0.18 + i * 0.12), hy + r * 0.06, r * 0.045, r * 0.075, "#fff", 0, false);
          }
        }
        if (heavy) {
          // Tiny arms. Non-negotiable.
          P.limb(() => { ctx.moveTo(r * 0.34, -r * 0.02); ctx.lineTo(r * 0.52, r * 0.16); },
            Math.max(1, r * 0.1), body);
        }
        P.eye(hx + r * 0.12, hy - r * (heavy ? 0.1 : 0.06), Math.max(1.1, r * 0.13), 0.25, blink);
        if (r > 15) {
          ctx.strokeStyle = this.rgba(P.line, 0.75);
          ctx.lineWidth = Math.max(0.8, r * 0.075); ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(hx + r * 0.12, hy - r * (heavy ? 0.1 : 0.06), r * 0.25, -2.6, -1.3);
          ctx.stroke();
        }
        break;
      }
    }
    ctx.restore();
  },

  /* =============================== the star ============================== */
  // Rex gets her own painter rather than borrowing the generic biped. She is
  // on screen for the whole game and she is the thing the player IS, so she
  // earns a face, a belly, stripes that count her size, and a crouch-and-pop
  // when she grows. The two big adult rexes keep the generic drawing, which is
  // also how you tell at a glance that one of them is not you.
  growScale(u) {
    if (u < 0.16) { const k = u / 0.16; return { x: 1 - 0.1 * k, y: 1 - 0.16 * k }; }
    if (u < 0.42) { const k = (u - 0.16) / 0.26; return { x: 0.9 + 0.28 * k, y: 0.84 + 0.42 * k }; }
    const k = (u - 0.42) / 0.58;
    const e = Math.sin(k * Math.PI * 2.2) * (1 - k) * 0.12;
    return { x: 1.18 - 0.18 * k - e, y: 1.26 - 0.26 * k + e };
  },

  paintPlayer(ctx, st) {
    const r = st.r, mo = this.motion, t = st.t;
    const body = SKIN[st.tier] || SKIN[1], trim = SKIN_TRIM[st.tier] || SKIN_TRIM[1];
    let sx = 1, sy = 1;
    if (st.grow > 0) {
      const k = this.growScale(1 - st.grow);
      sx *= k.x; sy *= k.y;
    }
    sx += st.chomp * 0.16 * mo;
    sy -= st.chomp * 0.12 * mo;
    sy += Math.sin(t * 2.1) * 0.022 * mo;          // breathing

    this.softBlob(ctx, 0, r * 0.5, r * 2.2, r * 1.5, "rgba(255,244,198,0.15)");
    this.shadow(ctx, r, sx);
    ctx.save();
    ctx.scale(st.face < 0 ? -1 : 1, 1);
    // Squash about the feet, so a bite plants her rather than sinking her.
    ctx.translate(0, r * 0.9);
    ctx.scale(sx, sy);
    ctx.translate(0, -r * 0.9);
    ctx.translate(0, Math.sin(st.step) * r * 0.05 * mo);

    const P = this.pen(ctx, r, body);
    const dark = this.shade(body, -30);
    const sway = Math.sin(st.step * 1.7) * r * 0.15 * mo;
    const stride = (x, phase, fill, w) => {
      const kx = x + Math.sin(st.step * 2 + phase) * r * 0.24 * mo;
      P.limb(() => { ctx.moveTo(x, r * 0.18); ctx.lineTo(kx, r * 0.74); }, w, fill);
      P.ell(kx + r * 0.06, r * 0.82, r * 0.19, r * 0.1, fill);      // a foot
    };

    // Tail: thick at the hip, thin at the tip.
    P.ribbon(-r * 0.2, -r * 0.02, -r * 0.86, r * 0.16 + sway,
      -r * 1.4, -r * 0.34 + sway * 0.6, r * 0.2, r * 0.035, body);

    // The far leg goes behind the body and the near one in front, which is the
    // only depth cue a flat side-on drawing gets.
    stride(-r * 0.26, 0, dark, Math.max(1.4, r * 0.15));

    // Body, top light, belly
    P.ell(0, -r * 0.06, r * 0.78, r * 0.56, body);
    P.ell(-r * 0.06, -r * 0.3, r * 0.48, r * 0.2, this.rgba(P.hi, 0.55), 0, false);
    P.ell(0, r * 0.18, r * 0.56, r * 0.26, trim, 0, false);

    // Back stripes. One more appears with each size she reaches, so how big she
    // is is written on her back as well as measured by her outline.
    const stripes = Math.max(1, Math.min(4, st.tier - 1));
    ctx.strokeStyle = this.rgba(dark, 0.8);
    ctx.lineWidth = Math.max(1, r * 0.11);
    ctx.lineCap = "round";
    for (let i = 0; i < stripes; i++) {
      ctx.beginPath();
      ctx.arc(-r * 0.34 + i * (r * 0.68 / stripes), -r * 0.04, r * 0.42, -2.35, -1.7);
      ctx.stroke();
    }

    stride(r * 0.22, 2.1, this.shade(body, -6), Math.max(1.6, r * 0.18));

    // Neck and head. The head rides high and clear of the shoulders: the first
    // version tucked it into the body and she came out as a peanut with an eye.
    const hx = r * 0.94, hy = -r * 0.78;
    P.limb(() => { ctx.moveTo(r * 0.34, -r * 0.26); ctx.lineTo(hx - r * 0.22, hy + r * 0.22); },
      r * 0.3, body);

    // A crest that grows another spike with every size — the visible reward.
    const spikes = Math.max(0, Math.min(4, st.tier - 3));
    for (let i = 0; i < spikes; i++) {
      const bx = hx - r * 0.28 + i * r * 0.19;
      P.poly([[bx - r * 0.07, hy - r * 0.2], [bx + r * 0.02, hy - r * 0.52],
        [bx + r * 0.09, hy - r * 0.2]], trim, r > 16);
    }

    P.ell(hx, hy, r * 0.42, r * 0.33, body);
    P.ell(hx + r * 0.3, hy + r * 0.08, r * 0.23, r * 0.2, body);        // muzzle
    P.ell(hx - r * 0.06, hy - r * 0.15, r * 0.26, r * 0.11, this.rgba(P.hi, 0.55), 0, false);

    // The jaw. A dark wedge on its own barely reads as a mouth, so the lower
    // jaw is a separate piece that swings down on the corner — which is also
    // what makes a bite legible at hatchling size.
    const mx = hx + r * 0.06, my = hy + r * 0.13;
    const gape = r * (0.05 + 0.34 * st.chomp);
    P.poly([[mx, my - r * 0.07], [mx + r * 0.5, my - r * 0.08],
      [mx + r * 0.44, my + gape], [mx, my + gape * 0.8]], "#5a2430", false);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(st.chomp * 0.5);
    P.ell(r * 0.24, gape * 0.72, r * 0.25, r * 0.085, body);
    ctx.restore();
    if (r > 14) {
      for (let i = 0; i < 3; i++) {
        P.ell(mx + r * (0.11 + i * 0.12), my - r * 0.03, r * 0.045, r * 0.075, "#fff", 0, false);
      }
    }

    // Tiny arms. Non-negotiable.
    P.limb(() => { ctx.moveTo(r * 0.38, -r * 0.08); ctx.lineTo(r * 0.6, r * 0.12); },
      Math.max(1, r * 0.1), body);

    // The face. A brow and a moving pupil is nearly all of the personality:
    // she looks where she is going, glances about when she is idle, and shuts
    // her eye when she bites.
    const look = st.moving > 0.35 ? 0.6 : Math.sin(t * 0.7) * 0.8;
    const blink = st.sleepy || (t * 0.31) % 1 > 0.962 || st.chomp > 0.6 ? 1 : 0;
    const ex = hx + r * 0.08, ey = hy - r * 0.09;
    P.eye(ex, ey, Math.max(1.5, r * 0.15), look, blink);
    // The brow drops when something is chasing her, which is the only "worried"
    // she ever gets — nothing in this game is allowed to look frightening.
    const worry = st.sad ? 0.42 : st.invuln > 0 ? 0.28 : 0;
    ctx.strokeStyle = this.shade(body, -58);
    ctx.lineWidth = Math.max(0.9, r * 0.085);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(ex, ey + worry * r * 0.12, r * 0.26, -2.5 + worry, -1.2 + worry);
    ctx.stroke();
    if (r > 14) {
      P.ell(hx + r * 0.06, hy + r * 0.02, r * 0.13, r * 0.08, "rgba(255,146,146,0.3)", 0, false);
    }

    ctx.restore();
  },

  // Ring of grace after a fright: readable without the harsh strobe the first
  // version used, which is a nasty thing to put in a small child's game.
  guardRing(ctx, r, k) {
    const a = 0.3 + 0.3 * Math.sin(k * 16) * this.motion;
    ctx.strokeStyle = "rgba(255,238,190," + a.toFixed(3) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, 6.28); ctx.stroke();
  },

  /* ============================ proximity cues =========================== */
  // Across the valley you judge by size; up close the game answers the
  // question for you. This is the safety net under the whole size mechanic, so
  // it has to be unmissable and it must not look like a debug overlay.
  cue(ctx, x, y, r, rel, near, t) {
    const pulse = 0.55 + 0.45 * Math.sin(t * 6) * this.motion;
    if (rel === "danger") {
      this.softBlob(ctx, x, y, r * 2.3, r * 2.3, "rgba(214,58,44,0.2)");
      ctx.strokeStyle = "rgba(232,80,62," + ((0.4 + 0.5 * near) * pulse).toFixed(3) + ")";
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 6.28); ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255,196,180," + (0.3 * near * pulse).toFixed(3) + ")";
      ctx.beginPath(); ctx.arc(x, y, r + 9.5, 0, 6.28); ctx.stroke();
      // Four ticks, like a target. Reads as "watch this one" at a glance.
      ctx.strokeStyle = "rgba(232,80,62," + ((0.34 + 0.44 * near) * pulse).toFixed(3) + ")";
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = i * 1.5708 + t * 0.9 * this.motion;
        const c = Math.cos(a), s = Math.sin(a);
        ctx.beginPath();
        ctx.moveTo(x + c * (r + 11), y + s * (r + 11));
        ctx.lineTo(x + c * (r + 15), y + s * (r + 15));
        ctx.stroke();
      }
    } else if (rel === "food") {
      ctx.globalAlpha = 0.5 + 0.5 * near;
      this.softBlob(ctx, x, y, r * 2.1, r * 2.1, "rgba(255,225,130,0.32)");
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(255,232,150," + (0.3 + 0.45 * near).toFixed(3) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 6.28); ctx.stroke();
    } else if (rel === "spiky") {
      ctx.strokeStyle = "rgba(202,212,230," + (0.3 + 0.38 * near).toFixed(3) + ")";
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 6.28); ctx.stroke();
      ctx.setLineDash([]);
    }
  },
};

/* =========================== world palettes ============================= */
// Each valley gets its own floor, its own light, its own litter and its own
// thing drifting in the air. Same illustration language, four moods — which is
// what makes them read as parts of one place rather than four themes.
const WORLD_ART = {
  hollow: {
    floor: ["#8ec776", "#46833f"],        // arena floor, top -> bottom
    patch: "#8fcb79",                      // soft tonal variation
    sun: "rgba(255,246,199,0.34)",         // where the light falls
    far: ["#43804c", "#2c5e39"],           // the valley beyond the arena
    silh: "#1d4527",                       // its silhouettes
    rim: "#2c5f36", wood: "#6b4a2c",
    decor: [
      ["moss", 18, 1.35], ["tuft", 34, 1], ["tuft2", 54, 0.52], ["fernClump", 15, 0.95],
      ["flower", 14, 0.9], ["stone", 8, 1], ["log", 2, 1.1],
    ],
    fringe: "leaf",
    mote: { color: "rgba(255,248,206,0.6)", n: 14, rise: -7, drift: 10, size: 1.5 },
  },

  gulch: {
    floor: ["#e3bb80", "#ad7d49"],
    patch: "#e8c68f",
    sun: "rgba(255,236,178,0.3)",
    far: ["#9b7b48", "#745a36"],
    silh: "#5a4526",
    rim: "#8a6a3c", wood: "#8a6338",
    decor: [
      ["ripple", 16, 1.4], ["crack", 14, 1.15], ["tuft", 14, 0.85], ["tuft2", 30, 0.5],
      ["bone", 11, 1], ["pebble", 26, 1], ["stone", 9, 1.1],
    ],
    fringe: "scrub",
    mote: { color: "rgba(247,231,192,0.5)", n: 16, rise: -3, drift: 22, size: 1.6 },
  },

  ridge: {
    floor: ["#9d92a9", "#655d7b"],
    patch: "#a49ab0",
    sun: "rgba(226,232,255,0.26)",
    far: ["#665e7c", "#45405c"],
    silh: "#332e46",
    rim: "#514a68", wood: "#5b4f5f",
    decor: [
      ["plate", 15, 1.3], ["scree", 24, 1], ["lichen", 18, 1.2],
      ["crack", 12, 1], ["pebble", 22, 0.9], ["stone", 10, 1.15],
    ],
    fringe: "rock",
    mote: { color: "rgba(233,238,255,0.45)", n: 12, rise: -4, drift: 14, size: 1.4 },
  },

  basin: {
    floor: ["#b26e50", "#713e30"],
    patch: "#bd7554",
    sun: "rgba(255,203,142,0.3)",
    far: ["#764232", "#4f2a21"],
    silh: "#361a15",
    rim: "#7a4130", wood: "#4a2a20",
    decor: [
      ["scorch", 14, 1.5], ["emberCrack", 12, 1.2], ["ash", 16, 1.4],
      ["pebble", 20, 1], ["stone", 9, 1.2], ["stump", 5, 1.1],
    ],
    fringe: "rock",
    mote: { color: "rgba(255,178,96,0.72)", n: 18, rise: -20, drift: 12, size: 1.6 },
  },
};

/* =========================== foreground fringe ========================== */
// Drawn rooted outside the arena and leaning in, in the baked overlay layer.
// Local space: the clump grows towards -y, and the caller has already rotated
// it to face the field.
const FRINGE = {
  leaf(ctx, s, h, A, tint) {
    const dark = Art.shade(A.silh, 8 + (tint || 0));
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.22, s * 0.82, s * 0.5, 0, 0, 6.28);
    ctx.fill();
    for (let i = -3; i <= 3; i++) {
      const len = s * (0.9 + h(i + 4) * 0.8);
      ctx.fillStyle = i % 2 ? dark : Art.shade(A.silh, 26 + (tint || 0));
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.quadraticCurveTo(i * len * 0.5, -len * 0.45, i * len * 0.42, -len);
      ctx.quadraticCurveTo(i * len * 0.12, -len * 0.4, 0, s * 0.3);
      ctx.fill();
    }
    ctx.fillStyle = Art.rgba(Art.shade(A.silh, 40 + (tint || 0)), 0.5);
    ctx.beginPath(); ctx.ellipse(0, -s * 0.2, s * 0.4, s * 0.24, 0, 0, 6.28); ctx.fill();
  },

  scrub(ctx, s, h, A, tint) {
    ctx.strokeStyle = Art.shade(A.silh, 14 + (tint || 0));
    ctx.lineWidth = Math.max(1.2, s * 0.13);
    ctx.lineCap = "round";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(0, s * 0.3);
      ctx.quadraticCurveTo(i * s * 0.3, -s * 0.5, i * s * 0.62, -s * (0.8 + h(i + 6) * 0.5));
      ctx.stroke();
    }
    ctx.fillStyle = Art.rgba(Art.shade(A.silh, 30 + (tint || 0)), 0.7);
    ctx.beginPath(); ctx.ellipse(0, -s * 0.1, s * 0.5, s * 0.3, 0, 0, 6.28); ctx.fill();
  },

  rock(ctx, s, h, A, tint) {
    const pts = [];
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      const rr = s * (0.7 + h(i + 3) * 0.8);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.9 - s * 0.1]);
    }
    pts.push([s, s * 0.4], [-s, s * 0.4]);
    ctx.fillStyle = Art.shade(A.silh, 12 + (tint || 0));
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = Art.rgba(Art.shade(A.silh, 38 + (tint || 0)), 0.55);
    ctx.beginPath(); ctx.ellipse(-s * 0.2, -s * 0.4, s * 0.42, s * 0.2, -0.3, 0, 6.28); ctx.fill();
  },
};

/* ============================= ground litter ============================ */
// Each of these paints ONE piece of scenery at (x, y). They run while a world's
// static layer is being built and never again, so they can afford to be fussy.
// `h(k)` is a stable per-item hash: the same valley comes out of the same world
// every time, on every device.
const DECOR = {
  // Same brush, a second pass at half height: grass is not one size.
  tuft2(ctx, x, y, s, h, A) { DECOR.tuft(ctx, x, y, s, h, A); },

  tuft(ctx, x, y, s, h, A) {
    const n = 6 + Math.floor(h(1) * 5);
    const tall = (7 + h(2) * 6) * s;
    ctx.fillStyle = Art.rgba(Art.shade(A.floor[1], -14), 0.22);
    ctx.beginPath();
    ctx.ellipse(x, y, 3.4 * s, 1.3 * s, 0, 0, 6.28);
    ctx.fill();
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 1.05 * s;
      const lean = dx * 1.5 + (h(10 + i) - 0.5) * 2.2;
      const len = tall * (0.62 + h(20 + i) * 0.5);
      ctx.strokeStyle = i % 3 === 0
        ? Art.rgba(Art.shade(A.floor[1], 56), 0.52)
        : Art.rgba(Art.shade(A.floor[1], 20), 0.46);
      ctx.lineWidth = 1.1 * s;
      ctx.beginPath();
      ctx.moveTo(x + dx * 0.4, y);
      ctx.quadraticCurveTo(x + dx + lean * 0.3, y - len * 0.62, x + dx + lean, y - len);
      ctx.stroke();
    }
  },

  fernClump(ctx, x, y, s, h, A) {
    const dark = Art.rgba(Art.shade(A.floor[1], -16), 0.55);
    const light = Art.rgba(Art.shade(A.floor[1], 38), 0.55);
    ctx.lineCap = "round";
    for (let i = -3; i <= 3; i++) {
      const len = (9 + h(i + 4) * 5) * s;
      ctx.strokeStyle = i === 0 ? light : dark;
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(x, y + 1.5 * s);
      ctx.quadraticCurveTo(x + i * len * 0.34, y - len * 0.44, x + i * len * 0.6, y - len * 0.74);
      ctx.stroke();
    }
  },

  moss(ctx, x, y, s, h, A) {
    for (let i = 0; i < 3; i++) {
      const rx = (8 + h(i) * 9) * s;
      Art.softBlob(ctx, x + (h(i + 9) - 0.5) * 10 * s, y + (h(i + 13) - 0.5) * 6 * s,
        rx, rx * (0.42 + h(i + 5) * 0.28), Art.rgba(A.patch, 0.2));
    }
  },

  stone(ctx, x, y, s, h, A) {
    const rx = (4 + h(1) * 4.5) * s, ry = rx * (0.6 + h(2) * 0.22);
    const rot = h(3) * 1.6;
    ctx.fillStyle = "rgba(0,0,0,0.17)";
    ctx.beginPath(); ctx.ellipse(x + ry * 0.3, y + ry * 0.45, rx * 1.04, ry * 0.58, 0, 0, 6.28); ctx.fill();
    const base = Art.shade(A.rim, 28);
    ctx.fillStyle = base;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, 6.28); ctx.fill();
    ctx.fillStyle = Art.rgba(Art.shade(base, 42), 0.7);
    ctx.beginPath(); ctx.ellipse(x - rx * 0.16, y - ry * 0.3, rx * 0.58, ry * 0.42, rot, 0, 6.28); ctx.fill();
  },

  flower(ctx, x, y, s, h, A) {
    const pal = ["#ffe07a", "#ffd4e2", "#f4f7ff", "#ffbba6"];
    const c = pal[Math.floor(h(1) * pal.length)];
    const rr = 1.6 * s, top = y - 3.4 * s;
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = Art.rgba(Art.shade(A.floor[1], 34), 0.6);
    ctx.lineWidth = 0.9 * s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x, y + s); ctx.lineTo(x, top); ctx.stroke();
    ctx.fillStyle = c;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.2566 + h(2) * 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * rr, top + Math.sin(a) * rr, rr * 0.8, 0, 6.28);
      ctx.fill();
    }
    ctx.fillStyle = "#ffd45e";
    ctx.beginPath(); ctx.arc(x, top, rr * 0.55, 0, 6.28); ctx.fill();
    ctx.globalAlpha = 1;
  },

  log(ctx, x, y, s, h, A) {
    const w = (26 + h(1) * 18) * s, t = (7 + h(2) * 3) * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((h(3) - 0.5) * 0.9);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    Art.rr(ctx, -w / 2 + 2, -t / 2 + t * 0.55, w, t, t / 2); ctx.fill();
    const bark = A.wood || Art.shade(A.rim, -18);
    ctx.fillStyle = bark;
    Art.rr(ctx, -w / 2, -t / 2, w, t, t / 2); ctx.fill();
    ctx.fillStyle = Art.rgba(Art.shade(bark, 36), 0.75);
    Art.rr(ctx, -w / 2 + t * 0.35, -t / 2 + t * 0.14, w - t * 0.7, t * 0.32, t * 0.16); ctx.fill();
    ctx.fillStyle = Art.shade(bark, 26);
    ctx.beginPath(); ctx.ellipse(w / 2 - t * 0.08, 0, t * 0.2, t * 0.42, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = Art.rgba(A.patch, 0.45);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(-w * 0.3 + w * 0.3 * i + h(i + 7) * 5, -t * 0.36, 4.2 * s, 1.7 * s, 0, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  },

  crack(ctx, x, y, s, h, A) {
    const step = (5 + h(1) * 5) * s;
    ctx.strokeStyle = Art.rgba(Art.shade(A.floor[1], -50), 0.42);
    ctx.lineWidth = 1.2 * s; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(x, y);
    let px = x, py = y, a = h(2) * 6.28;
    for (let i = 1; i <= 5; i++) {
      a += (h(i + 4) - 0.5) * 1.3;
      px += Math.cos(a) * step; py += Math.sin(a) * step * 0.7;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = Art.rgba(Art.shade(A.floor[0], 40), 0.24);
    ctx.lineWidth = 0.6 * s;
    ctx.stroke();
  },

  ripple(ctx, x, y, s, h, A) {
    ctx.strokeStyle = Art.rgba(Art.shade(A.patch, 30), 0.3);
    ctx.lineWidth = 1.5 * s;
    const rot = (h(1) - 0.5) * 1.3;
    for (let i = 0; i < 3; i++) {
      const rx = (10 + i * 6 + h(i) * 4) * s;
      ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.3, rot, -0.95, 0.95); ctx.stroke();
    }
  },

  bone(ctx, x, y, s, h, A) {
    const len = (9 + h(1) * 8) * s, w = 2.3 * s;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(h(2) * 6.28);
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    Art.rr(ctx, -len / 2, -w / 2 + 1.5, len, w, w / 2); ctx.fill();
    ctx.fillStyle = "#efe4ca";
    Art.rr(ctx, -len / 2, -w / 2, len, w, w / 2); ctx.fill();
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        ctx.beginPath(); ctx.arc(sx * len / 2, sy * w * 0.52, w * 0.6, 0, 6.28); ctx.fill();
      }
    }
    ctx.fillStyle = "rgba(148,126,90,0.3)";
    Art.rr(ctx, -len / 2 + w * 0.5, w * 0.02, len - w, w * 0.28, w * 0.14); ctx.fill();
    ctx.restore();
  },

  pebble(ctx, x, y, s, h, A) {
    const n = 2 + Math.floor(h(1) * 3);
    for (let i = 0; i < n; i++) {
      const r = (1.5 + h(i + 2) * 1.9) * s;
      const px = x + (h(i + 6) - 0.5) * 11 * s, py = y + (h(i + 11) - 0.5) * 8 * s;
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.beginPath(); ctx.ellipse(px, py + r * 0.55, r * 1.1, r * 0.55, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = Art.rgba(Art.shade(A.rim, 36), 0.85);
      ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.78, 0, 0, 6.28); ctx.fill();
    }
  },

  plate(ctx, x, y, s, h, A) {
    const R = (11 + h(1) * 13) * s, n = 5 + Math.floor(h(2) * 2);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.28 + h(i + 3) * 0.55;
      const rr = R * (0.6 + h(i + 9) * 0.5);
      pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62]);
    }
    const trace = (dx, dy) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(pts[i][0] + dx, pts[i][1] + dy);
        else ctx.moveTo(pts[i][0] + dx, pts[i][1] + dy);
      }
      ctx.closePath();
    };
    trace(1.6, 2.6); ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.fill();
    trace(0, 0); ctx.fillStyle = Art.rgba(Art.shade(A.floor[0], 16), 0.6); ctx.fill();
    ctx.strokeStyle = Art.rgba(Art.shade(A.floor[1], -38), 0.35); ctx.lineWidth = 1; ctx.stroke();
  },

  scree(ctx, x, y, s, h, A) {
    const n = 4 + Math.floor(h(1) * 4);
    for (let i = 0; i < n; i++) {
      const r = (1.7 + h(i + 2) * 2.5) * s;
      const px = x + (h(i + 7) - 0.5) * 19 * s, py = y + (h(i + 13) - 0.5) * 13 * s;
      ctx.fillStyle = Art.rgba(Art.shade(A.floor[0], i % 2 ? 26 : -18), 0.65);
      ctx.beginPath();
      ctx.moveTo(px - r, py + r * 0.6); ctx.lineTo(px, py - r); ctx.lineTo(px + r, py + r * 0.5);
      ctx.closePath(); ctx.fill();
    }
  },

  lichen(ctx, x, y, s, h, A) {
    const rx = (6 + h(1) * 8) * s;
    ctx.fillStyle = "rgba(207,230,210,0.15)";
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.68, h(2) * 3, 0, 6.28); ctx.fill();
    ctx.fillStyle = "rgba(232,244,228,0.2)";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(x + (h(i + 4) - 0.5) * rx * 1.4, y + (h(i + 9) - 0.5) * rx, 1.2 * s, 0, 6.28);
      ctx.fill();
    }
  },

  scorch(ctx, x, y, s, h) {
    const rx = (10 + h(1) * 15) * s;
    Art.softBlob(ctx, x, y, rx, rx * 0.66, "rgba(38,17,12,0.32)");
  },

  ash(ctx, x, y, s, h) {
    const rx = (12 + h(1) * 17) * s;
    Art.softBlob(ctx, x, y, rx, rx * 0.38, "rgba(228,216,204,0.2)");
  },

  emberCrack(ctx, x, y, s, h) {
    const len = (16 + h(1) * 20) * s, a = h(2) * 6.28;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len * 0.6;
    Art.softBlob(ctx, (x + x2) / 2, (y + y2) / 2, len * 0.62, len * 0.32, "rgba(255,138,58,0.24)");
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let i = 1; i <= 4; i++) {
      const t = i / 4;
      ctx.lineTo(x + (x2 - x) * t + (h(i + 5) - 0.5) * 6 * s,
        y + (y2 - y) * t + (h(i + 11) - 0.5) * 6 * s);
    }
    ctx.strokeStyle = "rgba(255,182,88,0.7)"; ctx.lineWidth = 1.6 * s; ctx.stroke();
    ctx.strokeStyle = "rgba(255,242,196,0.5)"; ctx.lineWidth = 0.7 * s; ctx.stroke();
  },

  stump(ctx, x, y, s, h, A) {
    const r = (6 + h(1) * 4) * s;
    ctx.fillStyle = "rgba(0,0,0,0.24)";
    ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + r * 0.45, r * 1.15, r * 0.5, 0, 0, 6.28); ctx.fill();
    ctx.strokeStyle = Art.shade(A.silh, 16); ctx.lineWidth = 1.7 * s; ctx.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25 + h(2) * 2;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * r * 1.9, y + Math.sin(a) * r * 1.1);
      ctx.stroke();
    }
    ctx.fillStyle = A.silh;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, 6.28); ctx.fill();
    ctx.fillStyle = Art.rgba(Art.shade(A.silh, 44), 0.85);
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.12, r * 0.6, r * 0.4, 0, 0, 6.28); ctx.fill();
  },
};
