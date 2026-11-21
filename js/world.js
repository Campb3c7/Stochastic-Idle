// World generation: ocean on the west (left) edge, a beach, then open
// spring woodland with a creek running down to the sea.
// Scale: 8 px = 1 m. The terrain is baked once into an offscreen canvas.
(function () {
  "use strict";

  const WW = 1600, WH = 1000;        // world size in px (200 m x 125 m)
  const PX_PER_M = 8;
  const T = { GRASS: 0, SAND: 1, WET: 2, OCEAN: 3, CREEK: 4 };

  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const C = {
    deep: rgb("#2a5b88"),
    mid: rgb("#306c9b"),
    shallow: rgb("#3b82b0"),
    wet: rgb("#b9a277"),
    sand: rgb("#dfca95"),
    sand2: rgb("#d6c08a"),
    grass: rgb("#77aa4b"),
    grass2: rgb("#6d9f45"),
    creek: rgb("#4a95c2"),
    bankGrass: rgb("#5f8f3d"),
    bankSand: rgb("#c6ae7b"),
    flowers: [rgb("#f3d85b"), rgb("#f4f1e6"), rgb("#b593d8")],
  };

  function noise1D(rng, spacing, len) {
    const n = Math.ceil(len / spacing) + 3;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(rng.float() * 2 - 1);
    return (x) => {
      const f = x / spacing, i = Math.floor(f), t = f - i;
      const s = t * t * (3 - 2 * t);
      return pts[i] * (1 - s) + pts[i + 1] * s;
    };
  }

  // Smooth 2D value noise in [0, 1].
  function noise2D(seed, scale) {
    return (x, y) => {
      const fx = x / scale, fy = y / scale;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let tx = fx - ix, ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = SI.hash2(ix, iy, seed), b = SI.hash2(ix + 1, iy, seed);
      const c = SI.hash2(ix, iy + 1, seed), d = SI.hash2(ix + 1, iy + 1, seed);
      return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
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

    // --- Coastline: one x per row. ---
    const sA = noise1D(rng, 110, WH), sB = noise1D(rng, 27, WH), bA = noise1D(rng, 80, WH);
    const shore = new Int16Array(WH), sandEdge = new Int16Array(WH);
    for (let y = 0; y < WH; y++) {
      shore[y] = Math.round(150 + sA(y) * 26 + sB(y) * 4);
      sandEdge[y] = shore[y] + Math.round(72 + bA(y) * 20);
    }

    // --- Creek: a random walk from the east edge down to the sea. ---
    const creek = [];
    {
      let x = WW + 8, y = rng.range(WH * 0.3, WH * 0.7), ang = Math.PI;
      let guard = 0;
      while (guard++ < 2000) {
        const yi = Math.max(0, Math.min(WH - 1, Math.round(y)));
        if (x < shore[yi] - 10) break;
        creek.push({ x, y });
        ang += rng.normal(0, 0.16) + (Math.PI - ang) * 0.06;
        if (y < 120) ang -= 0.05;
        if (y > WH - 120) ang += 0.05;
        x += Math.cos(ang) * 4;
        y += Math.sin(ang) * 4;
      }
    }

    // --- Terrain type map ---
    const type = new Uint8Array(WW * WH);
    const bank = new Uint8Array(WW * WH);
    const CR = 3;
    for (const p of creek) {
      for (let dy = -CR - 1; dy <= CR + 1; dy++) {
        for (let dx = -CR - 1; dx <= CR + 1; dx++) {
          const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
          if (x < 0 || y < 0 || x >= WW || y >= WH) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 <= CR * CR) type[y * WW + x] = T.CREEK;
          else if (d2 <= (CR + 1.5) * (CR + 1.5)) bank[y * WW + x] = 1;
        }
      }
    }

    // --- Bake terrain pixels (flat colours, low detail) ---
    const terrain = document.createElement("canvas");
    terrain.width = WW; terrain.height = WH;
    const tctx = terrain.getContext("2d");
    const img = tctx.createImageData(WW, WH);
    const d = img.data;
    const patch = noise2D(seed, 56);
    const edgeN = noise2D(seed + 7, 7);
    for (let y = 0; y < WH; y++) {
      const sx = shore[y], se = sandEdge[y];
      for (let x = 0; x < WW; x++) {
        const k = y * WW + x;
        let col;
        if (type[k] === T.CREEK) {
          col = C.creek;
        } else if (x < sx - 5) {
          type[k] = T.OCEAN;
          const dist = sx - 5 - x;
          col = dist < 14 ? C.shallow : dist < 40 ? C.mid : C.deep;
        } else if (x < sx + 7) {
          type[k] = T.WET;
          col = C.wet;
        } else if (x < se + (edgeN(x, y) - 0.5) * 10) {
          type[k] = T.SAND;
          col = bank[k] ? C.bankSand : patch(x, y) > 0.62 ? C.sand2 : C.sand;
        } else {
          type[k] = T.GRASS;
          if (bank[k]) col = C.bankGrass;
          else {
            col = patch(x + 500, y) > 0.55 ? C.grass2 : C.grass;
            const r = SI.hash2(x, y, seed);
            if (r < 0.0012) col = C.flowers[Math.floor(SI.hash2(y, x, seed) * 3)];
          }
        }
        const i = k * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    tctx.putImageData(img, 0, 0);

    const nearCreek = (x, y, r) => {
      for (let dy = -r; dy <= r; dy += 2)
        for (let dx = -r; dx <= r; dx += 2) {
          const xx = Math.round(x + dx), yy = Math.round(y + dy);
          if (xx >= 0 && yy >= 0 && xx < WW && yy < WH && type[yy * WW + xx] === T.CREEK) return true;
        }
      return false;
    };

    // --- Trees: well spaced, sparse near the beach, denser inland. ---
    const trees = [];
    const minDist = 34;
    for (let attempt = 0; attempt < 3000; attempt++) {
      const x = rng.range(8, WW - 8);
      const y = rng.range(14, WH - 2);
      const yi = Math.floor(y);
      const inland = x - sandEdge[yi];
      if (inland < 14) continue;
      const p = 0.25 + 0.6 * Math.min(1, inland / 900);
      if (!rng.chance(p)) continue;
      if (nearCreek(x, y, 10)) continue;
      let ok = true;
      for (const t of trees) {
        const dx = t.x - x, dy = (t.y - y) * 1.2;
        if (dx * dx + dy * dy < minDist * minDist) { ok = false; break; }
      }
      if (!ok) continue;
      const spr = SI.sprites.makeTree(rng);
      trees.push({ x: Math.round(x), y: Math.round(y), sprite: spr.canvas, canopyR: spr.canopyR, r: 2 });
    }
    trees.sort((a, b) => a.y - b.y);
    for (const t of trees) {
      pixelEllipse(tctx, t.x + 1, t.y - 1, Math.round(t.canopyR * 0.9), 3, "rgba(30,60,20,0.22)");
    }

    // Spatial grid for fast collision lookups.
    const CELL = 32, gw = Math.ceil(WW / CELL), gh = Math.ceil(WH / CELL);
    const grid = Array.from({ length: gw * gh }, () => []);
    for (const t of trees) grid[Math.floor(t.y / CELL) * gw + Math.floor(t.x / CELL)].push(t);

    // --- Decor ---
    const rocks = [];
    const nRocks = rng.int(6, 10);
    for (let i = 0; i < nRocks; i++) {
      const y = rng.int(20, WH - 20);
      const x = rng.int(shore[y] + 12, sandEdge[y] - 4);
      if (nearCreek(x, y, 6)) continue;
      const s = rng.int(2, 3);
      pixelEllipse(tctx, x + 1, y + 1, s + 1, 1, "rgba(0,0,0,0.18)");
      pixelEllipse(tctx, x, y, s + 1, s - 1, "#8a877e");
      tctx.fillStyle = "#a3a095";
      tctx.fillRect(x - s + 1, y - s + 1, s, 1);
      rocks.push({ x, y, r: s + 1 });
    }
    const nWood = rng.int(3, 6);
    for (let i = 0; i < nWood; i++) {
      const y = rng.int(20, WH - 20);
      const x = rng.int(shore[y] + 10, shore[y] + 30);
      const len = rng.int(10, 18);
      tctx.fillStyle = "#94836a";
      tctx.fillRect(x, y, 2, len);
      tctx.fillStyle = "#ad9c80";
      tctx.fillRect(x, y + 1, 1, len - 2);
    }
    const nBush = rng.int(50, 80);
    for (let i = 0; i < nBush; i++) {
      const y = rng.int(10, WH - 10);
      const x = rng.int(sandEdge[y] + 12, WW - 8);
      if (nearCreek(x, y, 6)) continue;
      pixelEllipse(tctx, x, y, 4, 2, "#4f8434");
      pixelEllipse(tctx, x - 1, y - 1, 2, 1, "#66a043");
    }

    return { W: WW, H: WH, seed, shore, sandEdge, creek, type, terrain, trees, grid, gridW: gw, CELL, rocks };
  }

  function terrainAt(world, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= world.W || yi >= world.H) return T.OCEAN;
    return world.type[yi * world.W + xi];
  }

  // Can the survivor's feet stand at (x, y)?
  function walkable(world, x, y) {
    if (x < 4 || x > world.W - 5 || y < 14 || y > world.H - 2) return false;
    if (x < world.shore[Math.floor(y)] + 3) return false;
    const { grid, gridW, CELL } = world;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gy < 0 || gx >= gridW) continue;
        const cell = grid[gy * gridW + gx];
        if (!cell) continue;
        for (const t of cell) {
          const dx = t.x - x, dy = (t.y - 1 - y) * 1.5;
          if (dx * dx + dy * dy < 16) return false;
        }
      }
    }
    for (const r of world.rocks) {
      const dx = r.x - x, dy = (r.y - y) * 1.5;
      if (dx * dx + dy * dy < (r.r + 1) * (r.r + 1)) return false;
    }
    return true;
  }

  window.SI = window.SI || {};
  SI.world = { WW, WH, PX_PER_M, T, generate, walkable, terrainAt, pixelEllipse };
})();
