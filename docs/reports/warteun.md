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

## Explosion size raised (Nov 26)

Fire, smoke and ruby ring now drawn at 0.675 (35% bigger than the half size; about two thirds of the original).
Hitbox and waiting sphere unchanged. `npm test`: 487 of 487.

**Frame time is now just over budget in the worst case.** Six measurements: 9.1 to 9.4 ms average, but the worst
5% of frames average 17.1 to 17.9 ms (budget 16.7), worst single frame about 20 ms. At half size it was 14.5. This
is headless Chrome with no graphics card, three vacuums bursting at Resonance 3; the cost is the area of fire drawn.

## Double jump (Nov 26)

He has one air jump per airtime (`airJumps: 1`, the same as Avner), back on landing; tested. His air normals do
not cancel into it on hit (Avner's j.L and j.M do), so it is movement only and opens no new combo routes yet.
`npm test`: 488 of 488.

## Air jump cancels (Nov 26)

- His j.L, j.M and j.H cancel into the double jump on hit (you set this in the box editor).
- **Rule fix, every character:** a jump pressed while the game is frozen on an air hit used to be thrown away;
  only a press after the freeze counted. Now an up pressed on the hit frame or anywhere in the freeze gives the
  double jump on the first frame after it. Tested frame by frame on his j.L, j.M, j.H and Avner's j.L, j.M.
- Scripted routes through the double jump reach 3,439 (34%) at best; nothing over 50%. These are my scripted
  attempts, not a proven maximum, and the numbers were moving while you tuned him in the editor.

`npm test`: 489 of 489. Baseline check: the same 34 old differences.

## Air teleports turn him; explosion timings by button (Nov 26)

- **Turning:** Air Warp and both air dashes now turn him to face the opponent when they carry him past them (new
  warp option `face`). Measured: after crossing over with Air Warp, j.L, j.M and j.H all hit.
- **Timings:** Air Warp and Displacement vacuums now wait 10 / 30 / 60 frames on L / M / H, the same as Warp Step
  (Air Warp was 20 on every button, Displacement 9).
- **Displacement now differs by button.** L: the burst lands 17 frames after the strike (was 16) and still pulls
  them back in: 1,252 alone. M and H: the burst comes too late to combo from the strike (700 alone); they are traps.
  The follow-up combo I scripted reaches 2,911 (29%) on L, 2,211 on M, and does not connect on H.

`npm test`: 490 of 490. Baseline check: the same 34 old differences.

## HIT SETTINGS preview shows the fork strike alone (Nov 26)

On Displacement (and 5H, 6H, 4H, j.S) the looping preview used to let the vacuum burst hit the dummy after the
strike, so damage, pushback, launch and advantage were the two hits mixed (1,252 / 1,300 shown for a 700 strike).
The preview of a move with its own hit now takes its vacuum out before it pulls or bursts, and the bottom line says
so. The burst is tuned on the `vacuum` entry. Editor only; the game is unchanged. `npm test`: 491 of 491.

## The editor's FX page (Nov 26)

A fourth page in the box editor (the FX tab, or T). It works for every character.

- **The list on the left** is the character's effect sheets: one-shot effects, projectiles, and a burst's fire and
  smoke. War'Teun has 9, Malik 24, Avner 37.
- **Settings:** Size, Rotation (degrees), Opacity (0 to 1) and Colour (ten swatches, or your own mix with Red /
  Green / Blue). Click one, then use the arrows or − / +, or type a number and Enter. Backspace puts it back to
  its default. Undo and Save work as on the other pages.
- **The preview** loops the effect where it appears on the fighter. BACKDROP switches dark / grey / light so you
  can judge opacity; FIGHTER hides him; the mouse wheel zooms.

Limits, as agreed: settings are per effect (changing the warp pop changes it everywhere); colour multiplies the
drawing, so painted effects like the fire get darker and muddier, and nothing gets brighter than painted. The
preview shows the effect's own opacity; in a fight it also drops a little while the effect covers a fighter. Hit
sparks and the other effects shared by every character are not in the list.

Checked by clicking through the page in a headless browser (pictures taken; no errors) and by 4 new tests of the
settings model. `npm test`: 495 of 495.

## Silent Drop (air S): hitbox, lock and slide (owner, Nov 26)

**What he asked for:** a better hitbox on air S, the hit holding the opponent for the explosion it leaves, and that
explosion knocking them into a slide that can be hit off the ground, only when S itself hit.

**What it did before (measured):** the fork was left where he started the drop, about 100 px behind and 230 to 280 px
above the opponent, so its explosion never touched anyone the drop had hit. The hitbox sat in front of him where
nothing is drawn.

**What changed**
- Hitbox: under him, around the fork and his legs (110 wide, 150 tall, from 40 px below his feet).
- The fork is planted where he arrives, not where he left: the one exception to "the fork stays where he stood".
  Its fuse is 2 frames, so it bursts 13 frames after the earliest hit, inside the hit's own 14-frame freeze.
- Air S lost its slam and ground bounce; the explosion does the knockdown now.
- A hit arms a hidden 20-frame timer. While it runs, his explosion slides the opponent along the ground and the slide
  ends in the hard knockdown. Blocked or whiffed, the explosion is the ordinary one.
- Two new general rules, both data: `whileVar` (a hit reacts differently while a timer of the attacker's runs) and
  `slideEnds` (a move chooses the knockdown its slide ends in).

**Measured after:** standing close, standing at the edge of its reach, airborne beside him and airborne below him:
both hits land, 13 frames apart; the opponent skids and lies in the hard knockdown for 40 frames; he is free about 36
frames before the slide ends. 2M's ripple picks them up (a three-hit combo in the test). Blocked: the explosion lands
on the blocker 13 frames later and is blocked too.

**To know:** only the ripple can hit off the ground for him. One slide per combo and the juggle limit still apply.
A blocked air S is stronger than before. Picture: `warteun/sheet-drop.png` (boxes drawn).

**Tool fix:** `shots.mjs` never passed a scene's `opts` to the renderer, so "boxes drawn" scenes had none. It does now.

## Warp tell, Wiretap Pursuit (2R) and the Wiretap mark (owner's brief, Nov 26; branch `warteun-pursuit`)

**Built**
- Displacement (all three) puts the 6-second mark on the opponent when it hits. Not on block.
- 236 M and H play the point-forward tell first, then the unchanged Warp Step. 236 L is untouched. He is fully
  hittable during the tell. The note ring and a sound cue come on the point (the fourth drawing).
- A Warp Step cancelled from a move that hit skips the tell. Cancelled from a blocked move, the tell plays.
- 2R, Wiretap Pursuit: nothing at all without a mark (no Tune, nothing spent). With one: tell, vanish, then he is
  behind and above the opponent wherever they are, facing them, falling. The mark shatters as he arrives.
- The mark floats above the opponent's head, upright, sized to their height, with its intro, loop and fade. It runs
  faster and brighter while 2R can come out, flashes on a tell, and shatters with a half-size ring.
- A Wiretap icon after the Resonance pips: dark with no mark, dim while marked, lit while 2R can come out.

**New frame data**

| Move | Tell | Vanishes / warps on frame | Whole move | Before |
| --- | --- | --- | --- | --- |
| 236 L | none | 13 | 36 | same |
| 236 M | 10 | 23 | 46 | 13 / 36 |
| 236 H | 16 | 29 | 52 | 13 / 36 |
| 2R | 14 | vanishes on 15, reappears on 20, acts from 26 | until he lands | new |

Distances (200 / 300 / 400) and vacuum fuses (10 / 30 / 60) are unchanged; 2R's vacuum has fuse 8.

**Art**
- Both tells are in `Warteun_SpecialMove_WiretapPursuit.png`, six drawings a row (the brief says 5 and 7).
  Point forward uses drawings 2-6. Point up has one spin drawing, not three: it is held 4 frames so the tell is
  still 14 (holds 2, 2, 4, 1, 2, 3). **Missing art: two spin drawings for the point-up tell.**
- The mark and shatter sheets are see-through, so they are drawn with normal blending. Their painted glow ended in a
  square at the cell edge; the cutter fades it to a circle.

**Decisions**
- "2R is available" = the mark is up and he is on the ground and not stunned. The mark is always usable otherwise,
  so without this the slower pulse would never show.
- The fade plays over the mark's last 12 frames, ending as the timer does.
- After arriving he can only use air normals, air S and air specials until he lands (no block, double jump or air
  dash), from frame 6. That is the brief's list, read strictly.
- The engine has no sound. The tell raises a sound cue and nothing plays it (owner: leave sound for now).

**Side effect to know:** a marked opponent is pulled by vacuums from twice as far (an existing Wiretap rule). Since
Displacement now marks on hit, its own vacuum drags the opponent back in more often than before.

**Checks:** 510 of 510 tests, build, drawing check. Previews in `data/characters/warteun/previews/game/`:
`warp-tell-LMH.gif`, `pursuit.gif`, `pursuit-jump.gif`, `mark.gif`, `tell-marked.gif` (50 pictures a second, the
closest a GIF gets to 60). Not looked at by me: the HUD icon and the mark's flash on a real screen.

**Play-test:** is the tell readable at full speed; are M and H too easy to punish now; is 2R worth landing Wiretap
for; is the mark clear without being in the way; does he land too close on top of the opponent after 2R.

**2R against an airborne opponent (owner, after play-testing):** he now reappears behind them at their own height. Above (190 px) is only for an opponent on the ground.
