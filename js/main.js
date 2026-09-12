// App shell — splash, the profile roster, the valley map, the Dino Book,
// results and the family leaderboard. Profiles, PINs, sync and install all come
// from gamekit; this file only decides what goes on each screen.

const AVATARS = ["🦖", "🦕", "🐊", "🦎", "🐢", "🦅", "🐉", "🦊", "🐻", "🦉", "🐙", "⭐"];

const App = {
  profile: null,
  token: 0,          // bumped on every screen change a delayed transition could outlive

  el(id) { return document.getElementById(id); },

  init() {
    const settings = Storage.getSettings();
    Sfx.enabled = settings.sound !== false;

    GK.UI.onScreenChange = (name) => {
      Render.active = name === "game";
      if (name === "splash") this.refreshSplash();
    };
    GK.UI.bindSoundToggle(Storage);
    GK.UI.bindMenuClicks();

    GK.Profiles.init({
      storage: Storage,
      avatars: AVATARS,
      meta: (p, prog) =>
        `⭐ ${Storage.totalStars(prog)}/${LEVELS.length * 3} · 📖 ${Storage.metCount(prog)}/${SPECIES.length}` +
        ` · 🏆 ${(prog.feastBest || 0).toLocaleString()}`,
      onEnter: (p) => { this.profile = p; this.showMap(); },
      addLabel: "New Hatchling",
    });

    GK.initPWA({ appName: "Tiny Rex" });
    Render.boot();

    GK.Debug.init({ storage: Storage, title: "TINY REX" })
      .jump("hunt", LEVELS.length, (n) => this.startLevel(n - 1, true))
      .action("grow a size", () => { if (Game.running) { Game.player.belly += NEED[Game.player.tier]; Game.grow(); } })
      .action("feast", () => this.startFeast(true));

    this.showScreen("splash");
    Storage.initFirebase().then((ok) => {
      this.el("sync-badge").textContent = ok ? "☁️ family sync on" : "📴 offline";
      if (ok && GK.UI.screen === "profiles") GK.Profiles.renderList();
      if (ok && GK.UI.screen === "splash") this.refreshSplash();
      if (ok && GK.UI.screen === "map") this.showMap();
      if (ok && GK.UI.screen === "leaderboard") this.showLeaderboard(true);
    });
  },

  showScreen(name) { this.token++; GK.UI.showScreen(name); },

  // Every delayed transition captures the token and re-checks it, or quitting
  // inside the pause before a results screen yanks you back into a hunt you
  // already walked away from.
  later(fn, ms) {
    const token = this.token;
    setTimeout(() => { if (this.token === token) fn(); }, ms);
  },

  /* ------------------------------- splash -------------------------------- */
  refreshSplash() {
    const last = GK.Profiles.lastProfile();
    const cont = this.el("btn-continue-as"), start = this.el("btn-start");
    if (last) {
      cont.style.display = "";
      cont.textContent = `🦖 Keep going as ${last.avatar} ${last.name}`;
      cont.onclick = () => { Sfx.init(); GK.Profiles.select(last); };
      start.className = "btn ghost";
      start.textContent = "👥 Switch Player";
    } else {
      cont.style.display = "none";
      start.className = "btn big green";
      start.textContent = "🥚 Start Hatching";
    }
  },

  play() {
    Sfx.init(); Sfx.click();
    GK.Profiles.renderList();
    this.showScreen("profiles");
  },

  /* --------------------------------- map --------------------------------- */
  showMap() {
    if (!this.profile) return this.play();
    const prog = Storage.getProgress(this.profile.id);
    const unlocked = Storage.unlockedLevel(prog);

    this.el("map-player").innerHTML = `${this.profile.avatar} <b>${GK.util.esc(this.profile.name)}</b>`;
    this.el("map-stars").textContent = `⭐ ${Storage.totalStars(prog)}`;

    const cont = this.el("btn-continue");
    cont.textContent = `▶️ ${LEVELS[unlocked].name}`;
    cont.onclick = () => this.openLevel(unlocked);

    const feast = this.el("btn-feast");
    if (Storage.feastUnlocked(prog)) {
      feast.style.display = "";
      feast.innerHTML = `🌋 Endless Feast <span class="sub">best ${(prog.feastBest || 0).toLocaleString()}</span>`;
    } else {
      feast.style.display = "none";
      this.el("feast-locked").textContent =
        `🌋 Finish ${WORLDS[0].name} to open the Endless Feast (${Storage.levelsWon(prog)}/${FEAST_UNLOCK})`;
    }
    this.el("feast-locked").style.display = Storage.feastUnlocked(prog) ? "none" : "";

    this.el("world-list").innerHTML = WORLDS.map((w, wi) => {
      const cells = levelsInWorld(wi).map((l) => {
        const done = prog.levels && prog.levels[l.idx];
        const open = l.idx <= unlocked;
        const stars = done ? done.stars : 0;
        return `<button class="hunt${open ? "" : " locked"}${l.idx === unlocked ? " next" : ""}"
          ${open ? `onclick="App.openLevel(${l.idx})"` : "disabled"}
          aria-label="${open ? `Hunt ${l.idx + 1}, ${GK.util.esc(l.name)}, ${stars} of 3 stars`
                             : `Hunt ${l.idx + 1}, locked`}">
          <span class="hunt-n">${open ? l.idx + 1 : "🔒"}</span>
          <span class="hunt-name">${open ? GK.util.esc(l.name) : "???"}</span>
          <span class="hunt-stars">${open ? "★".repeat(stars) + "☆".repeat(3 - stars) : ""}</span>
        </button>`;
      }).join("");
      const first = levelsInWorld(wi)[0];
      const seen = first.idx <= unlocked;
      return `<section class="world" style="--wc:${w.ground};--wc2:${w.rock}">
        <h3>${w.icon} ${seen ? GK.util.esc(w.name) : "???"}</h3>
        ${seen ? `<p class="world-blurb">${GK.util.esc(w.blurb)}</p>` : ""}
        <div class="hunt-grid">${cells}</div>
      </section>`;
    }).join("");

    this.showScreen("map");
  },

  // The briefing. It carries the one thing she needs to know for this hunt, and
  // it is skipped once she has beaten the level so a replay is a single tap.
  openLevel(idx) {
    Sfx.click();
    const prog = Storage.getProgress(this.profile.id);
    if (prog.levels && prog.levels[idx]) return this.startLevel(idx);
    const l = LEVELS[idx];
    this.el("brief-title").textContent = `${WORLDS[l.world].icon} ${l.name}`;
    this.el("brief-body").innerHTML =
      `<p class="brief-goal">Grow from <b>${STAGE_NAME[l.start]}</b> to <b>${STAGE_NAME[l.target]}</b>` +
      `${l.beast ? ` — then catch <b>${GK.util.esc(l.beast.name)}</b>` : ""}.</p>` +
      `<p class="brief-hint">${GK.util.esc(l.hint)}</p>`;
    this.el("btn-brief-go").onclick = () => { GK.UI.closeModal("modal-brief"); this.startLevel(idx); };
    GK.UI.openModal("modal-brief");
  },

  /* -------------------------------- playing ------------------------------ */
  begin(cfg) {
    this.showScreen("game");
    Render.resize();          // the game screen was display:none until just now
    Render.drained = 0;       // Game.start() empties the queue; stay in step
    Render.tick = 0;
    Render.resetJuice();
    Fx.reset();
    Render.clearInput?.();
    Game.start(cfg);
    Render.hud();
  },

  startLevel(idx, quiet) {
    if (!quiet) Sfx.click();
    this.begin({ mode: "campaign", level: LEVELS[idx], seed: (Date.now() ^ (idx * 2654435761)) >>> 0 });
  },

  startFeast(quiet) {
    if (!quiet) Sfx.click();
    this.begin({ mode: "feast", seed: Date.now() >>> 0 });
  },

  pause() {
    if (!Game.running || Game.paused) return;
    Game.paused = true;
    Render.clearInput?.();
    GK.UI.openModal("modal-pause");
  },

  resume() {
    Sfx.click();
    GK.UI.closeModal("modal-pause");
    Game.paused = false;
  },

  togglePause() { Game.paused ? this.resume() : this.pause(); },

  quit() {
    GK.UI.closeModal("modal-pause");
    Game.quit();              // emits `end` with reason "quit"; the loop drains it
  },

  showHelp() { Sfx.click(); GK.UI.openModal("modal-help"); },

  /* -------------------------------- results ------------------------------ */
  onEnd(res) {
    Render.clearInput?.();
    if (res.reason === "quit") { this.showMap(); return; }

    const prog = Storage.record(this.profile.id, res);
    this.later(() => this.showResults(res, prog), 780);
  },

  showResults(res, prog) {
    const feast = res.mode === "feast";
    const l = feast ? null : LEVELS[res.levelIdx];

    // Rex herself, in the mood the run ended in. The results screen used to
    // open on a platform emoji, which is the one place a small game most
    // obviously stops being its own thing.
    Render.resMood = res.win ? "happy" : feast ? "sleepy" : "sad";
    Render.resTier = Math.max(1, Math.min(7, res.tier));
    this.el("res-title").textContent = feast
      ? "The sun went down"
      : res.win ? `${STAGE_NAME[res.tier]}!` : "Have another go";
    // Three stars dropping in one after another, rather than three glyphs
    // that are simply already there. Same information, and it lands.
    this.el("res-stars").innerHTML = feast ? ""
      : [0, 1, 2].map((i) => `<i style="animation-delay:${(i * 0.22).toFixed(2)}s">${i < res.stars ? "★" : "☆"}</i>`).join("");
    this.countUp(this.el("res-score"), res.score, 620);

    this.el("res-stats").innerHTML = [
      `🍖 ate ${res.catches}`,
      `🦖 grew to ${STAGE_NAME[res.tier]}`,
      feast ? `🌋 wave ${res.wave + 1}` : `❤️ ${res.hearts} left`,
    ].map((b) => `<div>${b}</div>`).join("");

    const note = this.el("res-note");
    if (feast) {
      const best = prog.feastBest || 0;
      note.textContent = res.score >= best
        ? "A new family best! 🏆"
        : `Your best is ${best.toLocaleString()}. Eat early and keep eating — hunger never stops.`;
    } else if (res.win) {
      note.textContent = res.stars === 3 ? "Not a scratch on you. 🌟"
        : res.stars === 2 ? "One fright. Finish without a scratch for three stars."
        : "You made it! Keep out of trouble next time for more stars.";
    } else if (res.reason === "time") {
      note.textContent = "The light went before you were big enough. Eat the bigger ones — they fill you faster.";
    } else if (l && l.beast && !res.beastEaten && res.tier >= l.target) {
      note.textContent = `You were big enough — ${l.beast.name} just kept ahead of you. Stay after it until it puffs out.`;
    } else {
      note.textContent = "Something bigger got you three times. Watch for the red ring — that one can eat you.";
    }

    const retry = this.el("res-retry"), next = this.el("res-next");
    retry.style.display = "";
    retry.textContent = feast ? "↻ Feast Again" : res.win ? "↻ Hunt Again" : "↻ Try Again";
    retry.onclick = () => (feast ? this.startFeast() : this.startLevel(res.levelIdx));

    const nextIdx = feast ? -1 : res.levelIdx + 1;
    if (res.win && nextIdx >= 0 && nextIdx < LEVELS.length) {
      next.style.display = "";
      next.textContent = `▶️ ${LEVELS[nextIdx].name}`;
      next.onclick = () => this.startLevel(nextIdx);
    } else {
      next.style.display = "none";
    }
    this.el("res-finished").style.display =
      res.win && nextIdx >= LEVELS.length ? "" : "none";

    if (res.win && !feast) {
      Fx.confetti(window.innerWidth, window.innerHeight, ["#ffd45e", "#7fd08a", "#ff8a5c", "#8ad3ff"], 90);
      for (let i = 0; i < res.stars; i++) this.later(() => Sfx.star(i + 1), 420 + i * 260);
      if (nextIdx >= LEVELS.length) this.later(() => Sfx.finish(), 1300);
    }
    this.showScreen("results");
  },

  // A score that arrives at its number is worth more than a score that was
  // always sitting there. Skipped entirely under reduced motion.
  countUp(el, to, ms) {
    if (!Art.motion || to <= 0) { el.textContent = to.toLocaleString(); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString();
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  /* ------------------------------ Dino Book ------------------------------ */
  showBook(silent) {
    if (!silent) Sfx.click();
    const prog = Storage.getProgress(this.profile.id);
    const met = prog.met || {};
    this.el("book-count").textContent = `📖 ${Storage.metCount(prog)}/${SPECIES.length}`;

    this.el("book-list").innerHTML = SPECIES.map((sp) => {
      const known = !!met[sp.id];
      const size = isPlant(sp) ? "a plant — always safe to eat"
        : `size ${sp.tier + 1} of 7${sp.spiky ? " · armoured, never food" : ""}`;
      return `<div class="dino${known ? "" : " unknown"}">
        <canvas class="dino-art" data-sp="${sp.id}" aria-hidden="true"></canvas>
        <div class="dino-info">
          <div class="dino-name">${known ? GK.util.esc(sp.name) : "???"}</div>
          <div class="dino-size">${known ? size : "not met yet"}</div>
          ${known ? `<div class="dino-fact">${GK.util.esc(sp.fact)}</div>` : ""}
        </div>
      </div>`;
    }).join("");

    this.showScreen("book");
    // Paint after the screen is visible, or every card measures 0x0.
    requestAnimationFrame(() => {
      for (const c of document.querySelectorAll(".dino-art")) {
        const known = !c.closest(".dino").classList.contains("unknown");
        if (known) Render.paintCard(c, c.dataset.sp);
      }
    });
  },

  /* ----------------------------- leaderboard ----------------------------- */
  showLeaderboard(silent) {
    if (!silent) Sfx.click();
    GK.Profiles.renderLeaderboard("lb-rows", {
      cols: (r) => `<span class="lb-stat">⭐ ${Storage.totalStars(r.progress)}</span>
        <span class="lb-stat">📖 ${Storage.metCount(r.progress)}</span>
        <span class="lb-stat">🏆 ${(r.progress.feastBest || 0).toLocaleString()}</span>`,
      sort: (a, b) => (b.progress.feastBest || 0) - (a.progress.feastBest || 0)
        || Storage.totalStars(b.progress) - Storage.totalStars(a.progress),
      meId: this.profile?.id,
      empty: "No players yet — tap Play!",
    });
    this.showScreen("leaderboard");
  },
};

// Run init on DOMContentLoaded, not inline at the bottom of <body>: rendering
// the first screen before layout settles resolves viewport-relative clamp()
// font sizes against the inherited value on that one render.
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => App.init());
else App.init();
