# Stochastic Idle

An idle survival simulation inspired by *Alone*. A survivor is dropped on a remote
coast and the world runs as a stochastic simulation: nothing is scripted, everything
is drawn from probability distributions.

**Current state (v0.2):** easy-mode spring coast. A 200 m × 125 m world with the
ocean on the west, a creek, and spread-out broadleaf trees. A camera follows the survivor.
The body is simulated in compartments (fat, protein, glycogen, water, minerals),
with calorie burn, fuel use, hydration, fasting adaptation and a two-process sleep model.
The survivor drinks from the creek once they've found it, and sleeps at night.
Press **M** to open a map that only the player can see.

## Tech

Plain HTML5 Canvas + vanilla JavaScript. There are no dependencies and no build step,
so it runs anywhere and loads instantly.

- `js/rng.js`: seeded RNG (mulberry32) with exponential/normal samplers and forkable streams
- `js/sprites.js`: pixel-art sprites defined as text grids, plus procedural pine trees
- `js/world.js`: world generation (coastline, forest edge, trees, decor) and walkability
- `js/physiology.js`: body composition, energy expenditure, fuel partitioning, water balance, sleep
- `js/survivor.js`: the survivor's needs-driven behaviour and what they know
- `js/game.js`: fixed-timestep simulation loop, rendering, UI

Every world comes from a seed. Add `?seed=12345` to the URL to replay a world.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly also works.

## Deploy (GitHub Pages)

Settings → Pages → Build and deployment → Source: *Deploy from a branch* →
pick `main` and `/ (root)`.
