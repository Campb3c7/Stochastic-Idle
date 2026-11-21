# Stochastic Idle

An idle survival simulation inspired by *Alone*. A survivor is dropped on a remote
coast and the world runs as a stochastic simulation: nothing is scripted, everything
is drawn from probability distributions.

**Current state (v0.1):** first look only. A procedurally generated coastline,
beach and forest, a day/night cycle with tides, and a survivor who wanders on their own.

## Tech

Plain HTML5 Canvas + vanilla JavaScript. There are no dependencies and no build step,
so it runs anywhere and loads instantly.

- `js/rng.js`: seeded RNG (mulberry32) with exponential/normal samplers and forkable streams
- `js/sprites.js`: pixel-art sprites defined as text grids, plus procedural pine trees
- `js/world.js`: world generation (coastline, forest edge, trees, decor) and walkability
- `js/survivor.js`: the survivor and their wandering behaviour
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
