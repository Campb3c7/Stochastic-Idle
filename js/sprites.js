// Pixel-art sprites, defined as text so they're easy to edit by hand.
// Each character in a row is one pixel; '.' is transparent.
(function () {
  "use strict";

  const PALETTE = {
    h: "#3e2716", // hair shade
    H: "#5a3a22", // hair
    S: "#e2a676", // skin
    s: "#b97a52", // skin shade
    E: "#1b1420", // eyes
    J: "#56733d", // jacket
    j: "#3b5429", // jacket shade
    P: "#3d4b6a", // pants
    p: "#2a3450", // pants shade
    B: "#33251a", // boots
  };

  const BODY_FRONT = [
    "....jJJJJJJj....",
    "...jJJJJJJJJj...",
    "...SjJJJJJJjS...",
    "...SjJJJJJJjS...",
  ];
  const LEGS_STAND = [
    "....pPPPPPPp....",
    "....pPP..PPp....",
    "....pPP..PPp....",
    "....BBB..BBB....",
  ];
  const LEGS_STEP_L = [
    "....pPPPPPPp....",
    "....pPP..PPp....",
    "....pPP..BBB....",
    "....BBB.........",
  ];
  const LEGS_STEP_R = [
    "....pPPPPPPp....",
    "....pPP..PPp....",
    "....BBB..PPp....",
    ".........BBB....",
  ];
  const HEAD_DOWN = [
    "................",
    ".....hHHHHh.....",
    "....hHHHHHHh....",
    "....hHHHHHHh....",
    "....hSSSSSSh....",
    "....SSESSESS....",
    "....sSSSSSSs....",
    ".....sSSSSs.....",
  ];
  const HEAD_UP = [
    "................",
    ".....hHHHHh.....",
    "....hHHHHHHh....",
    "....hHHHHHHh....",
    "....hHHHHHHh....",
    "....hHHHHHHh....",
    "....shHHHHhs....",
    ".....sSSSSs.....",
  ];
  const SIDE_TOP = [
    "................",
    ".....hHHHH......",
    "....hHHHHHH.....",
    "....hHHHHHHS....",
    "....hHHSSSES....",
    "....hhSSSSSS....",
    ".....sSSSSs.....",
    "......sSSs......",
    ".....jJJJJj.....",
    "....jJJJJJJj....",
    "....jJJjJJJj....",
    "....jJJSJJJj....",
  ];
  const SIDE_LEGS_STAND = [
    ".....pPPPPp.....",
    ".....pPPPPp.....",
    ".....pPPPPp.....",
    ".....BBBBBBB....",
  ];
  const SIDE_LEGS_STRIDE = [
    ".....pPPPPp.....",
    "....pPp..pPp....",
    "...pPp....pPp...",
    "...BBB....BBBB..",
  ];
  // Lying on the ground, head to the left.
  const SLEEP = [
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "................",
    "..hHh...........",
    ".hHHSSjJJJJJpPPB",
    ".hHSsSjJJJJJPPPB",
    ".hhSSsjjjjjjpppB",
    "..hs............",
    "................",
    "................",
  ];

  const FRAMES = {
    down: [
      HEAD_DOWN.concat(BODY_FRONT, LEGS_STAND),
      HEAD_DOWN.concat(BODY_FRONT, LEGS_STEP_L),
      HEAD_DOWN.concat(BODY_FRONT, LEGS_STAND),
      HEAD_DOWN.concat(BODY_FRONT, LEGS_STEP_R),
    ],
    up: [
      HEAD_UP.concat(BODY_FRONT, LEGS_STAND),
      HEAD_UP.concat(BODY_FRONT, LEGS_STEP_R),
      HEAD_UP.concat(BODY_FRONT, LEGS_STAND),
      HEAD_UP.concat(BODY_FRONT, LEGS_STEP_L),
    ],
    right: [
      SIDE_TOP.concat(SIDE_LEGS_STAND),
      SIDE_TOP.concat(SIDE_LEGS_STRIDE),
      SIDE_TOP.concat(SIDE_LEGS_STAND),
      SIDE_TOP.concat(SIDE_LEGS_STRIDE),
    ],
  };

  function rowsToCanvas(rows, palette) {
    const h = rows.length, w = rows[0].length;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const col = palette[rows[y][x]];
        if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); }
      }
    }
    return c;
  }

  function mirror(src) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const ctx = c.getContext("2d");
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    return c;
  }

  function buildSurvivorSprites() {
    const out = {};
    for (const dir of ["down", "up", "right"]) {
      out[dir] = FRAMES[dir].map((rows) => rowsToCanvas(rows, PALETTE));
    }
    out.left = out.right.map(mirror);
    out.sleep = rowsToCanvas(SLEEP, PALETTE);
    return out;
  }

  // Broadleaf spring tree: a tall bare trunk under a wide, lumpy canopy.
  // Kept to four flat canopy tones so it reads simply.
  const TREE_PALETTES = [
    { base: "#5f9e3e", light: "#80bb51", shade: "#4a8233", dark: "#376426" },
    { base: "#6caa45", light: "#93c75c", shade: "#558f37", dark: "#3f6e2a" },
    { base: "#579339", light: "#76b04c", shade: "#437830", dark: "#305a23" },
  ];

  function makeTree(rng) {
    const R = rng.int(10, 14);           // canopy radius
    const Ry = Math.round(R * 0.85);     // slightly flattened
    const trunkH = rng.int(8, 12);       // visible trunk under the canopy
    const W = R * 2 + 3;
    const cx = Math.floor(W / 2), cy = Ry + 1;
    const H = cy + Ry + trunkH + 1;
    const pal = rng.pick(TREE_PALETTES);

    // Canopy = union of a few overlapping ellipses ("lobes").
    const lobes = [{ x: cx, y: cy, r: R * 0.78 }];
    const n = rng.int(4, 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      lobes.push({ x: cx + Math.cos(a) * R * 0.45, y: cy + Math.sin(a) * Ry * 0.45, r: R * rng.range(0.48, 0.58) });
    }
    const inside = (x, y) => {
      for (const l of lobes) {
        const dx = x - l.x, dy = (y - l.y) / 0.85;
        if (dx * dx + dy * dy <= l.r * l.r) return true;
      }
      return false;
    };

    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");

    // Trunk (drawn first, canopy covers its top).
    const top = cy, bottom = H - 1;
    for (let y = top; y <= bottom; y++) {
      ctx.fillStyle = "#7a5636"; ctx.fillRect(cx - 1, y, 1, 1);
      ctx.fillStyle = "#664629"; ctx.fillRect(cx, y, 1, 1);
      ctx.fillStyle = "#4f3520"; ctx.fillRect(cx + 1, y, 1, 1);
    }
    ctx.fillStyle = "#4f3520";
    ctx.fillRect(cx - 2, bottom, 1, 1);
    ctx.fillRect(cx + 2, bottom, 1, 1);

    // Canopy.
    const hx = cx - R * 0.3, hy = cy - Ry * 0.35, hr = R * 0.5;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!inside(x, y)) continue;
        let col = pal.base;
        if (!inside(x, y + 1)) col = pal.dark;
        else if (y - cy > Ry * 0.3) col = pal.shade;
        else {
          const dx = x - hx, dy = (y - hy) / 0.85;
          if (dx * dx + dy * dy < hr * hr) col = pal.light;
        }
        ctx.fillStyle = col;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    return { canvas: c, canopyR: R };
  }

  window.SI = window.SI || {};
  SI.sprites = { buildSurvivorSprites, makeTree };
})();
