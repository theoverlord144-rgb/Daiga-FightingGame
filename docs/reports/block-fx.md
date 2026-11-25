# The block effect and see-through effects (Nov 25)

Look only. No rule changed: the recorded match replays identically. Every number is in
`data/system/effects.json` (`opacity`, `blockFx`) and in each character's `art.opacity` line.

## Part 1: see-through effects

Every effect now has an opacity. Effects drawn as light are dimmed by it; the others become see-through.

| Kind | Opacity |
| --- | --- |
| Hit sparks (all seven strips, and a move's own hit effect) | 0.85; the first drawing, the flash, at 1.0 |
| Block effects | 0.75 (the block spark 0.85, as you gave it) |
| Big bursts: Lunar Halo, Full Moon, the supers' effects, Absolve, the super flash and slash | 0.8 |
| Trails and smears: lariat trails, Moonfall's trail, Avner's crescent slashes, the axe arc | 0.6 |
| Ground dust | 0.7 |
| Moonlight zone, Malik's install flames and motes | 0.55 |

My own calls, where you gave no number:

- **Projectiles 0.85** (Rising Moon's orb, Tide, the spirit orbs and hands). They carry a hitbox, so they should read.
- **Malik's guardian and the j.H spirit hand stay at 1.0.** They are the thing doing the hitting, not dressing.
- **Vow guard 0.75, crumple stars 0.85, Moonmark 0.8.** They tell the player something, so I kept them stronger than
  an aura.
- The air dash trail already had an alpha of 0.7; with its new number it comes to 0.6.

**Covering a fighter.** An effect whose drawn area covers more than half of a fighter's body loses a further 0.15
while it does. This is judged from rectangles (the effect's cell, shrunk to 70%, against the fighter's hurtboxes), so
it is approximate. It does not know where a face or a limb is; nothing in the game does yet.

**Settings menu:** "Effects opacity", 30% to 100% in steps of 10, default 100%. It multiplies everything above.

## Part 2: the block effect (third sheet, Nov 25: the glass guard)

One guard and one spark are the block effect. The sheet is now the glass oval: ten drawings, a glint crossing the glass
(1 to 4), then the glass breaking into a swirl of shards (5 to 10). Earlier versions (shield, sigil and sparks; the
spinning guard) are kept as cut strips in `block-fx/old-strips/`.

- **Where:** at the contact point, never nearer the defender's middle than 30 px, mirrored by the defender's facing.
  It follows the defender as they slide back, in front of the defender and behind the attacker's limb.
- **Look:** ordinary drawing (not light) at 0.8, 50% of a character's height. This sheet's faint glow and the mist
  in the breaking drawings are kept, since they are part of its own transparency.
- **Timing (mine: no holds came with this sheet):** drawing 1 for 2 frames at 85% size, then drawings 2 to 4 loop
  at 3 each while blockstun lasts, then drawings 5 to 10 at 2, 2, 2, 3, 3, 3.
- **Hitstop:** the guard and the spark play through the freeze (`blockFx.holdInHitstop` false; you asked for the
  hold to go twice, since it reads as the game freezing). Real hitstop, a game rule, is untouched.
- **Sparks (back at your word):** the normal spark on light and medium blocks, the heavy spark on heavy blocks and
  Repels, as light at 0.85 at the exact contact point, on top of the guard. Holds 1, 2, 2, 3, 3 and 1, 2, 2, 3, 3, 4.
- **Light** 80%. **Medium** 100%. **Heavy** (H, S and R normals, specials, supers, bigger projectiles) 115%, with a
  white copy over its first 2 frames.
- **Shard burst (your sheet for heavies and physical specials):** 7 drawings of white shards swirling outward, at
  the contact point, drawn flat at 0.9, 150 px tall at its largest, holds 1, 2, 2, 2, 3, 3, 3 (mine). It plays on
  blocked H, S and R normals, specials and supers that are the fighter's own body, together with the heavy spark.
  Blocked projectiles and Repels do not get it.
- **Block strings:** a new block on a guard that is still up goes back to drawing 1 at full size, then the loop
  goes on. One guard per defender.
- **Repel:** 130%, the white flash, breaks apart twice as fast, drifting 6 px toward the attacker.
- No extra rotation (`blockFx.spin` 0).

## Checks

- **Frame time** (headless Chrome, GTX 1660 Ti), on the busiest frame of a blocked L, M, H string ending in a Repel:
  0.97 ms a frame at 960x540 against 1.04 standing still; 2.29 ms at 1920x1080 against 1.73. The budget is 16.7 ms. There is one guard per defender, so two is the most that can ever be on screen.
- Tests: 461 in all, 457 pass; the 4 failures are the same ones as before this work.
- Build and draw smoke pass. The recorded match is identical on all 3,000 frames.
- **Not tried:** air blocks and blocked projectiles.

## Pictures

In `docs/reports/block-fx/`, from the real game over the terrace arches:

- `light-slow.gif`, `medium-slow.gif`, `heavy-slow.gif`, `string-slow.gif`, `repel-slow.gif`: one game frame at a
  time, 6 a second. `*-frames.png`: the same as stills.
- `spark-before-and-after.png`, `risingmoon-before-and-after.png`, `halo-before-and-after.png`: Part 1, unchanged.

Make them again with `node scripts/block-fx-shots.mjs <folder>` (dev server running).

## What to check

1. Do blocks still feel like a freeze? The effect now plays through hitstop; the fighters themselves still stop for
   the hitstop each move has, which is a rule and was not changed.
2. **The heavy spark's first frame is a white burst larger than the defender.** One frame, then it shrinks.
   **For its first 5 or so frames it also sits right on top of the shard burst**, so the shards mostly show
   once they have spread past it. If the shards should be the star on heavies, drop the heavy spark there
   (`blockFx.strengths.heavy.spark` to just "shards").
3. The guard's timing is fitted by me: how fast the glint crosses (3 frames a drawing) and how fast it breaks.
4. Size: at 115% the guard covers the defender's front from chest to knee.

## Taking it out

`node scripts/block-fx-remove.mjs` removes both parts: the marked code, the numbers, the lists in both character
files (by text; your tuning is not touched), the setting, the cut strips, the test and the tools. To only switch
off: `opacity.on` false, `blockFx.on` false. The removal script was not run again after this rewrite; the new code
is inside the same marks.

## Nov 25, later: no held drawings

Owner: "dont hold any frames for now. just let the animation play through normally." The guard no longer holds its middle drawings while blockstun lasts: all ten drawings play once, in order, at their frame counts (2, 3, 3, 3, then 2, 2, 2, 3, 3, 3 = 26 frames). A new block while it is up restarts it from the first drawing. In `data/system/effects.json`, `blockFx.loop` is empty; one line in the drawing code (approved) skips the hold when it is. To bring the hold back, put drawings back in `loop`.
