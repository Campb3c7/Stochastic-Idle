// Main loop: fixed-timestep simulation, decoupled from rendering.
(function () {
  "use strict";

  let VW = 384, VH = 216;                 // viewport in world pixels (resized to fill the stage)
  const STEP = 0.25;                      // sim step, game seconds
  const GAME_SEC_PER_REAL_SEC = 5;        // at 1x
  const TIDE_PERIOD = 12.42 * 3600;       // semidiurnal tide, game seconds
  const DAY = 86400;

  // ---- Seed & world ----
  const params = new URLSearchParams(location.search);
  let seed = parseInt(params.get("seed"), 10);
  if (!Number.isFinite(seed)) seed = Math.floor(Math.random() * 1e9);

  const rootRng = new SI.RNG(seed);
  const world = SI.world.generate(rootRng);
  const survivor = new SI.Survivor(world, rootRng);
  const sprites = SI.sprites.buildSurvivorSprites();
  const envRng = rootRng.fork("weather");

  const state = {
    t: 9 * 3600,               // game seconds since Day 1 00:00
    speed: 1,
    paused: true,
    lastDay: 1,
    wasDark: false,
    tidePhase: envRng.range(0, Math.PI * 2),
    tempAnomaly: envRng.normal(0, 1.5),
  };
  const env = { temp: 12, light: 1, hour: 9 };

  // ---- Canvas & camera ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");

  // Pick a whole-number pixel scale (~216 world px tall), then size the
  // viewport so the canvas fills the stage with no black bars.
  function fit() {
    const r = stage.getBoundingClientRect();
    const s = Math.max(1, Math.round(r.height / 216));
    VW = Math.min(world.W, Math.ceil(r.width / s));
    VH = Math.min(world.H, Math.ceil(r.height / s));
    canvas.width = VW; canvas.height = VH;
    canvas.style.width = VW * s + "px";
    canvas.style.height = VH * s + "px";
    ctx.imageSmoothingEnabled = false;
  }
  fit();
  const cam = { x: survivor.x - VW / 2, y: survivor.y - VH / 2 };
  window.addEventListener("resize", fit);

  // ---- Time & environment ----
  const day = () => Math.floor(state.t / DAY) + 1;
  const hourOfDay = () => (state.t % DAY) / 3600;
  const clockStr = () => {
    const m = Math.floor((state.t % DAY) / 60);
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  };
  function daylight(h) {
    if (h < 5.5 || h >= 21) return 0;
    if (h < 7.5) return (h - 5.5) / 2;
    if (h < 19) return 1;
    return 1 - (h - 19) / 2;
  }
  const tideOffset = () => 2.5 * Math.sin((state.t / TIDE_PERIOD) * Math.PI * 2 + state.tidePhase);

  // Air temperature: daily cycle + a slowly warming spring + a random
  // Ornstein-Uhlenbeck anomaly (weather that drifts and reverts to normal).
  const OU_TAU = 8 * 3600, OU_SD = 2;
  const OU_SIGMA = OU_SD * Math.sqrt(2 / OU_TAU);
  function updateEnv(dt) {
    state.tempAnomaly += (-state.tempAnomaly / OU_TAU) * dt + OU_SIGMA * Math.sqrt(dt) * envRng.normal();
    const h = hourOfDay();
    const days = state.t / DAY;
    env.hour = h;
    env.light = daylight(h);
    env.temp = 11 + 0.12 * days + 5 * Math.cos(((h - 15) / 24) * Math.PI * 2) + state.tempAnomaly;
  }

  // ---- Simulation ----
  survivor.onEvent = (msg) => log(msg);
  function tick(dt) {
    state.t += dt;
    updateEnv(dt);
    survivor.update(dt, env);

    const dark = env.light < 0.35;
    if (dark !== state.wasDark) {
      log(dark ? "Darkness falls." : "First light over the water.");
      state.wasDark = dark;
    }
    if (day() !== state.lastDay) {
      state.lastDay = day();
      survivor.body.newDay();
      log(`Day ${state.lastDay} begins.`);
    }
  }

  // ---- Rendering ----
  const sparkles = [];
  function render(t, realDt) {
    // Camera eases toward the survivor, clamped to the world.
    const tx = survivor.x - VW / 2, ty = survivor.y - VH / 2 - 4;
    const k = Math.min(1, realDt * 5);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.x = Math.max(0, Math.min(world.W - VW, cam.x));
    cam.y = Math.max(0, Math.min(world.H - VH, cam.y));
    const cx = Math.round(cam.x), cy = Math.round(cam.y);

    ctx.drawImage(world.terrain, cx, cy, VW, VH, 0, 0, VW, VH);

    // Shoreline: tide + travelling waves, one row at a time.
    const tide = tideOffset();
    for (let sy = 0; sy < VH; sy++) {
      const wy = cy + sy;
      const base = world.shore[wy] - cx;
      if (base < -10 || base > VW + 10) continue;
      const wave = 1.5 * Math.sin(t * 1.2 + wy * 0.045) + 0.8 * Math.sin(t * 2.1 - wy * 0.11);
      const edge = Math.round(base + 1.5 + tide + wave);
      ctx.fillStyle = "#3b82b0";
      ctx.fillRect(base - 5, sy, edge - (base - 5), 1);
      ctx.fillStyle = "#e3f1f2";
      ctx.fillRect(edge, sy, 1, 1);
    }

    // Sparkles on open water (cosmetic only).
    if (sparkles.length < 10 && Math.random() < 0.25) {
      const wy = cy + Math.floor(Math.random() * VH);
      const maxX = world.shore[wy] - 14;
      if (maxX > cx) sparkles.push({ x: Math.floor(Math.random() * maxX), y: wy, life: 0.4 + Math.random() * 0.8 });
    }
    ctx.fillStyle = "#8cc3e0";
    for (let i = sparkles.length - 1; i >= 0; i--) {
      const s = sparkles[i];
      s.life -= realDt;
      if (s.life <= 0) { sparkles.splice(i, 1); continue; }
      ctx.fillRect(s.x - cx, s.y - cy, 1, 2);
    }

    // Y-sorted trees + survivor.
    const px = Math.round(survivor.x) - cx, py = Math.round(survivor.y) - cy;
    const sleeping = survivor.state === "sleep";
    const sprite = sleeping ? sprites.sleep : sprites[survivor.facing][survivor.frame];
    let drawn = false;
    const drawSurvivor = () => {
      SI.world.pixelEllipse(ctx, px, py, sleeping ? 6 : 3, 1, "rgba(0,0,0,0.25)");
      ctx.drawImage(sprite, px - 8, py - 15);
      if (sleeping) {
        const z = Math.floor(t * 1.5) % 3;
        ctx.fillStyle = "#e6e1cf";
        ctx.fillRect(px + 2 + z * 2, py - 9 - z * 3, 2, 1);
      }
      drawn = true;
    };
    for (const tr of world.trees) {
      const w = tr.sprite.width, h = tr.sprite.height;
      const sx = tr.x - (w >> 1) - cx, sy = tr.y - h + 1 - cy;
      if (sx > VW || sx + w < 0 || sy > VH || sy + h < 0) {
        if (!drawn && tr.y - cy > py) drawSurvivor();
        continue;
      }
      if (!drawn && tr.y - cy > py) drawSurvivor();
      // A tree in front of the survivor fades so they stay visible.
      const covers = drawn && px + 6 > sx && px - 6 < sx + w && py - 2 > sy && py - 14 < sy + h;
      if (covers) ctx.globalAlpha = 0.5;
      ctx.drawImage(tr.sprite, sx, sy);
      if (covers) ctx.globalAlpha = 1;
    }
    if (!drawn) drawSurvivor();

    // Lighting.
    const h = hourOfDay();
    if (env.light < 1) {
      ctx.fillStyle = `rgba(8,14,40,${(1 - env.light) * 0.6})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    const dusk = Math.max(0, 1 - Math.abs(h - 19.8) / 1.2) + Math.max(0, 1 - Math.abs(h - 6.4) / 1.0);
    if (dusk > 0) {
      ctx.fillStyle = `rgba(255,130,60,${dusk * 0.12})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  }

  // ---- Map (player-only knowledge) ----
  const MAP_SCALE = 4;
  const mapCanvas = document.getElementById("map");
  mapCanvas.width = world.W / MAP_SCALE; mapCanvas.height = world.H / MAP_SCALE;
  const mctx = mapCanvas.getContext("2d");
  const mapBase = document.createElement("canvas");
  mapBase.width = mapCanvas.width; mapBase.height = mapCanvas.height;
  {
    const b = mapBase.getContext("2d");
    b.imageSmoothingEnabled = true;
    b.drawImage(world.terrain, 0, 0, mapBase.width, mapBase.height);
    b.fillStyle = "#3d6e2a";
    for (const tr of world.trees) {
      b.beginPath();
      b.arc(tr.x / MAP_SCALE, (tr.y - tr.canopyR) / MAP_SCALE, tr.canopyR / MAP_SCALE + 0.6, 0, Math.PI * 2);
      b.fill();
    }
  }
  const mapOverlay = document.getElementById("map-overlay");
  function drawMap() {
    mctx.drawImage(mapBase, 0, 0);
    mctx.strokeStyle = "rgba(255,255,255,0.7)";
    mctx.lineWidth = 1;
    mctx.strokeRect(Math.round(cam.x / MAP_SCALE) + 0.5, Math.round(cam.y / MAP_SCALE) + 0.5, VW / MAP_SCALE, VH / MAP_SCALE);
    mctx.fillStyle = "#7fe3ff";
    for (const w of survivor.knownWater) {
      mctx.fillRect(Math.round(w.x / MAP_SCALE) - 1, Math.round(w.y / MAP_SCALE) - 1, 3, 3);
    }
    const sx = Math.round(survivor.x / MAP_SCALE), sy = Math.round(survivor.y / MAP_SCALE);
    mctx.fillStyle = "#fff";
    mctx.fillRect(sx - 2, sy - 2, 5, 5);
    mctx.fillStyle = "#e04a3a";
    mctx.fillRect(sx - 1, sy - 1, 3, 3);
  }
  function toggleMap(show) {
    const open = show ?? mapOverlay.classList.contains("hidden");
    mapOverlay.classList.toggle("hidden", !open);
    if (open) drawMap();
  }
  document.getElementById("map-btn").addEventListener("click", () => toggleMap());
  document.getElementById("map-close").addEventListener("click", () => toggleMap(false));

  // ---- UI ----
  const $ = (id) => document.getElementById(id);
  $("ui-seed").textContent = seed;
  const fmt = (v, d = 1) => v.toFixed(d);
  const pct = (v) => Math.round(v * 100) + "%";
  const signed = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);

  function log(msg) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="log-time">D${day()} ${clockStr()}</span> ${msg}`;
    $("log").prepend(li);
    while ($("log").children.length > 60) $("log").lastChild.remove();
  }

  function setBar(id, v) {
    $(id).style.width = Math.round(Math.max(0, Math.min(1, v)) * 100) + "%";
    $(id + "-v").textContent = pct(v);
  }

  function updateUI() {
    const b = survivor.body;
    $("ui-day").textContent = "Day " + day();
    $("ui-time").textContent = clockStr();
    $("ui-activity").textContent = !introDone ? "Waiting to be dropped off" : survivor.activity;
    $("ui-days").textContent = fmt((state.t - 9 * 3600) / DAY, 2);

    setBar("bar-hunger", b.hunger);
    setBar("bar-thirst", b.thirst);
    setBar("bar-fatigue", b.fatigue);

    $("st-weight").textContent = `${fmt(b.weight)} kg (${signed(b.weight - b.start.weight)})`;
    $("st-fat").textContent = `${fmt(b.bodyFatPct)}% · ${fmt(b.fat, 2)} kg`;
    $("st-lean").textContent = `${fmt(b.leanMass)} kg`;
    $("st-muscle").textContent = `${fmt(b.muscle)} kg`;
    $("st-glyc").textContent = `${Math.round(b.glycogen * 1000)} g · ${pct(b.glycogenFrac)}`;
    $("st-water").textContent = `${fmt(b.water)} L`;
    $("st-hydration").textContent = `${fmt(100 - b.dehydrationPct)}%`;

    $("st-bmr").textContent = `${Math.round(b.bmr)} kcal/day`;
    $("st-rate").textContent = `${Math.round(b.kcalPerHour)} kcal/h` + (b.coldPerHour > 1 ? ` (${Math.round(b.coldPerHour)} cold)` : "");
    $("st-burned").textContent = `${Math.round(b.kcalToday)} kcal`;
    $("st-eaten").textContent = `${Math.round(b.eatenToday)} kcal`;
    $("st-drank").textContent = `${fmt(b.drankToday)} L`;
    $("st-mix").textContent = `${pct(b.mix.glyc)} / ${pct(b.mix.fat)} / ${pct(b.mix.prot)}`;
    $("st-keto").textContent = pct(b.keto);

    $("ui-temp").textContent = `${fmt(env.temp)} °C`;
    const tideNow = tideOffset();
    const tideRising = Math.cos((state.t / TIDE_PERIOD) * Math.PI * 2 + state.tidePhase) > 0;
    $("ui-tide").textContent = (tideNow > 0 ? "High" : "Low") + (tideRising ? ", rising" : ", falling");
    $("ui-known").textContent = survivor.knownWater.length ? "Creek" : "None";

    if (!mapOverlay.classList.contains("hidden")) drawMap();
  }

  function setSpeedButtons() {
    document.querySelectorAll("[data-speed]").forEach((o) => {
      const active = o.dataset.speed === "pause" ? state.paused : !state.paused && Number(o.dataset.speed) === state.speed;
      o.classList.toggle("active", active);
    });
  }
  document.querySelectorAll("[data-speed]").forEach((b) => {
    b.addEventListener("click", () => {
      if (!introDone) return;
      const v = b.dataset.speed;
      if (v === "pause") state.paused = !state.paused;
      else { state.speed = Number(v); state.paused = false; }
      setSpeedButtons();
    });
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "m" || e.key === "M") toggleMap();
    else if (e.key === "Escape") toggleMap(false);
    else if (e.key === " " && introDone) { state.paused = !state.paused; setSpeedButtons(); e.preventDefault(); }
  });

  $("new-world").addEventListener("click", () => {
    const u = new URL(location.href);
    u.searchParams.set("seed", Math.floor(Math.random() * 1e9));
    location.href = u.toString();
  });

  // ---- Intro dialog ----
  let introDone = false;
  const intro = $("intro"), introText = $("intro-text");
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
    if (typing && e.target.id !== "begin") { clearInterval(typer); typing = false; introText.textContent = fullText; }
  });
  $("begin").addEventListener("click", () => {
    clearInterval(typer);
    intro.classList.add("hidden");
    introDone = true;
    state.paused = false;
    setSpeedButtons();
    log("Dropped off on the beach. Early spring, mild weather.");
  });

  // ---- Main loop ----
  updateEnv(0);
  let last = performance.now(), acc = 0, uiTimer = 0;
  function frame(now) {
    const realDt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      acc += realDt * state.speed * GAME_SEC_PER_REAL_SEC;
      let n = 0;
      while (acc >= STEP && n < 3000) { tick(STEP); acc -= STEP; n++; }
      if (n >= 3000) acc = 0;
    }
    render(now / 1000, realDt);
    uiTimer -= realDt;
    if (uiTimer <= 0) { updateUI(); uiTimer = 0.2; }
    requestAnimationFrame(frame);
  }
  updateUI();
  requestAnimationFrame(frame);

  SI.game = { state, env, world, survivor, cam, tick };
})();
