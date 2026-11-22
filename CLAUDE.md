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
| `data/characters/<id>/` | Character JSON (the Toska export and engine data). Game-ready sheets in `sheets/` (only those ship); raw art can sit beside them. |
| `scripts/` | Node tools: `sprite-prep.mjs` (drawn strip → sheet) and `png.mjs` (dependency-free PNG read/write). |
| `data/system/` | Engine-wide tunables (motions, SOCD, combo, meter, burst, match rules). |
| `data/stages/` | Stage files (parallax layers; drawing only). |
| `tests/` | Node's built-in test runner. `tests/fixtures/fighter.toska.json` is a frozen copy of Avner (Phase 9) that every frame-data test uses, so real characters can be retuned freely; never tune it. |
| `docs/reports/` | The plain-words report for each phase. |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server at http://localhost:5300 |
| `npm run build` | Production build to `dist/` |
| `npm test` | Every test (Node's built-in runner) |
| `npm run bench` | Core speed benchmark (frames simulated per second) |

## How the core runs

Current through **Phase 9** (all phases of the brief done), plus **Avner: Brand of Light** (report `docs/reports/avner-brand.md`).

- **Brand of Light** (Avner's mechanic, all data): var `brand` (frames, 300 max, -1 per frame, `display: timer`,
  `mark`). Lumen Hook (`hookL/M/H`, 236 + L/M/H) adds 300 on hit and gatlings into `reel` / `lightstep` on hit
  only. Reel (214H) and Lightstep (214L) `require` brand ≥ 1 and `setVar` it to 0 on frame 0. Engine pieces, general
  for any character: move `pull` (combat.js, a slide toward the attacker instead of pushback), timeline event
  `toOpponent` (fighter.js, a slide toward the opponent), move `perCombo` (`pickCommand` skips a command whose
  move is already in the opponent's `combo.used` that many times). The renderer draws mechanic vars with a `mark`
  as a ring or a looping sheet on the opponent (`drawOpponentMarks`). Tests: `tests/brand.test.js`.
- **Art in the renderer** (all drawing-only data the core carries but never reads): move `chain` (`drawChain`: hand
  → hitbox tip, or → opponent after a hit while they slide), move `hitFx` (a sheet effect spawned from the hit cue,
  aged per game frame so it plays through hitstop), var `mark.sprite`. `drawSheetFrame` draws one frame of any sheet
  (no palette). Avner has art for idle, 5L, the Hooks, Reel, Lightstep; raw drawings stay beside `sheets/`.

- **The game** (Phase 9). `src/main.js` with no `?mode=` runs `src/ui/app.js`: one screen at a time from
  `src/ui/screens/` (title → select → versus splash/fight with pause and results, training, settings), switched with
  `app.go(name, params)`. Each screen gets `step(menu)` (from `src/ui/menu-input.js`: edges with auto-repeat;
  confirm = L or Enter, back = M or Esc, start = Enter/Esc/pad Start) and `draw()`. Settings (`src/ui/settings.js`,
  localStorage `toska.settings.v1`) feed `app.matchRules()` and the CPU level. Dev shortcuts: `?mode=training`,
  `?mode=versus[&cpu=1]` with `&p1= &p2= &pal1= &pal2=`. `window.toska.app` is a console debugging hook
  (`toska.app.screen.game`). Devices latch key taps until `endStep()` after each step, so no press is lost.
- **Rounds** (`src/core/match.js`, rules in `data/system/match.json`, `world.match`; null in training):
  `game.match = { round, wins, timer, phase, phaseTime, roundWinner, winner, ko }`. Phases intro (fighters frozen,
  inputs still buffered) → fight (timer ticks, not during super flash) → ko / timeup (inputs replaced by 0; the loser
  falls with stun 999 into `koDown`) → next round (fresh fighters at start positions; meter carries, burst refills,
  per the rules) or end. Time up: higher health share wins, equal = draw (both get a round). Replays store the rules
  (`file.match`) and palettes.
- **CPU** (`src/ui/cpu.js`): an input device, pure (own seeded random, no DOM). Per frame: block a coming attack in
  range (rolled once per attack; low crouching, air standing; keeps blocking through blockstun) → on hit, chain the
  next stronger normal that still reaches after pushback → punish when the opponent's remaining recovery ≥ a normal's
  startup and it reaches → poke in range → walk in / back off. Levels in `CPU_LEVELS` (chances out of 10000).
- **Presentation**: palettes in the character file (`palettes.base` + `colors[]`, validated at load), recoloured by
  exact match (`src/render/palette.js`; the placeholder figure uses colours 0-2). Stages are data
  (`data/stages/*.json`, layers drawn by `src/render/stage-renderer.js`, far layers pre-painted offscreen). The HUD
  (`src/render/hud.js`): health with damage trail, timer, round pips, burst, meter, mechanic, banners.

- **Meter, specials, supers, mechanics, burst** (Phase 8; fields in `docs/toska-format.md`). Player resources:
  `meter` (max `def.meterMax` = `stats.meterBars` × `meter.barSize`), `burst`, `gauge` and `vars` (the character's
  `mechanic`, compiled by `compileMechanic`). `gains` in combat.js pays meter/gauge on hit and block (the defender
  builds `victimGainPct` of damage taken); `enterState` pays whiff meter and `onWhiff` when a move ends without
  contact. Commands carry `kind`, `cost`, `requires`, `neutral`; `pickCommand` checks `affords`/`meets`,
  `startCommand` pays. Chords (`236LM`) use `chordWithin` (buttons ≤ `input.chordWindow` frames apart); an EX
  that can't be afforded falls back to the one-button version, and a one-button special upgrades to EX if the second
  button lands within `chordWindow` frames (`def.upgrades`, refund). Cancel windows: free states only take
  `neutral` commands; windows take commands they name, or neutral ones of a `#kind` they list (chain follow-ups use
  `neutral: false`). `superFlash` event sets `game.flash`/`flashBy`: `step` then only pushes inputs and grows
  `freezeAge` until it runs out. Burst (`world.burst` from `data/system/burst.json`): the buttons together in a
  `burst.states` state with a full gauge → `burst`/`burstAir` (moves compiled into every character), ends the
  combo. Damage modifiers from `mechanic.modifiers` (`damageMod`). Engine test character: `data/characters/proto`
  (not part of the cast). Training option `meter: always full`; the frame meter skips flash frames.

- **Rollback** (`src/net/`, pure like the core; the purity test covers it): `createSession(world, { local, delay,
  maxRollback: 8, hashEvery: 10 })`. Frame f = the step taking `game.frame` from f to f+1; `saved[f]` is the state
  at its start. `addLocalInput(raw)` schedules for frame + delay and always emits an `input` packet carrying every
  unacked local input (oldest first, up to 64) plus `ack` and `frame`. Unknown remote inputs are predicted as the
  last contiguous confirmed one; `receive` of a different real input marks `rollbackFrom`; `advance()` restores and
  re-simulates, then refuses to run (stall) if more than `maxRollback` frames past the confirmed remote input.
  `shouldWait()` skips a tick when more than 2 frames ahead of the peer (frame sync). Final frames (both inputs
  known) send `hash` messages every `hashEvery` frames; a mismatch sets `stats.desync`. Transport-agnostic:
  `sim-network.js` (seeded lag/jitter/loss) for tests, `src/ui/netplay.js` (BroadcastChannel between tabs,
  `?mode=netplay&side=1|2&lag=N&delay=N`) in the browser. `sync-test.js` / `?mode=synctest`: rewind 8 and replay
  every frame, demand the same hash. **Anything that affects the game must live in the game state**, or rollback and
  the sync test break.
- **Replays** (`src/net/replay.js`): `{ format: "toska-replay", version: 1, chars, frames, inputs: [[p1, p2, runLength]],
  checks: [[frame, hash]], finalHash }`. `createReplayRecorder` → `record(raws, game)` → `finish(game)`; `decodeReplay`
  validates; `playReplay(world, file)` re-runs and verifies checkpoints. Sessions take `onFinal(f, raws, state)` to
  record confirmed netplay frames. UI: Ctrl+S in synctest/netplay, `?mode=replay` viewer (`src/ui/replay-file.js`).
  Training sessions are not replayable (refill/reset edit the state outside the inputs).
- **Time controls** (`src/main.js`): F9 pause, F10 one frame, ` cycles 1×/½×/¼× (the loop's `speed`); not in netplay.
  The input history labels presses with the motion they completed (`motionLabels` in `src/ui/input-history.js`).

- **Training mode** (`src/ui/training/`, run by `src/ui/screens/training-screen.js`): never touches `src/core/`. `training.js` sits between the
  controllers and `step`: `inputs(game, dev)` returns [P1, P2] raw input (the dummy's input is OR-ed with a real P2
  controller; in record mode P1's controller drives P2 and is stored facing-relative; playback mirrors by facing);
  `afterStep` refills health after 40 frames with both free; `newGame` places fighters at the chosen position. Its
  only randomness is a seeded LCG (random block). `frame-meter.js` reads the game after each step: per-player frame
  bars (startup/active/recovery/stun/busy/free + invincible; hitstop frames skipped; holds after 8 quiet frames, the
  next action clears it), measured startup/active/recovery, and advantage = first frame the defender is out of
  `STUN_STATES` minus first frame the attacker can act (leaving the move on its last frame, or restarting it; leaving
  early = "cancelled"). `overlay.js` draws it; `training-panel.js` (F2) edits settings (localStorage
  `toska.training.v1`). Keys: F6 record, F7 playback, F8 meter, R reset.

- **Combos** (`data/system/combo.json`, `applyStrike` in combat.js): a hit on a fighter with no `combo` starts one
  `{ hits, damage, time, scale, used, wb, gb }`. Damage = base × `scale` × `repeatPenalty`^(earlier uses of the
  move; a multi-hit move's own hits don't count) → guts. Then `scale` ×= starter proration (first hit only) ×
  combo proration, floored at `minScale`. Hitstun (ground) or untech (air) is scaled by `hitstunDecay` /
  `untechDecay` at the current combo `time` (frames since the first hit, not counting hitstop). Juggled fighters fall
  faster per hit (`juggleGravityPerHit`, capped). `hitAir` → `tumble` when untech ends; any button in tumble →
  `airTech`. Wall/ground bounces are armed by the move (`wbX/wbY/gbY` on the victim), fire in `separate` / `land`,
  and are limited per combo. A combo ends (→ `lastCombo`) the moment the victim is out of `COMBO_STATES`, checked
  before the frame's hits.
- **Gatlings** compile into cancel windows (`gatlingCancels` in character.js): the table plus `specialCancel`,
  `superCancel`, `jumpCancel`, `launcher` (`#superjump`: up on hit → `superJump` with no pre-jump).

- **Movement** (all numbers in `fighter-defaults.json` stats, overridable per character; states in
  `common-states.json`): walk, `jumpSquat` → `jump`, `superJumpSquat` → `superJump` (28 motion), `airJump`
  (fresh up in the air, `stats.airJumps` per jump), `dashF` → `dashStop` (66; cancellable into attacks and jumps
  from `dashCancel`), `backdash` → `backdashStop` (44; invincible `backdashInvuln` frames), `airdashF` /
  `airdashB` → `airdashEnd` (66/44 in the air, no gravity, keeps `airdashKeep`/10000 of its speed after,
  `stats.airDashes` per jump). Direction-only motions use `dirMotionNow` (last direction must be fresh). The `jump`
  event reads `<kind>Up/Forward/Back` for kind jump, superJump, airJump. Air counters reset on landing. Cancel tags
  `#jump` and `#dash` allow jumping and dashing out of a window. A button on the same frame as a dash tap wins.

- **One frame** (`step` in `src/core/game.js`) runs in stages for both fighters before the next stage starts, so
  neither player acts first: frame++ and clear cues → push inputs → super flash (if `game.flash`, count it down and stop) → mechanic/burst ticks → hitstop (a frozen fighter skips everything,
  `freezeAge` grows so presses made in hitstop stay buffered) → throw breaks → `advanceAndDecide` (both) → `move`
  (both: one-shot events, physics, pushback slide) → `separate` (walls, corner transfer, pushboxes) → `land` (both)
  → `resolveHits`.
- **Hits** (`src/core/combat.js`): everything is decided from a frame-start snapshot, then applied, so trades work.
  Order: throws (both = tech; a throw beats a strike), then strikes both ways, else clash (hitbox vs hitbox, no body
  contact). A strike becomes armor / block / counter / hit. Block = holding away from the attacker in a free or block
  state, checked against `guard`. Hitstop goes on both; then `stun` = hitstun or blockstun (N = N frames stuck).
  Pushback is a slide (`slide`, `slideLeft`, decreasing per frame over `battle.pushbackFrames`); a cornered defender
  makes the attacker slide instead, and wall-refused slide transfers to the opponent. Damage goes through guts
  (`battle.guts`). Contact sets `p.contact` (HIT, BLOCK, CLASH; clash counts as block for cancels). Throws:
  `throwHold`/`thrown` for `stats.throwBreak` frames (H breaks), then `throwLands` applies damage, swap and knockdown.
- **Cues** (`game.cues`, one frame long): `hit`, `counter`, `block`, `clash`, `armor`, `throw`, `tech`, `burst`, `superflash`, `sound`, `fx`,
  with x/y. The renderer turns them into sparks; the game never reads them back.
- **System rules** live in `data/system/battle.json` (stage, corner zone, pushback frames, counter hit, clash, guts,
  air hit, air block, armor damage, throw tech).

- **World and state** (`src/core/game.js`): `world = createWorld({ input, battle, chars: [def1, def2] })` is static
  and read-only (system JSON + compiled characters). The game state is `{ frame, cues, flash, flashBy, players: [p1, p2] }`; each
  player holds position, velocity, state/frame, stun, hitstop, health, meter, burst, gauge, vars, combo, input buffer
  and consumed presses (see `createGame`). `step(game, [raw1, raw2], world)` runs the stages in **One frame** above.
- **Characters** (`src/core/character.js`, format in `docs/toska-format.md`): `compileCharacter(file, { defaults,
  common })` imports any Toska version (1 is upgraded to 2), merges `data/system/common-states.json` (system states)
  and `fighter-defaults.json` (stats), and compiles every state into per-frame tables: `frames[i]` = lasting values
  (sprite, hit, hitId, hitProps, hurt, push, throw, throwHurt, invStrike, invThrow, armor, counter, gravity) and
  `onEnter[i]` = one-shot events (vel, addVel, velScale, sound, fx, jump, superFlash, meter, gauge, addVar, setVar). Boxes are `[x, y, w, h]` in units, x forward from
  the feet, y up. `commands` are sorted by priority. `frameOf(def, state, frame)` reads a frame (clamped).
- **A fighter's frame** (`src/core/fighter.js`, `stepFighter`): hitstop → advance the timeline (stun states count
  `p.stun` down; others end at `duration` and loop or go to `next`) → decide (`free` states: commands, jump, crouch,
  walk, stand, auto-face; otherwise only commands/jumps allowed by an open cancel window whose condition matches
  `p.contact`) → fire the frame's one-shot events → physics (x += vx, y += vy, gravity) → stage clamp → landing
  (air state, y ≤ 0, falling → `landTo`). A press is consumed by game frame (`p.consumed`) so one press = one move.
- **Screens**: `src/main.js` boots the game (title menu) by default; developer modes: the Input Lab (`?mode=lab`),
  Netplay (`?mode=netplay`), the live Sync Test (`?mode=synctest`), the Replay viewer (`?mode=replay`).
  `src/render/fight-renderer.js` draws the stage, fighters (sprites from `data/characters/<id>/` when a sheet image
  exists, else a placeholder figure whose limb reaches to the live hitbox; lying down in knockdown/koDown), the HUD
  and the box view.

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
- **State helpers** (`src/core/state.js`): the game is one plain JSON-shaped object that `step` mutates. `cloneState`,
  `serializeState`, `diffState` (path of the first difference), `hashState` (FNV-1a).
- **Devices** (`src/ui/devices.js`): keyboard (`event.code`) + Gamepad API, OR-ed. Bindings in localStorage key
  `toska.bindings.v1`; the F1 panel (`src/ui/controls-panel.js`) rebinds.
