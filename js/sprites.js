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

  // Shared body rows (jacket + arms), front/back view.
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

  // Side view, facing right (left is a mirror).
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

  // Builds every survivor frame once at startup.
  function buildSurvivorSprites() {
    const out = {};
    for (const dir of ["down", "up", "right"]) {
      out[dir] = FRAMES[dir].map((rows) => rowsToCanvas(rows, PALETTE));
    }
    out.left = out.right.map(mirror);
    return out;
  }

  // Procedural conifer: tiered canopy with light on the left, shade on the right.
  function makePine(rng) {
    const maxHalf = rng.int(6, 9);
    const W = maxHalf * 2 + 1;
    const H = rng.int(26, 38);
    const trunkH = rng.int(3, 5);
    const canopyH = H - trunkH;
    const tiers = rng.int(3, 5);
    const tierLen = canopyH / tiers;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const set = (x, y, hex) => {
      const i = (y * W + x) * 4;
      d[i] = parseInt(hex.slice(1, 3), 16);
      d[i + 1] = parseInt(hex.slice(3, 5), 16);
      d[i + 2] = parseInt(hex.slice(5, 7), 16);
      d[i + 3] = 255;
    };
    const DARK = "#1c3626", MID = "#2d5638", LIGHT = "#467a44", SHADE = "#234530", TIP = "#5c8f50";
    const cx = maxHalf;

    // Trunk
    for (let y = canopyH - 2; y < H; y++) {
      set(cx, y, "#5b3a24");
      set(cx - 1, y, y === H - 1 ? "#4a2f1d" : "#6e4a2e");
    }
    // Canopy
    for (let y = 0; y < canopyH; y++) {
      const t = Math.min(tiers - 1, Math.floor(y / tierLen));
      const f = (y - t * tierLen) / tierLen;
      const tierScale = (t + 1) / tiers;
      let half = maxHalf * tierScale * (0.35 + 0.65 * f);
      if (y < 2) half = Math.min(half, y * 0.6);
      half += rng.range(-0.6, 0.6);
      const hi = Math.max(0, Math.round(half));
      for (let dx = -hi; dx <= hi; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= W) continue;
        const edge = Math.abs(dx) >= hi;
        let col;
        if (edge) col = DARK;
        else if (dx < -hi * 0.25) col = rng.chance(0.7) ? LIGHT : MID;
        else if (dx > hi * 0.3) col = rng.chance(0.75) ? SHADE : DARK;
        else col = MID;
        if (!edge && rng.chance(0.06)) col = rng.chance(0.5) ? TIP : DARK;
        // dark underside of each tier
        if (f > 0.85 && !edge && rng.chance(0.5)) col = DARK;
        set(x, y, col);
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  window.SI = window.SI || {};
  SI.sprites = { buildSurvivorSprites, makePine };
})();
