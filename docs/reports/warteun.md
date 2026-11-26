# War'Teun (third character)

Nov 26, 2026. Branch `warteun`. Not merged, not pushed. Every number is a first guess for play-testing.

## What was built

He is in the game and playable: pick him on the select screen, or open
`?mode=training&p1=warteun&p2=malik`.

- **All 41 of your sheets are cut** (51 game sheets) with your holds. Standing height 190 px, the same as Avner.
- **Every normal** from the brief, with the brief's startup / active / recovery. 5H and 6H step forward, 4H steps
  back, j.S drops diagonally: each leaves a vacuum where he stood.
- **The vacuum.** A dark sphere sits where he left for the move's fuse, then pulls for 12 frames (6 px a frame,
  anyone within 90 px), then bursts: mid, 600 damage, knocks away from its centre, blocked holding either way,
  scaled like any other hit. Three at most; a fourth makes the oldest collapse at once.
- **Resonance.** Three bars beside the Devotion meter. A normal that hits fills a third of a bar, a special half.
  One bar is lost after 3 seconds without a hit. Each bar makes a burst 20% bigger and 25% stronger.
- **Warp Step** (236 L / M / H), **Displacement** (214), **Air Warp** (j.214), **Listen** (623), **Wiretap**
  (22 + attack), **Tune** (R), **Swap** (236 + S, one bar).
- **Teleport dashes**: forward, back and in the air. They leave no vacuum.
- No supers (as the brief says). No throws either: the brief has none and there is no throw art. Say if he should
  have them.

New rules went into `src/core` as general, data-driven pieces any character can use (a warp, a counter stance, a
"wait, pull, burst" projectile, setting those off early, a gauge that drains when you stop hitting). No number is
in code.

## How I read the unclear lines (change any of these)

- **Wiretap and the pull:** "pulls toward the opponent wherever they are (double range)". I built: the pull reaches
  twice as far while they are marked. The vacuum does not chase them.
- **Tune:** vacuums burst on the strike frame itself, with no collapse first. That is one number (`collapse: 0` on
  the move) if you want the 12-frame pull before it.
- **Vacuum drawing holds** in the brief do not add up: the collapse is 12 frames but its two drawings are 4, 4, and
  the burst lists five holds for four drawings. I used 6, 6 over the collapse and 2, 3, 4, 4 for the burst, with the
  hit on the first burst drawing.
- **Displacement's vacuum** is timed from the strike: it bursts exactly 16 frames after frame 18, hit or blocked.
- **Listen** catches a strike in frames 4 to 24. Supers go through it, like they go through Vow.

## Holds against frame data

Every move's holds add up to its startup + active + recovery, and every hit drawing starts on the hit frame. A test
checks it. The block numbers come out as written: 4H -6, 6H -12, Wiretap -4.

Mismatches, numbers left as the brief has them:

- **Crumple:** your holds are 48 frames; the engine's crumple is 45. Drawn at 9, 9, 11, 6, 4, 6.
- **Crouch:** the brief loops drawings 2 to 6; the sheet has 5 drawings. It loops 2 to 5.
- **Landing:** your land drawings (4, 4) make his landing 8 frames. Avner and Malik land in 3. That is a real
  weakness on every jump; tell me if you meant it.
- **Jump:** one jump sheet. Forward and back jumps use the same drawings. Super jump does not hold drawing 1 longer.

## Placeholders and missing art

Placeholders in his folder (all have "placeholder" in the file name):

| What | Stand-in |
| --- | --- |
| Warp pop | his note ring |
| Tune chord | his note ring |
| Listen shimmer | his note ring, small |
| Swap | Displacement's drawings |
| Wiretap mark | a ruby glow drawn by code (no sheet) |
| Vow (start, hold, absorb, three strikes), Absolve (ground, air, both recoveries), Repel, Draw, Drawn | copies of his own block, 5M, Tune and hit drawings |

Missing or not used:

- **Air Warp** reuses the air dash sheet, as the brief says.
- **Not drawn at all:** throws, throw tech, being thrown (shows a hit drawing), forward / back jump.
- **Cut but the engine has no use for them yet:** `otg` (lifted off the floor), `hit-stand-gut` (per-height hit
  reaction), `getup-forward` (forward tech roll).
- **Not built:** dust at Warp Step's launch and skid; the warp pop on his air tech; the "launcher" and "slam" hit
  effects (those strips do not exist: 5S and j.S use the size-based spark); the j.S landing after a hit.
- All four of your effect sheets came on a clear background, so they are drawn as light. The dark sphere (vacuum
  drawings 1 to 3) is drawn as a normal picture so it stays dark.

## Damage (measured in the real game, against Malik and Avner: same numbers)

Scripted routes, so these are the best I found, not a proven maximum.

| Route | Damage |
| --- | --- |
| 5L, 5M, 5H, 2H | 1,864 (19%) |
| Best meterless: 2L, 5M, 5H, 5S, super jump, j.M, j.H, j.S, then 2M off the floor | 3,271 (33%) |
| Displacement alone (strike, then its vacuum pulls them in and bursts) | 1,252 (13%) |
| Displacement, 5L, 5M, 5S, super jump, j.M, j.H, j.S | 3,927 (39%) |
| Wiretap, Warp Step behind, 2L, 5M, 5H, 5S, air chain | 3,206 (32%) |
| Tune at Resonance 3, one vacuum on them, raw | 1,050 (11%) |
| Tune at Resonance 3, two or three vacuums resonating, raw | 1,575 (16%) |
| 5L, 5M, 5H, Tune at Resonance 3 with a resonating pair | 2,347 (23%) |

**Nothing is above 50%.** Things I noticed:

- 5L, 5M, 5S whiffs the launcher (pushback); it needs 5H's step in between.
- Tune knocks them away, so nothing follows it. As built it is a combo ender or a trap, not an extender.
- A resonating burst at Resonance 3 is 2.4 times normal size: about half the screen. See the pictures.

## Speed

900 frames against Malik with the Wiretap mark on, Resonance 3 and vacuums bursting, on the real screen (headless
Chrome, no graphics card): **8.7 ms a frame on average** (budget 16.7). **The worst 5% of frames average 16.8 ms,
just over budget, worst single frame 27 ms.** The rules cost nothing (0.02 ms); it is drawing. The slow frames are
the shockwave rings on bursts at Resonance 2 and up. The usual match reads 8.4 average, 14.6 worst 5%. On a machine
with a graphics card this should be fine, but it is the thing to watch.

## Tests

`npm test`: 484 of 484 pass (12 new in `tests/warteun.test.js`: vacuum spawn, fuse, pull, burst timing; the limit of
three; Tune and resonating; Resonance fill, drain, spend; Wiretap on hit and block, 6 seconds, Warp Step behind;
Listen on strikes only; Displacement's strike and burst never together; Swap; rollback). No test was weakened.
Build passes. The drawing smoke test passes with him in it.

`baseline.mjs --check` reports 34 differences. They are the same 34 with my changes taken out: they come from the
Avner and Malik retunes of Nov 25, not from this work. The baseline wants re-recording when you are happy with those.

## Pictures

- `docs/reports/warteun/`: real-screen pictures against Avner and Malik, and a contact sheet of each special.
- `data/characters/warteun/previews/game/`: each special as a GIF at game speed.
- `data/characters/warteun/previews/`: every cut sheet as a contact sheet and a GIF.

## What to play-test

1. **Vacuums:** can you read where they are and when they burst? Is 90 px of pull fair, or too easy to walk out of?
2. **Displacement:** a side switch, then a burst 16 frames later that pulls them back in for a 39% combo. Too strong?
3. **Listen:** 20 frames of recovery on a miss, a 600 burst on a catch, and he ends behind them. Worth the risk?
4. **Resonance:** three hits a bar, gone after 3 seconds. Too fast, too slow? Is a half-screen burst at level 3 right?
5. **Warp Step:** the three distances and fuses (10 / 30 / 60), the skid, and how it feels landing behind a marked
   opponent.
6. **His landing** (8 frames) and his floaty jump.
7. **4H** steps back out of range of its own slash from close up. As drawn, it is a retreat that hits people who chase.

## Open

- Your 41 raw sheets (`data/characters/War'Teun/`, 140 MB) are not committed. Avner's and Malik's raw art is in the
  repository, so say the word and I add them.
- Boxes are placed by eye from the drawings. They want a pass in the box editor.

## Changes after the first play-test (Nov 26, same day)

You asked for these; all are in.

- **His size during attacks.** Your action drawings were bigger than the upright pose each sheet ends in (that pose
  sets the sheet's size). I measured his head in every drawing and gave the ones that were off their own size
  factor: 5H (drawings 1 to 7 at 86%), 5S, 6M, 4H (drawings 1 and 2 at 84%), 6H, j.S and Warp Step. The other
  sheets measured consistent and are untouched. Boxes and frame data did not move.
- **Forward dash:** 180 px (was 320), and slower: he reappears on frame 12 (was 9), 26 frames in all (was 20),
  can attack out of it from frame 16 (was 12).
- **Warp Step:** 200 / 300 / 400 px (was 320 / 480 / 640).
- **5H and 6H never pass through the opponent:** the step stops 60 px in front of a grounded opponent. A new
  general rule (`stop` on a warp), tested from far, close, point-blank and facing left.
- **5H and 6H slower:** startup 16 (was 13) and 20 (was 15); the extra frames are on the wind-up drawings.
- **New vacuum, fire and smoke.** All three drawn as normal pictures on one centre: smoke under, fire, the ruby ring
  on top; all three grow with Resonance and with resonating. The vacuum is fully solid: none of the see-through
  rules touch it. Fire is at 0.95 and smoke at 0.85, as your note says. The hit now lands on fire frame 2 (one frame
  after the burst begins); Displacement's still lands exactly 16 frames after the strike. Screen shake on that
  frame, harder per Resonance level; the white ring stays at Resonance 2 and up.

Things to know:

- **Your note's file names are not the files in the folder.** I used `Warteun_SpecialMove_WarpStep_Effect` (vacuum),
  `_Effect2` (fire) and `_Effect3` (smoke), by looking at them.
- **The smoke sheet is on white paper, not see-through.** I took the white out; its edges are a little hard. A
  clean export would look better.
- **The collapse** is still 12 frames, so its two drawings are held 6, 6 (your note says 4, 4).
- **At Resonance 3 with resonating vacuums the fire fills most of the screen** (2.4 times size). That is your
  numbers multiplied out; see `docs/reports/warteun/malik-5-tune-burst-later.png`.

Measured again: best meterless combo 3,399 (34%), Displacement into a full combo 3,927 (39%), nothing over 50%.
Frame time with three vacuums, the mark and the new effects: 9.4 ms average, 15.9 ms worst 5% (inside the 16.7
budget; the earlier 16.8 was the old light-blended burst), worst single frame 18.1 ms. `npm test`: 485 of 485.

## Second round of play-test changes (Nov 26)

- **Dashes: my bug, fixed.** The dashes were meant to be pure teleports, but the engine's ordinary dash run was
  still going underneath, so a real double tap carried him 601 px forward and 438 back (the "180 px" above was
  only the teleport part). The run is switched off. Measured with real inputs he now covers exactly Avner's
  distance: 197 px forward, 186 px back, standing still before and after. A test compares him to Avner with real
  double taps, so it cannot hide again. Air dashes measured clean (240 forward, 200 back, no drift); untouched.
- **Explosions at half size.** Fire, smoke and the ruby ring are drawn at 50% (one number, `burstArt.scale`). They
  still grow with Resonance and resonating. The waiting sphere and the hitbox are unchanged, so at Resonance 0 the
  fire is a little smaller than the area that hits.
- **2M's ripple: two faults of mine, fixed.** Its picture was pinned at his feet while the hit travelled away
  unseen, and drawings 4 to 8 were cut into pieces. It is recut on its even grid and drawn on the moving hit; the
  hitbox sits under the arc. A test checks it travels (320 px) and hits low.

`npm test`: 487 of 487. Frame time: 9.1 ms average, 14.5 ms worst 5%, worst single frame 19.6 ms.
