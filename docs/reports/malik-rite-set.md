# Malik's Rite set (owner's brief, Nov 25 2026; branch `malik-rite-set`)

All data, no `src/` change. Tests: `tests/rite.test.js`. Every number is a first guess for play-testing.

## What each move is now

| Move | Input | In the file | Timing | Notes |
| --- | --- | --- | --- | --- |
| Guardian Palm | 5R (6R too) | `rite_5` + `palm5` | palm on frame 12, 22 recovery | unchanged |
| Guardian's Judgment | j.R | `rite_j` + `palmJ` | opens on the opponent on the clap (frame 11), strikes 11 frames later | spawn `{ name, under: "opponent" }`; box 50 wide, floor to 250 px; high; hard launch; `perJump: "rite"` |
| Guardian's Wrath | 4R | `rite_4` + `ward` | burst on frame 12, 24 frames open after | strike and projectile invincible frames 1-11 (`invuln` in the timeline), not throws; box 220 wide, up to 304 px |
| Ancestor's Seal | 2R | `rite_2` + `palm2` | orb on frame 13 | speed 0, 180 frames, low; `endProjectile` one frame before the new one, so one at a time |

- The gauge (3 charges, 240 frames each, free during Install), the HUD pips with the refill arc, and "nothing with 0
  charges" were already built and tested; they are unchanged.
- 4R's Startup reads 5 in the editor: by this file's convention startup is the frame the projectile appears (the
  sphere); the burst is 6 frames into the sphere's life (`ward.phases`). Raising Startup moves the invincibility too.
- j.R follows the opponent's position along the floor only. Its box is tall instead of following their height.

## Removed

- 6R Guardian Palm (rising): move `rite_6`, projectile `palm6`. Forward + R is 5R. Sheets `rite-6.png` and
  `palm-6.png` stay on disk, unused.
- 2R as a low hand travelling along the ground: the orb now stays put.
- j.R's hand erupting from the ground a fixed step in front of him (the Nov 22 rule): replaced by the tracking burst.
- 4R Guardian Ward as a plain burst with no invincibility (it was 8 + 6 frames, 26 recovery).

## Art

| Move | Body | Effect | Missing |
| --- | --- | --- | --- |
| 5R | `rite-5` (Rite Neutral) | `palm-5` | nothing |
| j.R | `rite-j` (Rite Air) | `clap` sheet, used twice: on his hands and as the burst on the opponent | the two portals and beams (stand-in: the clap sheet) |
| 4R | `rite-4` (Rite Back) | `ward` | nothing |
| 2R | `rite-2` (Rite Down) | `palm-2` (the rolling orb, spinning in place) | the hovering orb with orbiting runes |
| empty gauge | none | none | an "empty" gesture, if wanted (R does nothing now) |

## 4R against 623 Resilience Pillar

| | 4R Guardian's Wrath | 623 Pillar L / M / H |
| --- | --- | --- |
| Hits on frame | 12 | 15 / 18 / 22 |
| Invincible | fully, to strikes and projectiles, frames 1-11 | not at all. M only ducks: no upper-body hurtbox for 25 frames |
| Where it hits | all round him, 105 px each side, up to 304 px | only in front, 55 to 135 px, up to 290 px |
| After it | 24 frames open; blocked, the blocker is free at least 8 frames first | 18 / 22 / 26 recovery |
| Cost | one Rite charge | nothing |

In the data the Pillar is not an invincible reversal, so he has one, not two. If the Pillar is meant to be
invincible, that would be the pair to worry about.

## Open

- Two tests of the box editor's preview fail (`tests/move-editor.test.js`: "preview: a projectile entry..." and
  "hit settings: ..."): `src/editor/preview.js` reads a spawn as a plain name and j.R's is now
  `{ name, under }`. Until that is fixed the editor does not show Judgment's hit settings under j.R.
- A cost of 2 charges for 4R needs a rule in `src/core` (a move spends exactly one today). Longer recovery is data.

## Energy Sphere into Rite (owner, Nov 25, later)

236 L / M / H carry `cancels` into `rite_5`, `rite_4`, `rite_2` from the frame after the orb spawns (15 / 19 / 24) to the end of the move, on hit, block or whiff. A cancel spends a charge like any Rite move; with none there is no cancel. Before the orb is out there is no cancel, so the sphere is never lost.

## 2R under the opponent (owner, Nov 25, later still)

`rite_2` spawns `{ name: "palm2", under: "opponent" }`: the orb rises under the opponent wherever they stand (their place on the floor on frame 13), then stays there 180 frames. It can hit on the frame it rises. This replaces "a short distance in front of him" in the table above.
