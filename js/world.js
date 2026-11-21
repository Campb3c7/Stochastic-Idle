// World generation: coastline, beach, forest, trees and static decor.
// The terrain is baked once into an offscreen canvas so each frame is cheap.
(function () {
  "use strict";

  const W = 384, H = 216;

  function hexToRgb(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  }

  const C = {
    deep: hexToRgb("#1b4a74"),
    mid: hexToRgb("#24628f"),
    shallow: hexToRgb("#3584ad"),
    wet: hexToRgb("#a98f62"),
    wet2: hexToRgb("#9c8358"),
    sand: hexToRgb("#d9c08a"),
    sand2: hexToRgb("#cfb57e"),
    sand3: hexToRgb("#e4d09d"),
    grass: hexToRgb("#4b7536"),
    grass2: hexToRgb("#426a30"),
    grass3: hexToRgb("#56823e"),
    floor: hexToRgb("#365728"),
    floor2: hexToRgb("#2f4d23"),
    needles: hexToRgb("#5a4a2c"),
  };

  // Smooth 1D value noise in [-1, 1].
  function noise1D(rng, spacing) {
    const n = Math.ceil(W / spacing) + 3;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(rng.float() * 2 - 1);
    return (x) => {
      const f = x / spacing, i = Math.floor(f), t = f - i;
      const s = t * t * (3 - 2 * t);
      return pts[i] * (1 - s) + pts[i + 1] * s;
    };
  }

  function pixelEllipse(ctx, cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    for (let dy = -ry; dy <= ry; dy++) {
      const e = dy / (ry + 0.5);
      const half = Math.round(rx * Math.sqrt(1 - e * e));
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
    }
  }

  function generate(rootRng) {
    const rng = rootRng.fork("world");
    const seed = rng.int(0, 2 ** 31);

    // Coastline (ocean at the bottom) and forest edge, one value per column.
    const sA = noise1D(rng, 64), sB = noise1D(rng, 19);
    const fA = noise1D(rng, 48), fB = noise1D(rng, 13);
    const shore = new Int16Array(W), forest = new Int16Array(W);
    for (let x = 0; x < W; x++) {
      shore[x] = Math.round(H * 0.78 + sA(x) * 9 + sB(x) * 2.5);
      forest[x] = Math.round(H * 0.4 + fA(x) * 16 + fB(x) * 4);
      forest[x] = Math.min(forest[x], shore[x] - 40);
    }

    // --- Bake terrain pixels ---
    const terrain = document.createElement("canvas");
    terrain.width = W; terrain.height = H;
    const tctx = terrain.getContext("2d");
    const img = tctx.createImageData(W, H);
    const d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const r = SI.hash2(x, y, seed);
        const r2 = SI.hash2(x + 911, y + 37, seed);
        let col;
        const sy = shore[x];
        if (y >= sy + 8) {
          const depth = y - sy - 8 + (r - 0.5) * 6;
          col = depth < 10 ? C.shallow : depth < 26 ? C.mid : C.deep;
        } else if (y >= sy - 8) {
          col = r < 0.3 ? C.wet2 : C.wet;
          if (y < sy - 5 && r2 < 0.5) col = C.sand2;
        } else {
          const toForest = y - forest[x] + (r - 0.5) * 7;
          if (toForest >= 0) {
            col = r2 < 0.18 ? C.sand2 : r2 > 0.9 ? C.sand3 : C.sand;
          } else {
            const depth = -toForest;
            if (depth < 10) col = r2 < 0.3 ? C.grass2 : r2 > 0.85 ? C.grass3 : C.grass;
            else if (depth < 24) col = r2 < 0.45 ? C.floor : r2 > 0.9 ? C.grass2 : C.grass;
            else col = r2 < 0.5 ? C.floor2 : r2 > 0.93 ? C.needles : C.floor;
          }
        }
        const i = (y * W + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);

    // --- Trees: dart-throwing with a minimum spacing, denser deeper in. ---
    const trees = [];
    const minDist = 10;
    for (let attempt = 0; attempt < 1400; attempt++) {
      const x = rng.range(2, W - 2);
      const y = rng.range(6, H);
      const fx = forest[Math.floor(x)];
      if (y > fx + 4) continue;
      const depth = fx - y;
      const pAccept = Math.min(1, 0.25 + depth / 45);
      if (!rng.chance(pAccept)) continue;
      let ok = true;
      for (const t of trees) {
        const dx = t.x - x, dy = (t.y - y) * 1.4;
        if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
      }
      if (!ok) continue;
      const sprite = SI.sprites.makePine(rng);
      trees.push({ x: Math.round(x), y: Math.round(y), sprite, r: 3 });
    }
    trees.sort((a, b) => a.y - b.y);

    // Tree shadows baked into the ground.
    for (const t of trees) {
      pixelEllipse(tctx, t.x + 1, t.y, Math.floor(t.sprite.width / 2) - 1, 2, "rgba(10,25,10,0.28)");
    }

    // --- Decor: rocks + driftwood on the beach, shrubs in the forest. ---
    const rocks = [];
    const nRocks = rng.int(5, 10);
    for (let i = 0; i < nRocks; i++) {
      const x = rng.int(6, W - 6);
      const y = rng.int(forest[x] + 8, shore[x] - 2);
      const s = rng.int(1, 3);
      pixelEllipse(tctx, x, y + 1, s + 1, 1, "rgba(0,0,0,0.25)");
      pixelEllipse(tctx, x, y, s + 1, s, "#7d7b74");
      tctx.fillStyle = "#9d9a90";
      tctx.fillRect(x - s, y - s + 1, s, 1);
      rocks.push({ x, y, r: s + 1 });
    }
    const nWood = rng.int(2, 4);
    for (let i = 0; i < nWood; i++) {
      const x = rng.int(12, W - 24);
      const y = rng.int(shore[x] - 16, shore[x] - 8);
      const len = rng.int(8, 16);
      tctx.fillStyle = "rgba(0,0,0,0.22)";
      tctx.fillRect(x + 1, y + 2, len, 1);
      tctx.fillStyle = "#8b7a63";
      tctx.fillRect(x, y, len, 2);
      tctx.fillStyle = "#a8977c";
      tctx.fillRect(x + 1, y, len - 2, 1);
      tctx.fillStyle = "#6e5f4b";
      tctx.fillRect(x, y, 1, 2);
    }
    const nShrubs = rng.int(25, 45);
    for (let i = 0; i < nShrubs; i++) {
      const x = rng.int(4, W - 4);
      const y = rng.int(4, forest[x] + 2);
      const s = rng.int(2, 3);
      pixelEllipse(tctx, x, y, s + 1, s - 1, "#2a4a22");
      pixelEllipse(tctx, x - 1, y - 1, s - 1, s - 2 || 1, "#3f6a30");
    }

    return { W, H, seed, shore, forest, terrain, trees, rocks };
  }

  // Is (x, y) a place the survivor's feet can stand?
  function walkable(world, x, y) {
    if (x < 4 || x > W - 5 || y < 10 || y > H - 2) return false;
    const xi = Math.floor(x);
    if (y > world.shore[xi] - 9) return false;
    for (const t of world.trees) {
      const dx = t.x - x, dy = (t.y - 1 - y) * 1.5;
      if (dx * dx + dy * dy < (t.r + 2) * (t.r + 2)) return false;
    }
    for (const r of world.rocks) {
      const dx = r.x - x, dy = (r.y - y) * 1.5;
      if (dx * dx + dy * dy < (r.r + 1) * (r.r + 1)) return false;
    }
    return true;
  }

  window.SI = window.SI || {};
  SI.world = { W, H, generate, walkable, pixelEllipse };
})();
