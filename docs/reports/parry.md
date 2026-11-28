# The parry (Nov 28)

The owner is thinking of scrapping Vow and asked to experiment with a parry in its place. Built behind a switch:
`data/system/systems.json` `guardButton` is `"parry"`; set it to `"vow"` and Vow, Debt and the red bar are back
exactly as they were.

## What it does

- **M+H from neutral** (any direction; M then H a frame apart still counts). Not from a cancel, not in blockstun
  (there two attack buttons are Repel / Draw).
- **2 frames, then a 6-frame window.** A strike that lands in the window is parried: no damage, no stun, no combo.
  The attacker freezes for 12 frames; the defender is free at once (`parry_success`, a free state): attack, block,
  walk, or parry the next hit. +10 Devotion per parry.
- **A miss is stuck for 20 frames** and cannot block; a hit there is a Witness counter (recovery).
- **Goes through it:** throws, supers, moves with `pierce`. Projectiles are parried (used up).
- **Drawings:** none yet. It shows each character's Vow guard drawings, and its success shows the Vow absorb
  drawings and effect. Khai'ro and Toyle have no Vow art, so they show nothing special.

## Numbers (systems.json `parry`)

| Field | Value | Meaning |
| --- | --- | --- |
| startup | 2 | frames before the window |
| window | 6 | frames that parry |
| recovery | 20 | frames stuck after a miss |
| freeze | 12 | attacker's freeze on a parry |
| successFrames | 8 | length of `parry_success` (free throughout) |
| devotion | 10 | Devotion per parry |
| projectiles | true | projectiles can be parried |

First guesses, to be felt out in play. A light pressed after a parry beats the frozen attacker's recovery in
the tests; how much a parry is worth against each real character's strings is still to be tried.

## Code

- `src/core/systems.js`: `parryOn`, `world.sys.parry`, and in `universalContent` the move and state.
- `src/core/character.js`: kind `parry`; `catch` takes `projectiles` and `parry`; `borrowArt` / `artFrom`.
- `src/core/combat.js`: `parried` (Devotion, cue); a projectile meeting a `catch` with `projectiles` is used up.
- `src/core/fighter.js`: the EX-upgrade path never turns a cancelled normal into the parry.
- `data/system/effects.json`: cue `parry` plays `vow_absorb`.
- Tests: `tests/parry.test.js` (11). `tests/vow.test.js` runs with `VOW_SYSTEM` (helpers.js). The command lists in
  `character.test.js` / `avner-moves.test.js` name `parry_start`; `state.test.js`'s random fight moved to seed 4
  (seed 13 stopped having a block once the parry took M+H).
