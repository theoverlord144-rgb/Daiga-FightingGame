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
| `input` | Command in numpad notation: `5L`, `2M`, `6H`, `j.H`, `236L`, `j.214S`, `[4]6H`, `623HS`(two buttons: later). `5` = any non-down direction, `2` = any down direction, other single digits are exact. `j.` = in the air. |
| `kind` | `normal`, `special` or `super`. Inferred from `input` if missing (a motion = special). |
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

Version 2 adds per move:
- `timeline`: extra frame events (below), applied after the generated ones.
- `cancels`: `[{ from, to, into: [...], on: ["hit", "block", "whiff"] }]`. `into` holds move ids or groups:
  `#normal`, `#special`, `#super`, `#jump`. `from`/`to` are frame indexes (0 = first frame).
- `stance`: `stand`, `crouch`, `air`. Inferred from `input`.

## Timeline events

`{ "at": frame, ...fields }`, or `{ "from": a, "to": b, ...fields }` for a range. Frames are 0-indexed. Lasting
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
| `sound`, `fx` | one-shot | Cue names for the renderer and audio. |
| `jump` | one-shot | Engine hook: launch a jump from the stats (`"normal"`). |

## System states

Every character gets the states in `data/system/common-states.json` (idle, crouch, walks, jump, landing, and the
hit, block and knockdown states). A character can override any of them under `states` (version 2), or by giving a
move in its version 1 export the same `id` (useful for sprites: a move with `"id": "idle"` gives idle its sheet).
