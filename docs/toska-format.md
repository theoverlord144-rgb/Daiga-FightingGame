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
| `input` | Command in numpad notation: `5L`, `2M`, `6H`, `j.H`, `236L`, `j.214S`, `[4]6H`, `5R`, `22HS` (two buttons = a chord: pressed together, up to `chordWindow` frames apart in either order). Buttons: `L`, `M`, `H` (the attack buttons), `S`, `R` (Rite). `5` = any non-down direction, `2` = any down direction, other single digits are exact. `j.` = in the air. |
| `kind` | `normal`, `special` or `super`. Inferred from `input` if missing (a motion = special, a double motion like `236236` = super). A special with a two-button input is an **EX** move (written by hand; the usual way is the `ex` field below). |
| `ex` | `{ ...overrides }` on a special whose input is a motion + `L`, `M` or `H`: its **EX version**. The engine builds a second move, `<id>_ex`, from this move with the overrides laid over it (a field named in `ex` replaces the move's own whole, so an `ex.timeline` replaces the timeline; `"hitboxes": null` drops them). Input: the same motion and attack button plus `S`. It costs `exCost` (one bar), takes the move's gatling row, and goes wherever the move can (cancels that name the move take its EX too). With no `sprite` of its own it is drawn with the move's. |
| `startup` | Frames until the first active frame, counting it (a 4-frame move hits on its 4th frame). |
| `active` | Frames the hitbox is out. |
| `recovery` | Frames after the last active frame. Total length = startup − 1 + active + recovery. |
| `damage` | Base damage. |
| `hitstun`, `blockstun`, `hitstop` | Frames. |
| `pushbackHit`, `pushbackBlock` | How far the defender slides (px). |
| `selfPushback` | How far the attacker slides back when the defender is cornered (px). |
| `recoil` | How far the attacker slides back every time the move touches, on hit or block (px, default 0). Adds to the corner slide. Not for projectiles. |
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
| `launch` | Sends the defender into the air. `"hard"` (the S launchers: high, super-jump cancel on hit, one per combo: another acts as a soft launch) or `"soft"` (a short pop, jump cancel on hit unless `jumpCancel` says otherwise; costs juggle), at the speeds in `data/system/combo.json`; or `{ type, x, y }` with its own speeds in px/frame (x = away from the attacker; no `type` = soft). |
| `juggleCost` | What this move adds to the combo's juggle total when it hits an airborne fighter, or soft-launches a grounded one. Default in `data/system/combo.json` (`juggleCost` 1, `softLaunchCost` 3). Past `juggleLimit` the fighter falls out: damage, but no untechable time, launch or bounce. |
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
| `launcher` | `true`: the older way to say `launch` type `hard` (on hit, pressing up goes straight into a super jump to follow). |
| `wallBounce` | `{ x, y }`: the opponent rebounds off the wall at this speed. Once per combo unless `bounceLimit` says more. |
| `groundBounce` | `{ y }`: the opponent bounces off the floor instead of being knocked down. |
| `bounceLimit` | How many bounces of each kind this move allows per combo. |
| `specialCancel`, `superCancel` | Normals can cancel into specials and supers on hit or block by default; `false` turns it off, `"hit"` means hit only. |
| `jumpCancel` | `"hit"`, `"block"`, `true` (both) or `false` (default). |
| `cancelFrom`, `cancelTo` | Override the gatling window (default: first active frame to the end of the move). |

### Meter, specials and supers (version 2, Phase 8)

| Field | Meaning |
| --- | --- |
| `meter` | `{ hit, block }`: Devotion points this move builds on hit / when blocked, in place of the usual amount from its damage (still times the character's give). Leave it out for the usual rule (`data/system/systems.json`). A whiff builds nothing. |
| `cost` | `{ meter, gauge, vars: { name: n } }`: paid when the move starts; the move can't be done without it. `meter` is in Devotion points (a bar is 100). Default: by `level` for supers, `exCost` (100) for EX moves, nothing otherwise. `meterCost: n` is a short way to set just the Devotion cost. If an EX can't be afforded, the one-button version comes out instead. |
| `level` | Supers only: `1` (costs 100 Devotion, the default) or `3` (costs 300). The costs are `superCost` in `data/system/systems.json`. |
| `requires` | `{ gauge: n, vars: { name: n or [min, max] } }`: must be true to start the move; nothing is spent. |
| `onHit`, `onBlock`, `onWhiff` | `{ meter, gauge, vars: { name: +n } }`: changes to the attacker's resources when the move hits, is blocked or whiffs (`meter` in Devotion points, added as written: no give multiplier). |
| `neutral` | `false`: the move only comes out from a cancel window that names it. For chain follow-ups ("214L, then L, then L"): the follow-up's input can be a plain button without taking that button over in neutral. |

**EX upgrade:** if the one-button version starts and the second button arrives within `chordWindow` frames, the move
becomes the EX version (the one-button cost is refunded).

**S next to an attack button** (`pickCommand` and `decide` in fighter.js): S pressed within `chordWindow` frames
of L, M or H, in either order, is never the S move. With a motion and a full bar it is the EX version; otherwise the
attack button's own move comes out and that S press is used up. If the S move (a launcher) had already started when
the attack button arrived, it is swapped for what the attack button asks for, at no cost and with no whiff meter
(after a cancel only a special or super may take over, never a normal the chain didn't allow).

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
| `meter`, `gauge` | one-shot | Add Devotion (points) / mechanic gauge (negative to spend). |
| `addVar`, `setVar` | one-shot | `{ name: n }`: change a mechanic var. |
| `toOpponent` | one-shot | `{ to, frames }`: slide to the opponent, stopping `to` px in front of them, over `frames` frames (never past them; pushboxes still apply). |
| `spawn` | one-shot | A projectile name (top-level `projectiles`): one appears at its `spawn` offset, facing the way the fighter faces. |

`spawn` may also be `{ "name": ..., "x": px, "y": px, "under": "opponent" }`: this one appears `x` px in front (instead
of the projectile's own spawn offset), or directly under the opponent. `endProjectile` (one-shot): a projectile name;
the fighter's own projectiles of that kind end this frame.

More move fields: `perJump` (a group name: one move of that group per jump, until the fighter lands), `oneAtATime` (a projectile name or a list: the move can't start while one is out), `needsOut` (a
projectile name: the move only starts while one is out), `hitsAirborne: false` (the hit passes through a fighter in
the air), `noZoneMark: true` (this hit never adds a zone's mark), `pinFx: { effect, fromSprite }` (drawing only: a
named effect pinned to the lantern point of each drawing, from that drawing on).

## `art` (top level): a character's own drawing rules

Drawing only; the rules never read it. `byVy: { states, pick: [{ above, index }] }` picks an air drawing by vertical
speed (px a frame, up positive; the first row whose `above` the speed is over). `exit: [{ from, into, after, sprite,
frames, holds }]`: leaving `from` for one of `into` (after at least `after` frames there), those drawings play first.
`guard: { range, stand, crouch, air }` (each `{ sprite, index }`): shown while holding back with the opponent
attacking within `range` px. `lantern: { sprite, at }`: one drawing per full bar of Devotion, drawn at `at[sheet
image][drawing]` = [px forward, px up] from the fighter. An effect (`effects`, `hitFx`) may give `holds` (frames per
drawing) instead of one `hold`.

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

More projectile fields: `endsOnGround: true` (it ends when it reaches the floor), `endFx: { why: effect }` (drawing only: a
named effect played where it ended; why = `hit`, `block`, `ground`, `edge`, `clash`, `recall`), `phases: [[fromAge, toAge, box or null]]` (the hitbox is out only at those ages; null = its
`hitbox`), `persist: true` (it stays after its hit, hits once, never clashes), `noHit: true` (it never hits: a light,
a beam that is only seen), `zone: { box, gravityPct, markVar }` (an opponent inside falls at that share of their
gravity; a hit the owner lands on them there adds 1 to the owner's var), `onEnd: { setVar: { name: n } }` (set on the
owner when it ends, however it ends), `ownerOnHit` (a state the owner switches to on hit, if still in the move that
made it), `hitsAirborne`, `pull`.

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

- **Vow** (`vow` in `data/system/systems.json`: its numbers and the three strikes as ordinary moves). Move fields:
  `pierce: true` (the move hits through Vow's guard; supers and throws always do) and `crumple: true` (a grounded
  hit puts the opponent in the crumple). To give a character its own art or boxes for Vow, list a move with the id
  `vow_start`, `vow_strike_quick`, `vow_strike` or `vow_strike_full` (only the fields you write replace the
  universal ones), or a state `vow_hold` / `crumple` under `states`.
- **Art slots of the universal systems.** Every character has these states and moves whether it lists them or not:
  `vow_start`, `vow_hold`, `vow_absorb`, `vow_strike_quick`, `vow_strike`, `vow_strike_full`, `absolve`,
  `absolve_air`, `absolve_recovery`, `absolve_recovery_air`, `repel`, `draw`, `drawn`, `crumple`. To give one its art,
  list an entry in `moves` with that `id` and a `sprite` (nothing else is needed; the rules stay the universal ones).
  For a move, the sprite's `holds` must add up to the move's length. `scripts/make-slot-placeholders.mjs` fills
  every empty slot with a copy of one of the character's own sheets, named `sheets/<slot>-placeholder.png`.
  Effect slots are in `data/system/effects.json` under `slots`.
  A state's art-only entry goes with a `states` override when the drawings need a different length
  (Malik: `"vow_hold": { "duration": 36 }` for his loop, `"vow_absorb": { "duration": 14 }` for the absorb pose).
- **A projectile that erupts from the floor**: `"fromGround": true` on the projectile (a rule). Its `spawn` height
  is then measured from the floor, not from the fighter, so it starts in the same place however high they are
  (Malik's j.R: `"spawn": [110, -150]`, rising 14 px a frame, so it has no hitbox up in the air).
- **Where a projectile's sheet is drawn** (drawing only, inside its `sprite`): `"ground": true` stands the sheet on
  the floor under the projectile; `"rooted": true` keeps it where the projectile's path began (a hand growing
  out of the fighter's palm while the hitbox travels along it); `"angle": 45` tilts an upright sheet forward by
  that many degrees.
- **Rite** (the R button), top level of the character file:
  `"rite": { "gauge": { "charges": 3, "rechargeFrames": 240, "unlimitedWhile": "install" } | null, "moves": ["rite_5", ...] }`.
  `moves` lists ids of moves in the character's own `moves` whose input uses R (`5R`, `2R`, `6R`, `j.R`); they count
  as specials unless they set `kind`. With a `gauge`, each use spends a charge; charges refill one at a time, each
  taking `rechargeFrames`; `unlimitedWhile` names a mechanic var, and while it is above 0 nothing is spent.
  `null` gauge = no limit. Projectiles take `speedY` (pixels per frame, up is positive) beside `speed`.
- **Absolve, Repel, Draw** (`absolve`, `repel`, `draw` in `data/system/systems.json`; the Absolve move itself is in
  `data/system/burst.json`, whose notes explain it). Move field `onBlockState`: when the move is blocked the attacker
  switches to that state. State field `blocking: true`: the state counts as a block state. Like Vow, a character can
  lay its own art or boxes over `absolve`, `absolve_air`, or the states `absolve_recovery`, `repel`, `draw`, `drawn`.
- **Counters, Witness, Perfect Link** (`counter`, `witness`, `perfectLink` in `data/system/systems.json`; the file's
  notes explain every number). A move's `counterHit: "none"` makes it immune to both kinds of counter;
  `"startup+active"` makes its recovery safe from Witness only.
- **Devotion** (the meter; `devotion` in `data/system/systems.json`, every field explained in that file's notes).
  Written in Devotion points: `barSize` 100, `exCost` 100, `superCost` by level `{ "1": 100, "3": 300 }`,
  `gain` (`hitPerPct` 3, `blockedPerPct` 1, `special` 5, `perfectLink` 2, `hurtPerPct` 2, `vowAbsorb` 0.5),
  `takeCapPerCombo` 150, and the `archetypes` presets (balanced, martyr, zealot, penitent, trickster: `give`,
  `take`, `extras`). `unit` (100) is how many game units a point is: the game keeps whole numbers only, so a bar
  is 10000 units in `p.meter`. Bars per character: `stats.meterBars` (default 4), `stats.meterStart` (points).
- **A character's Devotion profile**: top-level `"meter": { "archetype": "penitent" }` in its file (default
  balanced). Optional overrides beside it: `give`, `take` (plain multipliers, `0.6`) and `extras` (any of
  `vowAbsorb`, `perfectLink`, `witness`, `guardPerPct`, `repel`, `drawRefund`, `variety { newMove, repeat,
  switch }`), each replacing the preset's value.
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
