# The Toska character format

A character is one JSON file: `data/characters/<id>/<id>.toska.json`. The Toska editor exports it; the engine
imports it (`src/core/character.js`). Units in the file are **pixels** and **frames** (1/60 s). The engine converts
pixels to its integer units (1 px = 100).

## Versions

| Version | What it is |
| --- | --- |
| 1 | The editor's export: `{ engine: "Toska", version: 1, character, moves[] }`. Moves carry frame data, boxes and a sprite sheet. Always loads. |
| 2 | Version 1 plus everything the engine adds: `character.stats`, explicit `timeline` events per move, `cancels`, `states` (overrides for system states). Version 1 files are upgraded to 2 on load. |

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
| `sprite` | `{ image, columns, rows, count, holds, frameW, frameH, originX, originY }`. `holds[i]` = game frames sprite `i` shows; missing = spread evenly. |
| `chip` | Damage dealt through a block (default 0). |
| `blockHitstop` | Hitstop on block (default: `hitstop`). |
| `airBlockable` | `false` = can't be blocked in the air (default `true`). |
| `knockdown` | `true` = knocks a standing opponent down. |
| `launch` | `{ x, y }` px/frame: sends the defender into the air (x = away from the attacker). |
| `airHit` | `{ x, y }`: how an airborne defender is knocked away (default in `battle.json`). |
| `throwboxes` | `[[x, y, w, h]]` during active frames: makes the move a throw (checked against the defender's throw-hurtbox). |
| `throwDistance` | px between the fighters while the throw holds (default 70). |
| `throwSwap` | `true` = a back throw: the defender lands on the other side. |

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
Moves use them through `cost`, `requires`, `onHit`/`onBlock`/`onWhiff` and the `addVar`/`setVar`/`gauge`
timeline events. **Modifiers** apply while their `when` holds; `damagePct` multiplies the damage dealt. A move or
event naming a var that isn't declared is an error when the file loads. The HUD shows the gauge and every var with
`show` (default true).

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
| `hit` | lasting | Hitboxes `[[x,y,w,h]]`; `[]` removes them. Each new `hit` event is a new hit (multi-hit moves). Optional `hitProps` overrides frame data for that hit. |
| `hurt`, `push`, `throw`, `throwHurt` | lasting | Box sets. |
| `invuln` | lasting | `{ "strike": true, "throw": false }` |
| `armor` | lasting | Number of hits absorbed (0 = none). |
| `counter` | lasting | Counter-hit state on or off. |
| `gravity` | lasting | On or off. |
| `vel` | one-shot | Set velocity `{ x, y }` (px/frame; x is forward). Missing axis = unchanged. |
| `addVel` | one-shot | Add to velocity. |
| `velScale` | one-shot | Scale velocity by a percentage out of 10000 `{ x, y }` (an airdash keeping 30% of its speed). |
| `sound`, `fx` | one-shot | Cue names for the renderer and audio. |
| `jump` | one-shot | Engine hook: launch a jump from the stats (`"normal"`). |
| `superFlash` | one-shot | Frames of super flash: the whole game freezes and the screen dims (presses made during it are kept). |
| `meter`, `gauge` | one-shot | Add meter / mechanic gauge (negative to spend). |
| `addVar`, `setVar` | one-shot | `{ name: n }`: change a mechanic var. |

## Universal mechanics (system data)

- **Meter** (`data/system/meter.json`): `barSize`, gains by kind, `victimGainPct` (the defender builds this
  share of the damage taken), `exCost`, `superCost`. Bars per character: `stats.meterBars` (default 3),
  `stats.meterStart`.
- **Burst** (`data/system/burst.json`): `enabled`, `buttons` (default `"HS"` pressed together), `gaugeMax`,
  `start`, `perFrame`, `hurtPct` (gauge from damage taken), `states` (where it's allowed: being comboed) and the
  `burst` / `burstAir` moves every character gets (invincible, knocks the attacker away, ends the combo).

## System states

Every character gets the states in `data/system/common-states.json` (idle, crouch, walks, jump, landing, and the
hit, block and knockdown states). A character can override any of them under `states` (version 2), or by giving a
move in its version 1 export the same `id` (useful for sprites: a move with `"id": "idle"` gives idle its sheet).
