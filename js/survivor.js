// The survivor: a body plus simple needs-driven behaviour.
// They know nothing about the map except what they've seen with their own eyes.
(function () {
  "use strict";

  const { T, walkable, terrainAt, PX_PER_M } = SI.world;
  const STEER = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2];

  class Survivor {
    constructor(world, rng) {
      this.rng = rng.fork("survivor");
      this.world = world;
      this.onEvent = () => {};

      // Dropped off on the beach.
      for (let i = 0; i < 400 && this.x === undefined; i++) {
        const y = this.rng.int(Math.floor(world.H * 0.3), Math.floor(world.H * 0.7));
        const x = this.rng.int(world.shore[y] + 16, world.sandEdge[y] - 8);
        if (walkable(world, x, y) && terrainAt(world, x, y) !== T.CREEK) { this.x = x; this.y = y; }
      }

      // Starting profile: a poorly prepared beginner.
      this.body = new SI.Body({
        age: 29, heightCm: 178, weight: 71, bodyFat: 0.11,
        metabolismMult: 1.08, glycogenMax: 0.42, glycogenStart: 0.85,
      });
      this.walkSpeed = 0.95;          // m/s
      this.sightDay = 20 * PX_PER_M;  // how far they can spot things
      this.sightNight = 5 * PX_PER_M;

      this.knownWater = [];
      this.facing = "right";
      this.state = "idle";
      this.timer = 15;
      this.target = null;
      this.goal = null;
      this.animTime = 0;
      this.frame = 0;
      this.perceiveTimer = 0;
      this.activity = "Getting their bearings";
    }

    rest(meanSeconds, label) {
      this.state = "idle";
      this.target = null;
      this.goal = null;
      this.timer = 3 + this.rng.exponential(meanSeconds);
      this.frame = 0;
      this.activity = label || (this.rng.chance(0.5) ? "Standing around" : "Looking around");
    }

    goTo(target, goal, label) {
      this.target = target;
      this.goal = goal;
      this.state = "walk";
      this.activity = label;
    }

    wander(far, label) {
      const { rng } = this;
      for (let tries = 0; tries < 16; tries++) {
        const ang = rng.range(0, Math.PI * 2);
        const dist = far ? rng.range(150, 400) : rng.range(40, 240);
        const tx = this.x + Math.cos(ang) * dist, ty = this.y + Math.sin(ang) * dist;
        if (walkable(this.world, tx, ty)) { this.goTo({ x: tx, y: ty }, far ? "explore" : "wander", label); return; }
      }
      this.rest(10);
    }

    nearestKnownWater() {
      let best = null, bd = Infinity;
      for (const w of this.knownWater) {
        const d = Math.hypot(w.x - this.x, w.y - this.y);
        if (d < bd) { bd = d; best = w; }
      }
      return best;
    }

    // Look around: remember any fresh water within sight.
    perceive(env) {
      const r = env.light > 0.4 ? this.sightDay : this.sightNight;
      const pts = this.world.creek;
      let saw = null;
      for (let i = 0; i < pts.length; i += 2) {
        const p = pts[i];
        const dx = p.x - this.x, dy = p.y - this.y;
        if (dx * dx + dy * dy > r * r) continue;
        if (!saw || dx * dx + dy * dy < (saw.x - this.x) ** 2 + (saw.y - this.y) ** 2) saw = p;
        if (!this.knownWater.some((w) => Math.hypot(w.x - p.x, w.y - p.y) < 60)) {
          if (this.knownWater.length === 0) this.onEvent("Spotted fresh water: a creek.");
          this.knownWater.push({ x: p.x, y: p.y });
        }
      }
      if (saw && this.state === "walk" && this.goal === "explore" && this.body.thirst > 0.25) {
        this.goTo({ x: saw.x, y: saw.y }, "water", "Heading to the creek");
      }
    }

    // Two-process sleep model: homeostatic pressure (builds while awake)
    // plus a circadian rhythm that peaks around 3 am.
    sleepiness(env) {
      return this.body.sleepPressure + 0.3 * Math.cos(((env.hour - 3) / 24) * Math.PI * 2);
    }

    decide(env) {
      const b = this.body;
      const sleepy = this.sleepiness(env);
      if (sleepy > 0.9 || (env.light < 0.25 && sleepy > 0.5)) {
        this.state = "sleep";
        this.activity = "Sleeping on the ground";
        this.onEvent("Lay down to sleep in the open.");
        return;
      }
      if (b.thirst > 0.25) {
        const w = this.nearestKnownWater();
        if (w) this.goTo({ x: w.x, y: w.y }, "water", "Heading to the creek");
        else this.wander(true, "Searching for water");
        return;
      }
      if (env.light < 0.25) { this.rest(600, "Sitting in the dark"); return; }
      if (this.rng.chance(0.6)) this.wander(false, "Wandering");
      else this.rest(25);
    }

    update(dt, env) {
      const b = this.body;
      this.perceiveTimer -= dt;
      if (this.perceiveTimer <= 0) { this.perceiveTimer = 2; this.perceive(env); }

      if (this.state === "sleep") {
        b.update(dt, "sleep", env);
        if ((env.light > 0.3 && this.sleepiness(env) < 0.1) || b.thirst > 0.85) {
          this.onEvent("Woke up.");
          this.facing = "down";
          this.rest(30, "Waking up slowly");
        }
        return;
      }

      if (this.state === "drink") {
        b.drink(0.02 * dt); // ~1.2 L per minute
        b.update(dt, "drink", env);
        this.drunk += 0.02 * dt;
        if (b.waterDeficit <= 0) {
          this.onEvent(`Drank ${this.drunk.toFixed(1)} L from the creek.`);
          this.rest(20);
        }
        return;
      }

      if (this.state === "idle") {
        b.update(dt, "idle", env);
        this.timer -= dt;
        if (this.rng.chance(dt * 0.05)) this.facing = this.rng.pick(["down", "up", "left", "right"]);
        if (this.timer <= 0 || (b.thirst > 0.25 && this.activity !== "Sitting in the dark")) this.decide(env);
        return;
      }

      // --- Walking ---
      const inCreek = terrainAt(this.world, this.x, this.y) === T.CREEK;
      b.update(dt, inCreek ? "wade" : "walk", env);
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      const speed = this.walkSpeed * PX_PER_M * (inCreek ? 0.5 : 1) * (env.light < 0.3 ? 0.6 : 1);
      const step = speed * dt;

      if (this.goal === "water" && (inCreek || dist < 4)) {
        this.state = "drink";
        this.drunk = 0;
        this.facing = "down";
        this.frame = 0;
        this.activity = "Drinking from the creek";
        return;
      }
      if (dist <= step) {
        this.x = this.target.x; this.y = this.target.y;
        this.rest(25);
        return;
      }
      const a = Math.atan2(dy, dx);
      let moved = false;
      for (const off of STEER) {
        const ca = Math.cos(a + off), sa = Math.sin(a + off);
        const nx = this.x + ca * step, ny = this.y + sa * step;
        if (walkable(this.world, nx, ny)) {
          this.x = nx; this.y = ny;
          this.facing = Math.abs(ca) > Math.abs(sa) ? (ca > 0 ? "right" : "left") : (sa > 0 ? "down" : "up");
          moved = true;
          break;
        }
      }
      if (!moved) { this.rest(5); return; }
      this.animTime += dt;
      this.frame = Math.floor(this.animTime * 1.6) % 4;
    }
  }

  window.SI = window.SI || {};
  SI.Survivor = Survivor;
})();
