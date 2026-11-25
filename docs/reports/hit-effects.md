# Universal hit effects (Nov 25)

Your seven hit-effect sheets are in the game. Picture of each in play: `data/effects/previews/hit-effects-in-game.png`
(top row 3 frames after the hit, bottom row 7 frames after). The cut strips are beside it.

## What plays when

In this order, the first that applies:

1. **Witness counter**: the Witness strip (purple ring). The old placeholder flash is gone.
2. **Counter hit**: the Counter strip (red ring). The word COUNTER still shows.
3. **A move marked as a slash** (`"hitFx": "slash"` in its data): the Slash strip. No move is marked yet.
4. **A projectile's hit**: the Projectile strip (white).
5. **Everything else** by the move's base damage: light below 500, medium below 800, heavy above.

A move with its own hit art still shows that instead (Avner's 5L, Malik's three air normals), even on a counter.
Vow strikes keep their own flash. Blocks keep the old block flash.

## Timing and size

| Effect | Drawings | Holds | Total | Size (game px) |
| --- | --- | --- | --- | --- |
| Light | 5 | 1, 2, 2, 2, 2 | 9 | 130 |
| Medium | 6 | 1, 2, 2, 2, 3, 3 | 13 | 170 |
| Heavy | 8 | 1, 2, 2, 2, 3, 3, 3, 4 | 20 | 210 |
| Projectile | 6 | 1, 2, 2, 3, 3, 3 | 14 | 150 |
| Slash | 6 | 1, 2, 2, 2, 3, 3 | 13 | 190 |
| Counter | 6 | 1, 2, 2, 3, 3, 3 | 14 | 220 |
| Witness counter | 6 | 1, 2, 3, 3, 3, 3 | 15 | 230 |

The first five rows of holds are yours. **Counter and Witness holds are mine** (you gave none). **All sizes are
mine**: the sheets are not drawn to one scale (the heavy burst is drawn smaller than the light one), so each strip
is sized by a number in `scripts/hit-fx-prep.mjs`. Change a number, run the tool, and the size changes.

## Two things changed along the way

- **Rising Moon's plain orbs were renamed** inside Avner's file (`moonOrbL / M / H`). They had the same names as
  the moves that throw them, so the game sized their hit as the move's, not the orb's. Nothing about how they play
  changed: the recorded match replays identically apart from the name.
- **Malik's Spirit Orb has the same double name**, so its hit is treated as a strike (it shows the heavy burst, not
  the white projectile burst). Its punch and orb share the name on purpose so far; left alone until you say.

## Not wired

- `Game_Block_Effect.png` (the blue seal) is a single drawing, not an animation, and you did not mention it. Blocks
  still show the old flash.

## Checks

- 451 tests, 448 pass. The 3 failures are the same 3 as before (Back Heavy 4H in the archived kit, Vigil M crescent,
  Malik j.R). One new test covers the effect rules and strips, one that no Avner projectile shares a move's name.
- Build, draw smoke test and baseline pass. Baseline re-recorded for the orb rename only.
- Frame time on the real screen: 8.5 ms average, 13.6 worst 5% (8.4 / 14.6 before). No cost.

## What to play-test

- Are the sizes right against the fighters?
- Do the counter and Witness holds feel right?
- Which moves should be slashes?
