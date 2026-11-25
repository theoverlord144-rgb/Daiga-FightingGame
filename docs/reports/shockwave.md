# Shockwave rings on big hits (Nov 25)

Look only. No rule changed, and every number is in `data/system/effects.json` under `shockwave`.

## What it is

**A true distortion, not a drawn ring.** After the fight is drawn and before the HUD, the finished picture is copied
and redrawn inside each ring in 18 thin circular bands, each enlarged a little about the ring's centre. That pushes
the picture outward: strongest at the ring's middle, zero at its inner and outer edges. It is done on the ordinary 2D
canvas, so the bend is in small steps, not per pixel; on pixel-art edges you can see fine ripples if you stop the
frame. The HUD is never bent.

- Radius grows fast then settles; thickness grows a little; strength fades to 0.
- A faint white edge (10%) rides the middle of each ring.
- Up to 9 rings at once; each has its own centre, start and numbers.
- Rings stand still while the fighter who was hit is frozen in hitstop, then play out. The first ring starts 2
  frames into its growth so it shows during the freeze.
- Everything scales with the camera zoom.
- **Not built: the red/blue colour split.** On this kind of canvas it needs two more copies of the picture per ring.
  A WebGL pass would give it for free; that is a larger change to how the screen is put together.
- Where the picture cannot be bent (the no-browser picture tools), the ring is drawn as a soft white ring only.

## When it plays

| Hit | Rings |
| --- | --- |
| H normals and heavy specials (listed per character, below) | the default pair |
| A counter or Witness counter with one of those moves; crumples; hard launchers; hard-knockdown slams; throws; ground and wall bounces | the pair at 1.3x |
| A super's last hit; the hit that ends the round | three rings at 1.6x and a brief whole-screen pulse |
| L and M hits, blocks | none |

The default pair is yours: ring 1 lives 16 frames, grows to 45% of a character's height, 18 to 30 px thick, 14 px of
push; ring 2 starts 4 frames later, 14 frames, 30%, 9 px. Ring 2's thickness (14 to 24 px) and the third super ring
are my numbers.

**One change from your wording.** You asked for a "shockwave" field on each move. The rules code only passes on move
fields it knows by name, and I had said I would not touch it. So the list is in each character's file under
`art.shockwave`, one line: `{ move or projectile: set }`. If you want it on the moves themselves (and in the HIT
SETTINGS page), that is a one-line addition to the rules code; say so.

Listed now. Avner: 5H, 2H, 4H kick, 3H, j.H, the heavy Rising Moon orb, Halo H, Tide H, both throws (1.3x), Full
Moon's column (super). Malik: 5H, 2H, Back Heavy, j.H, the guardian's heavy, Spirit Orb H, Pillar H, Lariat H and the
EX lariats, both throws (1.3x).

## Checks

- **Frame time with six rings on screen** (headless Chrome, GTX 1660 Ti): 0.8 ms a frame without, 2.0 ms with, at
  960x540; 1.7 ms without, 2.5 ms with, at 1920x1080. The budget is 16.7 ms.
- My first measurements said +25 to +130 ms. That was the measuring, not the effect: reading the canvas back every
  frame makes the browser move it off the graphics card. The same habit is in `baseline-screen.mjs`, so its 8.5 ms
  figure is probably pessimistic too. I have not re-measured that.
- **Not measured: a machine with no graphics card at all.** There, a bend like this could be slow. `"warp": false`
  in the data keeps the timing and draws only the light ring.
- Tests: three new ones for the numbers and the lists. Build and draw smoke pass.

## Captures

In `docs/reports/shockwave/`, taken from the real game over the terrace arches and railing:

- `heavy-slow.gif`, `counter-slow.gif`, `super-slow.gif`: one game frame at a time, 5 a second.
- `*-frames.png`: the first 12 frames side by side.
- `heavy-without-and-with.png`: the same frame with the effect off and on.
- `six-rings.png`: the timing scene.

Make them again with `node scripts/shockwave-shots.mjs <folder>` (dev server running).

## What to check

1. Is it too strong, or too weak? In the captures the hit spark covers most of the ring for the first frames; the
   bend reads best from frame 5 on, over the railing and arches.
2. Does the grey edge help, or should it go (`edge: 0`)?
3. Are the rings big enough? 45% of a character is a small circle next to the heavy spark.
4. The whole-screen pulse on supers and round-enders (`pulse.alpha` 0.25).

## Taking it out

`node scripts/shockwave-remove.mjs` removes all of it: the marked blocks in the drawing code, the numbers, the lists
in both character files (by text, your tuning is not touched), the test and the picture tool. I ran it on copies: the
drawing code and `effects.json` come back identical to what they were. To only switch it off: `"on": false`.
