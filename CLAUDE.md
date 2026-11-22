# Toska Engine: the brief

Read this first, every session. It is kept current at the end of every phase.

The Toska Engine is an original 2D fighting game engine, built from scratch, plus its first game. The owner is
**Yahushua**, a former competitive fighting game player and character designer. He designs and play-tests; he
doesn't read code. **Every report to him is in plain words.**

## The feel

- **Speed of Ultimate Marvel vs. Capcom 3:** fast normals (3-5 frame lights), fast dashes, airdashes, super jumps,
  launcher into air combo.
- **Combo system of BlazBlue Central Fiction:** gatling routes, proration and combo time, jump-cancels,
  character-specific mechanics.
- **Everything original.** Never copy code, sprites, names or characters from any existing game. Mechanics and
  publicly documented frame data (Dustloop, Mizuumi) are fine to study as targets.

## Rules

1. **Determinism is sacred.** Everything that decides a result lives in `src/core/`: pure JavaScript, no DOM, no
   rendering, no `Math.random`, no `Date`, no floating-point positions. Positions, velocities and timers are integers
   (1 pixel = 100 units, `src/core/fixed.js`). The core steps at exactly 60 Hz. Same inputs in, same game out, always.
   `tests/core-purity.test.js` enforces the obvious part.
2. **Content is data.** Characters, moves, frame data, boxes, gatlings and proration live in JSON under `data/`,
   never in code.
3. **The renderer never decides anything.** `src/render/` only draws the state it's given.
4. **Never weaken a test to get green.**
5. **Report in plain words:** what changed, what you decided and why, what tests ran, what to play-test.
6. Work in phases, in order, each on its own branch. A phase is done when its tests pass, `npm run build` passes and a
   plain-words report is written (`docs/reports/phase-N.md`). Then merge to `main` and start the next. Don't stop to
   ask: make the sensible call, write it down in the report, keep going.
7. Measure performance every phase: 60 fps with two characters, effects and the training overlay on a mid-range laptop.

## Folder layout

| Folder | What lives there |
| --- | --- |
| `src/core/` | The rules. Pure, deterministic, integer-only. Never imports from the folders below. |
| `src/render/` | Drawing. Reads state, never changes it. |
| `src/ui/` | Menus, HUD, training overlays, input devices (keyboard, gamepad, bindings). |
| `src/tools/` | Editors and importers' browser front-ends. |
| `src/net/` | Rollback netcode. |
| `data/characters/<id>/` | Character JSON (the Toska export and engine data) and sprites. |
| `data/system/` | Engine-wide tunables (motions, SOCD, combo rules). |
| `tests/` | Node's built-in test runner. |
| `docs/reports/` | The plain-words report for each phase. |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5300 |
| `npm run build` | Production build to `dist/` |
| `npm test` | Every test (Node's built-in runner) |
| `npm run bench` | Core speed benchmark (frames simulated per second) |

## How the core runs

Current through **Phase 1**.

- **Loop** (`src/ui/loop.js`): an accumulator turns real time into exactly 60 core steps a second (max 5 per
  display frame; extra time is dropped, never fast-forwarded). `render(alpha)` runs once per display frame.
- **Input** (`src/core/input.js`): each step the UI hands the core one raw bitmask per player
  (`RAW`: LEFT 1, RIGHT 2, UP 4, DOWN 8, L 16, M 32, H 64, S 128). The core resolves SOCD from
  `data/system/input.json` and pushes a frame `dir | buttons << 4` (dir = numpad 1-9, screen-absolute) into a
  per-player ring buffer (`bufferFrames`). Motion reading mirrors by facing, so 6 always means forward.
  - Motions (`motions` in the data): `steps` (strict) / `lenient` step strings (`"123"` = any of those, `"!123"` =
    any but those, `"3?"` = optional), `window` / `lenientWindow` frames from the first step to the button.
    Charges: `charge` dirs held `chargeFrames`, then `release` within `window`.
  - `readMotion(inp, rules, motion, BTN.x, facing, {negativeEdge, leniency})` looks back `pressBuffer` frames for the
    press (or release) and returns its age or -1. `motionsAt` lists every motion that matches, in `motionPriority`.
- **State** (`src/core/game.js`, `src/core/state.js`): the game is one plain JSON-shaped object
  `{ frame, players: [{ id, input }] }`. `step(state, [raw1, raw2], rules)` mutates it one frame. `cloneState`,
  `serializeState`, `diffState` (path of the first difference), `hashState` (FNV-1a).
- **Devices** (`src/ui/devices.js`): keyboard (`event.code`) + Gamepad API, OR-ed. Bindings in localStorage key
  `toska.bindings.v1`; the F1 panel (`src/ui/controls-panel.js`) rebinds.
- **Screen**: `src/main.js` is the Input Lab for now.
