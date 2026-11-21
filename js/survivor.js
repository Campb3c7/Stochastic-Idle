// The survivor. For now they only wander: a simple stochastic process of
// idle periods (exponentially distributed) and walks to random nearby points.
(function () {
  "use strict";

  class Survivor {
    constructor(world, rng) {
      this.rng = rng.fork("survivor");
      this.world = world;
      // Start on the beach, somewhere between the tree line and the water.
      const W = world.W;
      for (let i = 0; i < 200; i++) {
        const x = this.rng.int(Math.floor(W * 0.3), Math.floor(W * 0.7));
        const y = this.rng.int(world.forest[x] + 10, world.shore[x] - 12);
        if (SI.world.walkable(world, x, y)) { this.x = x; this.y = y; break; }
      }
      if (this.x === undefined) { this.x = W / 2; this.y = world.shore[W / 2] - 14; }

      this.speed = 11;          // px per sim-second (bad starting stats: slow)
      this.facing = "down";
      this.state = "idle";
      this.timer = 2.5;
      this.target = null;
      this.animTime = 0;
      this.frame = 0;
      this.activity = "Getting their bearings";
    }

    idle(meanSeconds) {
      this.state = "idle";
      this.target = null;
      this.timer = 0.5 + this.rng.exponential(meanSeconds);
      this.frame = 0;
      this.activity = this.rng.chance(0.5) ? "Standing around" : "Looking around";
    }

    pickTarget() {
      const { world, rng } = this;
      for (let tries = 0; tries < 14; tries++) {
        const ang = rng.range(0, Math.PI * 2);
        const dist = rng.range(12, 70);
        const tx = this.x + Math.cos(ang) * dist;
        const ty = this.y + Math.sin(ang) * dist * 0.8;
        if (this.pathClear(tx, ty)) return { x: tx, y: ty };
      }
      return null;
    }

    pathClear(tx, ty) {
      const dx = tx - this.x, dy = ty - this.y;
      const steps = Math.ceil(Math.hypot(dx, dy) / 2);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        if (!SI.world.walkable(this.world, this.x + dx * t, this.y + dy * t)) return false;
      }
      return true;
    }

    update(dt, isNight) {
      if (this.state === "idle") {
        this.timer -= dt;
        // Occasionally glance in a new direction while standing still.
        if (this.rng.chance(dt * 0.25)) {
          this.facing = this.rng.pick(["down", "up", "left", "right"]);
        }
        if (this.timer <= 0) {
          const t = this.pickTarget();
          if (t) {
            this.target = t;
            this.state = "walk";
            this.activity = isNight ? "Wandering in the dark" : "Wandering";
          } else {
            this.idle(2);
          }
        }
        return;
      }

      // Walking
      const dx = this.target.x - this.x, dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);
      const step = this.speed * (isNight ? 0.75 : 1) * dt;
      if (dist <= step) {
        this.x = this.target.x; this.y = this.target.y;
        this.idle(isNight ? 6 : 3.5);
        return;
      }
      const nx = this.x + (dx / dist) * step, ny = this.y + (dy / dist) * step;
      if (!SI.world.walkable(this.world, nx, ny)) { this.idle(2); return; }
      this.x = nx; this.y = ny;
      this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      this.animTime += dt;
      this.frame = Math.floor(this.animTime * 6) % 4;
    }
  }

  window.SI = window.SI || {};
  SI.Survivor = Survivor;
})();
