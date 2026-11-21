// Main loop: fixed-timestep simulation, decoupled from rendering.
(function () {
  "use strict";

  const { W, H } = SI.world;
  const STEP = 1 / 30;               // sim step, in sim-seconds
  const GAME_MIN_PER_SIM_SEC = 1;    // 1 sim-second = 1 in-game minute
  const TIDE_PERIOD_MIN = 12.42 * 60; // semidiurnal tide

  // ---- Seed ----
  const params = new URLSearchParams(location.search);
  let seed = parseInt(params.get("seed"), 10);
  if (!Number.isFinite(seed)) seed = Math.floor(Math.random() * 1e9);

  const rootRng = new SI.RNG(seed);
  const world = SI.world.generate(rootRng);
  const survivor = new SI.Survivor(world, rootRng);
  const sprites = SI.sprites.buildSurvivorSprites();

  const state = {
    minutes: 9 * 60, // Day 1, 09:00
    tidePhase: rootRng.fork("tide").range(0, Math.PI * 2),
    speed: 1,
    paused: true,
    lastDay: 1,
    wasNight: false,
  };

  // ---- Canvas ----
  const canvas = document.getElementById("game");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const stage = document.getElementById("stage");

  function fit() {
    const r = stage.getBoundingClientRect();
    let s = Math.min(r.width / W, r.height / H);
    if (s >= 1) s = Math.floor(s);
    canvas.style.width = Math.floor(W * s) + "px";
    canvas.style.height = Math.floor(H * s) + "px";
  }
  window.addEventListener("resize", fit);
  fit();

  // ---- Time helpers ----
  const day = () => Math.floor(state.minutes / 1440) + 1;
  const hourOfDay = () => (state.minutes % 1440) / 60;
  const clockStr = () => {
    const m = Math.floor(state.minutes % 1440);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  };
  // 0 = full night, 1 = full day.
  function daylight(h) {
    if (h < 5.5 || h >= 21) return 0;
    if (h < 7.5) return (h - 5.5) / 2;
    if (h < 19) return 1;
    return 1 - (h - 19) / 2;
  }
  const isNight = () => daylight(hourOfDay()) < 0.35;
  const tideOffset = () => 3 * Math.sin((state.minutes / TIDE_PERIOD_MIN) * Math.PI * 2 + state.tidePhase);

  // ---- Simulation ----
  function tick(dt) {
    state.minutes += dt * GAME_MIN_PER_SIM_SEC;
    survivor.update(dt, isNight());

    const night = isNight();
    if (night !== state.wasNight) {
      log(night ? "Darkness falls. The temperature drops." : "First light over the water.");
      state.wasNight = night;
    }
    if (day() !== state.lastDay) {
      state.lastDay = day();
      log(`Day ${state.lastDay} begins.`);
    }
  }

  // ---- Rendering ----
  const sparkles = [];
  function render(t) {
    ctx.drawImage(world.terrain, 0, 0);

    // Water edge: tide + two travelling waves per column.
    const tide = tideOffset();
    ctx.fillStyle = "#3584ad";
    for (let x = 0; x < W; x++) {
      const base = world.shore[x];
      const wave = 1.6 * Math.sin(t * 1.3 + x * 0.045) + 0.9 * Math.sin(t * 2.3 - x * 0.12);
      const top = Math.round(base + 2 + tide + wave);
      const bottom = base + 8;
      if (top < bottom) ctx.fillRect(x, top, 1, bottom - top);
    }
    ctx.fillStyle = "#d8eef2";
    for (let x = 0; x < W; x++) {
      const base = world.shore[x];
      const wave = 1.6 * Math.sin(t * 1.3 + x * 0.045) + 0.9 * Math.sin(t * 2.3 - x * 0.12);
      const top = Math.round(base + 2 + tide + wave);
      ctx.fillRect(x, top, 1, 1);
      if (Math.sin(t * 0.7 + x * 0.31) > 0.6) ctx.fillRect(x, top + 1, 1, 1);
    }

    // Sparkles on open water (visual only; not part of the sim).
    if (sparkles.length < 14 && Math.random() < 0.3) {
      const x = Math.floor(Math.random() * W);
      const y0 = world.shore[x] + 14;
      sparkles.push({ x, y: y0 + Math.floor(Math.random() * (H - y0)), life: 0.4 + Math.random() * 0.8 });
    }
    ctx.fillStyle = "#9fd0e8";
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life -= 1 / 60;
      if (s.life <= 0) { sparkles.splice(i, 1); continue; }
      ctx.fillRect(s.x, s.y, 2, 1);
    }

    // Y-sorted: trees and the survivor.
    const sx = Math.round(survivor.x), sy = Math.round(survivor.y);
    const sprite = sprites[survivor.facing][survivor.frame];
    let drawn = false;
    const drawSurvivor = () => {
      SI.world.pixelEllipse(ctx, sx, sy, 3, 1, "rgba(0,0,0,0.3)");
      ctx.drawImage(sprite, sx - 8, sy - 15);
      drawn = true;
    };
    for (const tr of world.trees) {
      if (!drawn && tr.y > sy) drawSurvivor();
      const tx = tr.x - (tr.sprite.width >> 1), ty = tr.y - tr.sprite.height + 1;
      // If this tree stands in front of the survivor, fade it so they stay visible.
      const covers = drawn && sx > tx - 4 && sx < tx + tr.sprite.width + 4 && sy - 8 > ty && sy - 8 < tr.y;
      if (covers) ctx.globalAlpha = 0.55;
      ctx.drawImage(tr.sprite, tx, ty);
      if (covers) ctx.globalAlpha = 1;
    }
    if (!drawn) drawSurvivor();

    // Day / night lighting.
    const h = hourOfDay();
    const light = daylight(h);
    if (light < 1) {
      ctx.fillStyle = `rgba(8,14,40,${(1 - light) * 0.62})`;
      ctx.fillRect(0, 0, W, H);
    }
    const dusk = Math.max(0, 1 - Math.abs(h - 19.8) / 1.2) + Math.max(0, 1 - Math.abs(h - 6.4) / 1.0);
    if (dusk > 0) {
      ctx.fillStyle = `rgba(255,120,50,${dusk * 0.14})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- UI ----
  const el = (id) => document.getElementById(id);
  const ui = {
    day: el("ui-day"), time: el("ui-time"), activity: el("ui-activity"),
    seed: el("ui-seed"), log: el("log"), daysLived: el("ui-days"),
  };
  ui.seed.textContent = seed;

  function log(msg) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="log-time">D${day()} ${clockStr()}</span> ${msg}`;
    ui.log.prepend(li);
    while (ui.log.children.length > 40) ui.log.lastChild.remove();
  }

  function updateUI() {
    ui.day.textContent = "Day " + day();
    ui.time.textContent = clockStr();
    ui.activity.textContent = state.paused && !introDone ? "Waiting to be dropped off" : survivor.activity;
    ui.daysLived.textContent = (state.minutes / 1440 - 9 / 24).toFixed(2);
  }

  document.querySelectorAll("[data-speed]").forEach((b) => {
    b.addEventListener("click", () => {
      if (!introDone) return;
      const v = b.dataset.speed;
      if (v === "pause") state.paused = !state.paused;
      else { state.speed = Number(v); state.paused = false; }
      document.querySelectorAll("[data-speed]").forEach((o) => {
        const active = o.dataset.speed === "pause" ? state.paused : !state.paused && Number(o.dataset.speed) === state.speed;
        o.classList.toggle("active", active);
      });
    });
  });

  el("new-world").addEventListener("click", () => {
    const u = new URL(location.href);
    u.searchParams.set("seed", Math.floor(Math.random() * 1e9));
    location.href = u.toString();
  });

  // ---- Intro dialog with a typewriter effect ----
  let introDone = false;
  const intro = el("intro");
  const introText = el("intro-text");
  const fullText = introText.textContent
    .split("\n").map((s) => s.trim()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
  introText.textContent = "";
  let typed = 0, typing = true;
  const typer = setInterval(() => {
    typed += 2;
    introText.textContent = fullText.slice(0, typed);
    if (typed >= fullText.length) { clearInterval(typer); typing = false; }
  }, 18);
  intro.addEventListener("click", (e) => {
    if (typing && e.target.id !== "begin") {
      clearInterval(typer); typing = false; introText.textContent = fullText;
    }
  });
  el("begin").addEventListener("click", () => {
    clearInterval(typer);
    intro.classList.add("hidden");
    introDone = true;
    state.paused = false;
    document.querySelector('[data-speed="1"]').classList.add("active");
    log("Dropped off on the beach. The boat is gone.");
  });

  // ---- Main loop ----
  let last = performance.now(), acc = 0, uiTimer = 0;
  function frame(now) {
    const realDt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      acc += realDt * state.speed;
      let n = 0;
      while (acc >= STEP && n < 600) { tick(STEP); acc -= STEP; n++; }
      if (n >= 600) acc = 0;
    }
    render(now / 1000);
    uiTimer -= realDt;
    if (uiTimer <= 0) { updateUI(); uiTimer = 0.2; }
    requestAnimationFrame(frame);
  }
  updateUI();
  requestAnimationFrame(frame);

  // Expose for debugging in the console.
  SI.game = { state, world, survivor };
})();
