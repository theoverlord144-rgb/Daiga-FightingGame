# The Toska character format

A character is one JSON file: `data/characters/<id>/<id>.toska.json`. The Toska editor exports it; the engine
imports it (`src/core/character.js`). Units in the file are **pixels** and **frames** (1/60 s). The engine converts
pixels to its integer units (1 px = 100).

## Versions

| Version | What it is |
| --- | --- |
| 1 | The editor's export: `{ engine: "Toska", version: 1, character, moves[] }`. Moves carry frame data, boxes and a sprite sheet. Always loads. |
| 2 | Version 1 plus everything the engine adds: `character.stats`, explicit `timeline` events per move, `cancels`, `states` (overrides for system states; e.g. `{ "jump": { "loopFrom": 59 } }` makes a looping state restart from that frame instead of 0). Version 1 files are upgraded to 2 on load. |

Every later version must keep loading every earlier one (`tests/character.test.js` checks version 1).

**Assumption (Phase 2):** no real editor export existed yet, so version 1 is defined here from the brief. When the
real export arrives, the importer maps its fields; any field this page doesn't know is kept and ignored.

## `character`

```json
{ "id": "avner", "name": "Avner", "stats": { ... } }
```
`stats` (version 2; every value has a default in `data/system/fighter-defaults.json`): health, movement speeds,
gravity, jump, landing, standing/crouching/air hurtboxes and pushboxes. A value in a timeline can name a stat with
`"@statName"`.

## `moves[]`

| Field | Meaning |
| --- | --- |
| `id` | Unique name, also the state name (`"5L"`, `"236H"`). Defaults to `input`. |
| `name` | Display name. |
| `input` | Command in numpad notation: `5L`, `2M`, `6H`, `j.H`, `236L`, `j.214S`, `[4]6H`, `236LM` (two buttons = a chord: pressed together, up to `chordWindow` frames apart in either order). `5` = any non-down direction, `2` = any down direction, other single digits are exact. `j.` = in the air. |
| `kind` | `normal`, `special` or `super`. Inferred from `input` if missing (a motion = special, a double motion like `236236` = super). A special with a two-button input is an **EX** move. |
| `startup` | Frames until the first active frame, counting it (a 4-frame move hits on its 4th frame). |
| `active` | Frames the hitbox is out. |
| `recovery` | Frames after the last active frame. Total length = startup − 1 + active + recovery. |
| `damage` | Base damage. |
| `hitstun`, `blockstun`, `hitstop` | Frames. |
| `pushbackHit`, `pushbackBlock` | How far the defender slides (px). |
| `selfPushback` | How far the attacker slides back when the defender is cornered (px). |
| `guard` | `high` (blocked standing only), `mid` (either), `low` (crouching only), `unblockable`. |
| `reach` | How far forward the move reaches (px). Informational: the CPU and the frame readout use it. |
| `hitboxes` | `[[x, y, w, h], ...]` during active frames. `x` is forward from the fighter's feet, `y` is up. |
| `hurtboxes` | Hurtboxes for the whole move (default: the stance's hurtbox). |
| `counterHit` | `"all"` (default: the whole move is in counter-hit state), `"startup+active"`, or `"none"`. |
| `negativeEdge` | `true` lets releasing the button fire the move. |
| `sprite` | `{ image, columns, rows, count, holds, frameW, frameH, originX, originY, scale }`. `image` is a path inside the character's folder, and only `sheets/` is shipped with the game (raw art can sit anywhere else in the folder). `holds[i]` = game frames sprite `i` shows; missing = spread evenly; a move lasts startup − 1 + active + recovery frames (startup counts the first active frame). `scale`: sheets stored larger than game size are drawn at this scale (0.5 = stored at 2×). Make sheets with `node scripts/sprite-prep.mjs` (below). |
| `chip` | Damage dealt through a block (default 0). |
| `blockHitstop` | Hitstop on block (default: `hitstop`). |
| `airBlockable` | `false` = can't be blocked in the air (default `true`). |
| `knockdown` | `true` = knocks a standing opponent down. |
| `launch` | `{ x, y }` px/frame: sends the defender into the air (x = away from the attacker). |
| `airHit` | `{ x, y }`: how an airborne defender is knocked away (default in `battle.json`). |
| `throwboxes` | `[[x, y, w, h]]` during active frames: makes the move a throw (checked against the defender's throw-hurtbox). A throw only comes out when its box would reach an opponent who can be thrown right now; otherwise the input falls through to the next move it matches. So a strike can share a throw's input (Avner's `4H`: back throw up close, Back Heavy from farther; list the throw first), and `6H` out of range gives `5H`. |
| `throwDistance` | px between the fighters while the throw holds (default 70). |
| `throwSwap` | `true` = a back throw: the defender lands on the other side. |
| `pull` | `{ to, frames }`: on hit (not block) the defender slides toward the attacker, ending `to` px in front of them, over `frames` frames, from any range and in the air too. Replaces pushback. |
| `perCombo` | `n`: the move can be used at most `n` times in one combo (it won't come out again until the combo ends). Stops loops. |
| `hitRequires` | A condition on the attacker (same shape as `requires`), read when the hitbox touches: unmet, it touches nothing at all (Anchor only hits a branded opponent). |
| `stagger` | `{ when, hitstun }`: extra hitstun when the attacker meets `when` at the moment of the hit (read before the hit's own `onHit`). |
| `onHitState` | On hit (not block) the attacker switches to this state: an animation branch (a catch). |
| `remote` | `true`: the hit lands wherever the opponent is, with no box check (it still respects invincibility and `guard`). |
| `oneAtATime` | A projectile name: the move can't start while the fighter has one of those out. |
| `anyDir` | `true`: a plain-button input (`"L"`) that works whatever direction is held (stance follow-ups; pair with `neutral: false`). |
| `nextIf` | `[{ when, to }]`: when the move ends, go to the first `to` whose condition holds, else `next`. |
| `chain` | Drawing only. `{ hand: [x, y], hands: { "<sprite frame>": [x, y] }, retract, headLength, segment: sprite, head: sprite }`: a chain drawn from the hand (px from the feet, x forward) to the far tip of the hitbox while it's out, reeling back in over `retract` frames; once the move hits, it runs to the opponent and stays attached while they're pulled in. `hands` (optional) gives the hand point per sprite frame index, for art where the hand moves; `hand` is the fallback. `segment` is tiled along it, `head` sits at the tip. |
| `hitFx` | Drawing only. `{ sprite, hold }`: an animation played where the move hits (each drawing held `hold` game frames; it plays through hitstop), instead of the generic spark. |

Version 2 adds per move:
- `timeline`: extra frame events (below), applied after the generated ones.
- `cancels`: `[{ from, to, into: [...], on: ["hit", "block", "whiff"] }]`. `into` holds move ids or groups:
  `#normal`, `#special`, `#super`, `#jump`. `from`/`to` are frame indexes (0 = first frame).
- `stance`: `stand`, `crouch`, `air`. Inferred from `input`.

### Combo fields (version 2)

| Field | Meaning |
| --- | --- |
| `starterProration` | Percent (out of 10000) applied once if this move starts the combo. Default in `data/system/combo.json`. |
| `comboProration` | Percent applied every time this move hits in a combo. |
| `untech` | Frames an airborne opponent can't air-tech after this hit (default: `hitstun`). |
| `launcher` | `true`: on hit, pressing up goes straight into a super jump to follow. |
| `wallBounce` | `{ x, y }`: the opponent rebounds off the wall at this speed. Once per combo unless `bounceLimit` says more. |
| `groundBounce` | `{ y }`: the opponent bounces off the floor instead of being knocked down. |
| `bounceLimit` | How many bounces of each kind this move allows per combo. |
| `specialCancel`, `superCancel` | Normals can cancel into specials and supers on hit or block by default; `false` turns it off, `"hit"` means hit only. |
| `jumpCancel` | `"hit"`, `"block"`, `true` (both) or `false` (default). |
| `cancelFrom`, `cancelTo` | Override the gatling window (default: first active frame to the end of the move). |

### Meter, specials and supers (version 2, Phase 8)

| Field | Meaning |
| --- | --- |
| `meter` | `{ hit, block, whiff }`: super meter this move builds. Default by `kind` in `data/system/meter.json`. Whiff meter is paid when the move ends without touching anything. |
| `cost` | `{ meter, gauge, vars: { name: n } }`: paid when the move starts; the move can't be done without it. Default: `superCost` (one bar) for supers, `exCost` (half a bar) for EX moves, nothing otherwise. If an EX can't be afforded, the one-button version comes out instead. |
| `requires` | `{ gauge: n, vars: { name: n or [min, max] } }`: must be true to start the move; nothing is spent. |
| `onHit`, `onBlock`, `onWhiff` | `{ meter, gauge, vars: { name: +n } }`: changes to the attacker's resources when the move hits, is blocked or whiffs. |
| `neutral` | `false`: the move only comes out from a cancel window that names it. For chain follow-ups ("214L, then L, then L"): the follow-up's input can be a plain button without taking that button over in neutral. |

**EX upgrade:** if the one-button version starts and the second button arrives within `chordWindow` frames, the move
becomes the EX version (the one-button cost is refunded).

### `mechanic` (top level, version 2): the character-specific slot

```json
"mechanic": {
  "name": "Charge",
  "gauge": { "max": 5000, "start": 0, "perFrame": 0, "onHit": 0, "onBlock": 0, "onHurt": 0, "label": "Heat" },
  "vars": { "charge": { "start": 0, "min": 0, "max": 3, "perFrame": 0, "label": "Charge", "show": true } },
  "modifiers": [{ "when": { "vars": { "charge": [3, 3] }, "gauge": 0 }, "damagePct": 11000 }]
}
```
A **gauge** (one number with a max) and named **vars** (small counters, clamped to min/max, ticking by `perFrame`).
A var can also say how it's shown (drawing only): `"display": "timer"` shows frames as seconds in the HUD (and
nothing at 0), and `"mark"` puts a mark on the opponent while the var is above 0 (Avner's brand): a colour
(`"#rrggbb"`, a drawn ring), or `{ color, at, hold, sprite }` (an animation looping on the opponent `at` px up,
each drawing held `hold` frames). It fades out over the last second.
For an install (a timer on the fighter themself) a var takes two more drawing-only fields, both active while it is
above 0: `"aura": [{ effect, behind }]` loops named `effects` on the fighter (each drawing held the effect's `hold`
frames; an effect may add `alpha`, `bob: { px, period }` to float up and down, and `"additive": true` on its sprite
for light), and `"art": { "idle": "installIdle" }` draws one state with another state's drawings.
Moves use them through `cost`, `requires`, `onHit`/`onBlock`/`onWhiff` and the `addVar`/`setVar`/`gauge`
timeline events. **Modifiers** apply while their `when` holds; `damagePct` multiplies the damage dealt. A move or
event naming a var that isn't declared is an error when the file loads. The HUD shows the gauge and every var with
`show` (default true).

### `palettes` (top level, version 2): colour swaps

```json
"palettes": {
  "base": ["#d9534f", "#ff8a7a", "#7a2622"],
  "colors": [
    { "name": "Ember", "colors": ["#d9534f", "#ff8a7a", "#7a2622"] },
    { "name": "Tide", "colors": ["#3f7fcf", "#8ac2ff", "#1c3566"] }
  ]
}
```
Sprite sheets are drawn using **only the `base` colours** (plus transparency): an indexed palette. Each entry in
`colors` swaps base colour i for its colour i, pixel for pixel; the first entry is normally the original. Every set
needs exactly as many colours as `base`, all `#rrggbb` (checked when the file loads). Until a character has
sprites, its placeholder figure uses colours 1-3 (body, limbs, detail). Missing palettes = four default sets. A sheet
pixel that isn't a base colour stays as drawn (the browser console warns).

### `gatlings` (top level, version 2)

`{ "5L": ["5L", "2L", "5M"], ... }` — which moves each move chains into, on hit or block. Use
`{ "into": [...], "on": ["hit"] }` for hit-only routes.

## Timeline events

`{ "at": frame, ...fields }`, or `{ "from": a, "to": b, ...fields }` / `{ "from": a, "for": n, ...fields }` for a range.
Frame numbers (`at`, `from`, `to`, `for`, a state's `duration`, cancel `from`/`to`) can name a stat: `"@dashFrames"`. Frames are 0-indexed. Lasting
fields (boxes, sprite, flags) hold until changed. One-shot fields fire once, on the frame they name.

| Field | Lasting / one-shot | Meaning |
| --- | --- | --- |
| `sprite` | lasting | `{ sheet, index }` or a number (index on the move's own sheet). |
| `hit` | lasting | Hitboxes `[[x,y,w,h]]`; `[]` removes them. Each new `hit` event is a new hit (multi-hit moves). Optional `hitProps` overrides frame data for that hit (same fields and units as the move; only the ones named). |
| `hurt`, `push`, `throw`, `throwHurt` | lasting | Box sets. |
| `invuln` | lasting | `{ "strike": true, "throw": false }` |
| `armor` | lasting | Number of hits absorbed (0 = none). |
| `counter` | lasting | Counter-hit state on or off. |
| `gravity` | lasting | On or off. |
| `vel` | one-shot | Set velocity `{ x, y }` (px/frame; x is forward). Missing axis = unchanged. |
| `addVel` | one-shot | Add to velocity. |
| `velScale` | one-shot | Scale velocity by a percentage out of 10000 `{ x, y }` (an airdash keeping 30% of its speed). |
| `sound`, `fx` | one-shot | Cue names for the renderer and audio. An `fx` name listed in the file's top-level `effects` plays that sheet: `{ "haloArc": { hold, at: [x, y], sprite } }` (drawing only; `at` is px from the feet, x forward; `hold` = game frames per drawing). |
| `jump` | one-shot | Engine hook: launch a jump from the stats (`"normal"`). |
| `superFlash` | one-shot | Frames of super flash: the whole game freezes and the screen dims (presses made during it are kept). |
| `meter`, `gauge` | one-shot | Add meter / mechanic gauge (negative to spend). |
| `addVar`, `setVar` | one-shot | `{ name: n }`: change a mechanic var. |
| `toOpponent` | one-shot | `{ to, frames }`: slide to the opponent, stopping `to` px in front of them, over `frames` frames (never past them; pushboxes still apply). |
| `spawn` | one-shot | A projectile name (top-level `projectiles`): one appears at its `spawn` offset, facing the way the fighter faces. |

## `states` (top level): a character's own states

Overrides for system states (`"walkF": { "duration": 48 }`), and new states of the character's own: stances and
animation branches. A new state takes `duration`, `loop`, `loopFrom`, `next`, `nextIf`, `cancels`, `timeline`, a
`sprite` (like a move's), and:

| Field | Meaning |
| --- | --- |
| `timeout`, `timeoutTo` | Frames in the state, loops included, before it leaves by itself to `timeoutTo`. |
| `onBack` | Holding back leaves to this state (a follow-up pressed on the same frame wins). |
| `layers` | Drawing only: `[{ effect, behind }]`, named `effects` drawn with the state, one pass of the effect per pass of the state. |

## `projectiles` (top level)

`{ name: { speed, spawn: [x, y], hitbox: [x, y, w, h], lifetime, ...frame data, sprite, anim } }`. Pixels and frames.
A projectile is an object in the game state (`game.projectiles`: owner, kind, x, y, facing, age). Its position is
its leading edge; `hitbox` is measured from there (x forward). It flies `speed` px a frame, hits once with its own
frame data (the move fields: `damage`, `hitstun`, `blockstun`, `hitstop`, `guard`, pushbacks, `onHit`, `stagger`,
`hitFx`), and ends on hit, on block, on touching an opposing projectile (both end), past the stage wall, or after
`lifetime` frames. Its hit is its owner's hit (damage, meter, combo) but puts no hitstop or pushback on the owner.
Drawing only: `sprite` (with `additive: true` for light on black) and `anim: { release, loop, impact }`, hold lists
over the sheet's frames in that order; the impact frames play where it ended (cue `projectileEnd`).

## Making a sprite sheet

All options are listed at the top of `scripts/sprite-prep.mjs`. Fighter strips:
`node scripts/sprite-prep.mjs <drawn strip.png> data/characters/<id>/sheets/<move>.png --frames N [--order 1,4,3,...] [--height 180] [--res 2] [--anchor front|rear|center|slot] [--floor frame|common|<y>] [--tilt 2:12,3:12]`
(`--anchor center --floor common` for moves that travel or leave the ground; `--scale k` to size a crouching
move like the standing ones: every run prints the scale it used; `--order` may list only some frames, e.g. `1,2,3,6`). Effects in a grid:
`--grid 4x2 [--count 7] --size 110 --key black` (glow drawn on black). Art that already has transparency keeps it.

Takes a strip of drawings on a flat background colour (read from the top-left pixel, e.g. magenta), drawn facing
right, left to right. It removes the background with soft edges (no coloured fringe), splits the strip into N
drawings (drawings may touch: each connected piece stays with the drawing it mostly belongs to), puts them in
`--order` (numbers as drawn), stands every frame on one floor line, keeps the planted foot (`--anchor`, front by
default) in the same place, and scales the last frame in the order to `--height` game px, stored at `--res`×. It
prints the `sprite` block to paste into the move (add `holds`).

## Stages (`data/stages/<id>.json`)

Drawing only: every stage plays the same (size and walls are in `battle.json`). `{ id, name, layers: [...] }`,
drawn first to last; each layer has a `type` and a `parallax` (0 = fixed to the screen, 1 = moves with the floor).
Heights are pixels above the ground line.

| Type | Fields |
| --- | --- |
| `sky` | `stops`: `[[0..1, colour], ...]` top to ground |
| `sun` | `x` (from centre), `height`, `radius`, `color`, `glow` |
| `ridge` | `height`, `variation`, `roughness` (bumps across), `seed`, `color` (a mountain line) |
| `haze` | `height`, `thickness`, `color`, `alpha` |
| `arches` | `spacing`, `width`, `height`, `thickness`, `broken` (0..1 share), `seed`, `color` |
| `railing` | `height`, `postSpacing`, `color` |
| `floor` | `top`, `bottom` (gradient), `line`, `tile` (seam spacing); always the last layer |

## Universal mechanics (system data)

- **Meter** (`data/system/meter.json`): `barSize`, gains by kind, `victimGainPct` (the defender builds this
  share of the damage taken), `exCost`, `superCost`. Bars per character: `stats.meterBars` (default 3),
  `stats.meterStart`.
- **Burst** (`data/system/burst.json`): `enabled`, `buttons` (default `"HS"` pressed together), `gaugeMax`,
  `start`, `perFrame`, `hurtPct` (gauge from damage taken), `states` (where it's allowed: being comboed) and the
  `burst` / `burstAir` moves every character gets (invincible, knocks the attacker away, ends the combo).
- **Match** (`data/system/match.json`, versus only): `roundsToWin`, `timerSeconds` (0 = none; both also in the
  Settings menu), `introFrames`, `koFrames`, `timeupFrames`, `meterCarries`, `burstRefillsEachRound`,
  `koLaunch` `{ x, y }` (px/frame, how a standing fighter is knocked down by the final hit).

## System states

Every character gets the states in `data/system/common-states.json` (idle, crouch, walks, jump, landing, and the
hit, block and knockdown states). A character can override any of them under `states` (version 2), or by giving a
move in its version 1 export the same `id` (useful for sprites: a move with `"id": "idle"` gives idle its sheet).
Stun states (hit, block) last as long as the stun: their art plays once through its `holds`, then the last drawing
stays (a block: the pushed-back drawing, then the guard).
