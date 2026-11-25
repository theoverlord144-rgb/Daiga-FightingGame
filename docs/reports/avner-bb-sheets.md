# Avner: the new (BlazBlue style) sheets

Branch `avner-bb-sheets`, Nov 24 and 25. Nothing committed.

## What changed

Avner's stance, walks, crouch, jump, dashes, air dashes, ground normals, Lantern Drag, Waning Hop and Moonfall now
play from the new sheets with the owner's holds. All numbers are in his data file; the engine code did not change.
The cutting tool (`scripts/avner-prep.mjs`) learned three things: sheets that are already cut out, lining drawings
up by the head and chest (the top 40% of the body), and storing an effect upside down or laid flat.

## Sheets

**Wired with the exact holds:** idle (12), walk forward (10), walk back (8), 5M (8), 5H (8), 5S (8), 4H (8),
6M Waning Hop (8), 2L (6), 2M (7), 2H (8), 3H Lantern Drag (8), Moonfall (7), and the four effects.

**Wrong count (the list said otherwise):**

- `Avner_Crouch.png` has 5 drawings, the list says 6. Wired after the owner asked for it: drawing 1 for 4 frames going
  down, then 2-5 looped at 10, 8, 8, 10. Standing up plays 2 then 1, 4 frames each.
- `Avner_Test_LightPunch.png` has 7 drawings, the list says 6. It keeps the earlier 7-drawing holds (2, 2, 2, 3, 2, 2, 2);
  the frame data is the list's 5 / 2 / 9.

**Missing:** a forward jump sheet. Forward and back jumps use the straight jump's drawings.

**Cut but not used:** the turnaround (3 drawings). The engine has no turnaround state.

## Movement: where the shared rules decide the length

These lengths are rules both characters share, so the drawings were fitted to them instead of changing the rules.

| Move | The list | In the game |
| --- | --- | --- |
| Jump squat | drawing 1 for 4 (super jump 8) | 3 frames for both (the shared prejump) |
| Jump in the air | 3, 4, 5 / 6 / 5 / 7 until land | the same six drawings, picked by how fast he is rising or falling |
| Landing | 4, 4 | 4, 4 (the first 3 frames are the landing itself, the rest plays as he is already free) |
| Forward dash | 3, then 2-5 at 3 each while held, then 5, 5 | 3, 3, 3, 3 (the dash is 12 frames, so drawing 5 is not reached), then 5, 5 |
| Back dash | 3, 3, 6, 4, 5, 5 (26) | 3, 3, 5, 3, then 5, 5 (the dash is 14 frames plus 6 of recovery) |
| Air dash forward | 2, 3, loop 3-4 at 3, then 4 | 2, 3, 3, 3, 3 (drawing 3 again), then drawing 5 for 4 |
| Air dash back | 2, 4, 4, 4 (14) | 2, 4, 4, 4 (the dash is 12 frames; the last drawing finishes as he falls) |

## Move data changes

| Move | Was | Now |
| --- | --- | --- |
| 5L | Lantern Jab | Lamp Jab (numbers unchanged) |
| 5M | Push Kick | Warding Kick (numbers unchanged; hitbox moved onto the new kick) |
| 5H | Lantern Swing 14 / 4 / 22 | Pendulum 12 / 4 / 20. **Reach dropped from 240 px to 95 px**: the new drawing swings close to his body. Block advantage went from -6 to -4 (blockstun untouched). |
| 5S | Rising Lantern 11 / 5 / 22 | Moonrise 10 / 4 / 22. Hitbox is narrower and shorter to match the drawing (62 px forward, 200 px up). |
| 4H | Crescent Kick 14 / 5 / 22, step back | Crescent Withdraw 12 / 4 / 20. Hop back 22 px over drawings 2-6, off the floor and unthrowable from frame 4 until he lands (frame 26), light pop-up on hit (soft launch), spin on counter hit, blockstun 16 -> 15 = -8. Reach 380 -> 67 px. |
| 6M | Waning Hop 22 / 4 / 16 | 22 / 3 / 16, spin on counter hit. Off the floor through the hit drawing (frames 8-24). |
| 2L | Low Lantern Jab | Low Lamp Jab (numbers unchanged; reach 110 -> 82 px to match the drawing) |
| 2M | Shin Kick 9 / 3 / 15 | Shadow Kick 8 / 3 / 15, reach 132 -> 141 px |
| 2H | Lantern Sweep 12 / 4 / 24 | Lowmoon Sweep 12 / 3 / 24, reach 180 -> 116 px. Still a hard knockdown. It still slides forward as before (not in the list, left alone). |
| 3H | Lantern Drag 13 / 6 / 22, slid 154 px from frame 6 | 16 / 6 / 24, blockstun 14 -> 17 = -12. He now travels only during the 6 active frames: 210 px (35 px a frame). |
| Moonfall | j.2M, overhead, popped him up on hit to act again | j.214M, mid, hard knockdown on an airborne fighter. On hit he holds drawing 5 to the floor; no follow-up in the air. Landing 8 + 6 after a hit or block, 12 + 6 after a miss. Blockstun 12 -> 15, hitstun 20 -> 26 (see below). |

Eclipse Drop (623 > S) did not exist, so there was nothing to remove.

**Moonfall's advantage depends on how low it connects**, because he has to finish falling first. Measured: on block
+1 at shin height, -4 at waist height, -7 at head height. On hit +9 low, 0 at head height. The hitstun of 26 is my
call (at 20 he was -6 on hit from head height); change it if you want it tighter.

## Air normals (added later the same day)

All four sheets matched the owner's counts and are wired with his holds.

| Move | Was | Now |
| --- | --- | --- |
| j.L | Air Jab 5 / 3 / 10 | Air Lamp Jab, same numbers. Still an overhead. |
| j.M | Air Side Kick 8 / 5 / 14 | Night Kick 7 / 4 / 14. Reach 118 px in front, and it still hits a little behind him (crossup). |
| j.H | Air Lantern Arc 12 / 5 / 18 | Low Tide 10 / 4 / 18. One hitbox in front and one below-front. |
| j.S | Lantern Crash 14 / 5 / 30, acted again in the air | 12 / 4, then drawing 5 until he lands. Once per jump. Lands into drawings 6-7 (8 + 6 frames) and cannot act until they end. After a hit he drops straight down. Ground bounce and hard knockdown on an airborne fighter, as before. |

- **Not done: j.H's spin on an airborne fighter inside moonlight.** The rules have no way yet for a move to react
  differently inside the moonlight; that needs a small change to the core rules, which is waiting on the owner's go.
- j.S on a standing fighter is plain hitstun (the list only speaks of the airborne case).
- Play-test: older routes that used j.S and then kept attacking in the air no longer work, because he now rides it
  to the floor. The route "j.S, land, pick up with 2L" needs checking by hand.

## Blocks, hit reactions, throws and system poses (Nov 25)

21 more sheets, no holds given. Nothing about how the game plays changed: every state keeps the length the rules
give it, and the holds below are my fit to those lengths. Change any of them.

| Sheet | Drawings | Where it plays | Holds |
| --- | --- | --- | --- |
| Standing / crouching block | 4 each | 1 the impact, 2 the guard for the rest of the blockstun, 3 as he comes out. 4 is the plain stance, not used. | 4, rest, 3 |
| Air block | 3 | the same idea | 4, rest, 4 |
| Ground hit reactions | 9 (3 rows) | row 1 (hit high) is the standing hit, row 3 the crouching hit. Row 2 (hit to the body) is cut but not used yet. | 6, then held |
| Launched in the air | 6 | 1-2 the air hit; 5-6 hitting the floor and lying (knockdown, KO). 3-4 not used: the tumble sheet covers the fall. | 5, held / 6, 34 |
| Spin | 4 | the spin hit state, looped | 3 each |
| Tumble | 4 | the tumble, looped | 6 each |
| Slide | 5 | the slide hit state | 4, 8, 8, 8, held |
| Crumple | 6 | Vow's crumple | 5, 6, 7, 8, 9, 10 |
| Get-up | 12 (3 rows) | row 1 = the wake-up, row 3 (back roll) = the ground tech. Row 2 (forward roll) is cut but has no home. | 3 each / 4 each |
| Air tech | 4 | the air tech (one sheet for both directions) | 3 each |
| Being thrown | 5 | 1-2 grabbed, 3 lifted, 4 flung. 5 (lying) not used: the knockdown follows. | 7, 7, 6, held |
| Forward / back throw | 7 each | same split as before: 1-2 the grab, 1-3 the hold, 4-7 the finish | unchanged |
| Vow guard | 6 | 1-2 start, 2-3-4-3 the hold loop, 5-6 absorbing a hit | 2, 2 / 9 each / 8, 6 |
| Vow strike (full) | 7 | all three strikes use it; the quick and middle ones play it faster. Hit on drawing 3. | quick 5, 4, 3, 5, 5, 5, 5; middle 7, 6, 3, 6, 6, 5, 5; full 8, 7, 4, 6, 6, 6, 6 |
| Repel | 5 | drawings 2-4 during the push | 3, 9, rest |
| Draw | 6 | drawings 2-5 during the pull | 3 each |
| Absolve | 7 | 1-5 the burst, 6-7 the recovery. The air version uses the same drawings. | 4 each / 20, 20 |
| Win pose, intro | 8 each | **cut, not in the game**: there is no intro or win-pose moment in the engine yet | none |

Things with no home yet (each needs a rule or a state, so they wait on the owner):

- Intro and win pose.
- Forward get-up roll: the game has one wake-up, on the spot.
- The body-hit reaction: every standing hit shows the high-hit drawings until hits can pick a reaction by height or strength.
- Air tech has one direction in the rules; the sheet's forward and back look the same there.

Still old art or stand-ins: throw tech, being pulled by Draw (shows his standing hit), the quick and middle Vow
strikes (the full strike's drawings).

Pictures: `node scripts/shots.mjs <folder> lamp-sys`.

## Specials and their effects (Nov 25)

Rising Moon, Lunar Halo, Tide, Moonlit (three rows) and Moonlit Snap are cut from the newer drawings, with the six
effect sheets. Every sheet had the drawing count the spec gave (8, 8, 8, 5 + 5 + 4, 7; effects 10, 8, 10, 10, 8, 6).
The body sheets came as transparent PNGs, so there was no magenta to key. The fourth drawing of the air Moonlit row
is not used: the jump's falling drawing follows, as written.

### Cut

- **Air Crescent (j.236)**: its three moves, four projectiles, burst effect, landing state, three sheets and both
  combo-damage routes. j.236 now does nothing.
- **Crescent Recall**: the move and its placeholder sheet. R with the light out and no mark does nothing; the light
  stays until it fades (600 frames), then the 240-frame cooldown starts as before.
- The old `moonlit-6` sheet (6R shares the "in front / far" row now) and Tide's old pulling state.
- Eclipse Drop: nothing of it is left in his file (a test checks all of these stay gone).
- **Left alone, yours to delete:** the raw drawings `Avner_SpecialMove_AirCrescent*.png`, `Avner_SpecialMove_Moonlit.png`
  and `Avner_SpecialMove_Moonlit_RecallEffect.png` (delivered, but Recall is cut, so nothing uses it).

### Holds against frame data

| Move | Holds | Adds up to | Checks |
| --- | --- | --- | --- |
| Rising Moon | 5,4,4,4,5,8,7,6 | 43 | drawing 4 and the orb on frame 14 |
| Lunar Halo | 2,2,3,3,6, drawing 6 until he lands, then 8,6 | 38 on a miss | hit on frame 5, two hit drawings = 6 active, invincible 1-8 |
| Tide | 5,5,5,4,5,6,7,6 | 43 | wave on frame 16, pull on frame 25 |
| Moonlit (R, 6R, 2R) | 4,4,4,10,8 | 30 | zone on frame 9 |
| Moonlit (air) | 4,4,8, then the fall | 16 | zone on frame 5 |
| Moonlit Snap | 4,4,3,10,6,6,6 | 39 | snap drawing and beam on frame 9, hit on frame 14 (the beam's third frame) |

### Every move data change

| Move | Was | Is |
| --- | --- | --- |
| Rising Moon L / M / H | 10 startup, 26 recovery; a moon rising from the floor at a fixed spot 140 / 320 / 520 px ahead, on frame 16 / 20 / 24 | 14 startup, 30 recovery; an orb leaves the lantern on frame 14 and flies 10 px a frame for 160 / 320 / 500 px. 900 damage and the soft launch are unchanged |
| EX Rising Moon | one moon under the opponent wherever they stand | two orbs from the lantern, 8 frames apart: 600, then 760 with spin and a guaranteed Moonmark. 1,299 measured |
| Lunar Halo L / M / H | startup 6 / 8 / 11, 10 active, 30 recovery, grounded, only EX invincible | 5 startup, 6 active for all three; he leaves the ground on drawing 2, rises 88 px over drawings 2-4, falls and lands into a 14-frame landing. All three invincible frames 1-8. Damage 900 / 1,000 / 1,200 and the box sizes by button are unchanged |
| EX Lunar Halo | 5 startup, invincible 1-10 | same body as the others, invincible 1-8, still 1,300 |
| Tide L / M / H | 7 startup, 26 recovery; wave on frame 7 at 12 px a frame, 300 damage, pulled the moment it touched | wave on frame 16, pull on frame 25, 18 recovery. The wave only hooks (150); the haul is a second hit (150) that lands wherever they are and drags them to 85 px. 288 measured. The wave is faster (18 / 30 / 42 px a frame) because it only has 9 frames to travel |
| EX Tide | a longer wave, 300 | bigger wave 500, haul 750 with spin. 1,190 measured |
| Moonlit R / 6R / 2R | recovery 18 / 20 / 18 | recovery 22 (the cast is still frame 9) |
| Moonlit j.R | cast on frame 9 | cast on frame 5, 12 recovery, then he falls |
| Moonlit Snap | 10 startup, 18 recovery; needed the light out | 14 startup, 25 recovery; once per combo; works on any marked opponent, light or no light (EX Rising Moon marks without one) |
| Moonmark | a ring at chest height | the drawn mark, 6 frames a drawing, above the head |

Advantage measured in the game: Rising Moon M +0 on block up close, about +15 from mid range; Tide M -7 to -4 on
block, +22 on hit with them at 85 px; Lunar Halo -19 on block.

### Mismatches and things not built

- **Tide's rolling loop never shows.** The wave appears on frame 16 and is hauled back on frame 25. Its three opening
  drawings take those 9 frames, so drawings 4-7 are never reached. A longer gap between release and pull, or shorter
  opening holds, would show them. Your numbers are in as given.
- **The wave's pull-back drawings play whenever the wave ends**, also on a miss.
- **Lunar Halo's three buttons now differ only in damage and reach**, since the table gave one set of frames.
- **A Moonmark from EX Rising Moon** lasts until it is snapped, a light fades, or the round ends.
- **The move editor shows "no launch" for a spin hit that has none written**, though the game pops them up. I wrote the
  launch out on the two EX hits so the editor and the game agree. The editor gap itself is still there.

### Built after your go-ahead (four code changes)

- **Moonlight rule.** A move or projectile can say what its hit does while the opponent stands in the attacker's own
  light (`inZone` in the data). Rising Moon L / M / H spin there and cost 4 of the 10-point juggle limit (my number
  for "heavy"; the usual soft launch costs 3). j.H spins an airborne opponent there. The opponent's light never
  counts, and a counter-hit reaction still comes first. With the settings removed the recorded match replays
  identically, so the rule changes nothing by itself.
- **Halo burst** follows him up and is drawn behind his body (effect settings `follow` and `behind`).
- **Gold EX effects.** A sprite setting `tint` colours a sheet once and keeps it. The EX moons, EX wave and EX Halo
  burst use a pale gold (`#ffd98a`). The in-game stills are made without it (that tool has no real canvas); see
  `ex-gold-real-screen.png` in the previews folder.
- **Frame time.** The far background layers (two ridges, the arches, the railing) were stored pictures that the
  camera zoom had to enlarge every frame. They are now filled as shapes: the same outlines, sharper edges, far
  cheaper. The project's measure went from 13.9 ms average / 19.8 worst 5% to **8.4 / 14.6**, inside the 16.7 ms
  budget. With two moons, a zone and a Tide wave out together: 7.5 ms. The last commit reads 6.9 / 11.4, so about
  1.5 ms of the zoom's cost remains (the vignette and larger drawings).

### Checks

- After the four code changes: 449 tests, 446 pass (two new tests cover them), the same 3 old failures.
- `npm test` before them: 447 tests, 444 pass; the same 3 old failures (Back Heavy 4H in the archived kit, Vigil M crescent,
  Malik j.R). Tests rewritten to the new spec, not loosened: Rising Moon (3), Lunar Halo, Tide (plus a new EX test),
  Moonlit placement, the Snap, the fade and cooldown, the cancel test, the sheet list. The two Air Crescent tests are
  replaced by one that proves Air Crescent, Recall and Eclipse Drop are gone. The editor test follows the wave's new
  name. Four Moonlit tests were already failing before this work because the jab was retuned shorter in the box
  editor; they now stand 110 px apart instead of 150.
- Build, draw smoke test and baseline pass; baseline re-recorded (it also picked up the hurtbox edits made in the
  editor today).
- **Frame time** (real renderer in headless Chrome, which draws without the graphics card): see the section above.
  Before the fix the effects themselves cost nothing measurable; the slowdown was the stage under the camera zoom.
- Contact sheets and game-speed GIFs of each special in the game, with its effect, are in
  `data/characters/avner/previews/in-game/`. Remake them with `node scripts/shots.mjs <folder> lamp-sp`.

### What to play-test

- Tide: does it feel like he yanks them in? The pull starts on the haul drawing; they arrive 12 frames later.
- Lunar Halo: does the circle read now that it rises with him, behind his body?
- Rising Moon and j.H inside moonlight: does the spin give the follow-ups you wanted, and is 4 the right juggle cost?
- Is the EX gold the right shade?
- Does the background look the same to you? Its edges are a little sharper when zoomed in.
- Rising Moon: are 160 / 320 / 500 px different enough? L reaches about a jab and a half.
- Rising Moon flies at lantern height. It hits a crouching Malik; check it against low moves.
- Snap in the light: the beam and the zone are both pale columns and the mark sits inside the glow. Can you tell them apart?
- Is 5 frames, fully invincible, on every Lunar Halo too strong for a meterless reversal?

## Effects

- 3H sparks: 6 drawings, 3 frames each, pinned to the lantern from the first hit drawing, so they follow him.
- 3H dust: 4 frames each, at his front foot from drawing 3. Also plays on the 2H hit frame.
- Crescent: 2 frames each. On 6M's hit; stored upside down for 4H (from drawing 3) and 5S (on the hit); stored flat for 2H.
- Moonfall trail: 3 frames each, dropped behind him every 4 frames of the dive.
- **Not done:** the 3H dust on landings and dash starts. Those use the shared dust both characters have; giving Avner
  his own there needs a small drawing rule.

## Checks

- Every attack's holds add up to its frame data (the wiring script refuses otherwise; the test `normals` checks it).
- `npm test`: 447 tests, 444 pass. The 3 failures are the same 3 as before this work (Back Heavy 4H in the archived
  kit, Vigil M crescent, Malik j.R).
- Tests that held the old numbers were rewritten to the new spec, not loosened: the normals table (now also 3H and
  6M), 5H's hit drawing, Crescent Withdraw, Lantern Drag, Waning Hop, Moonfall.
- `npm run build`, the draw smoke test and the baseline pass. The baseline was re-recorded for these changes.
- Contact sheets and game-speed GIFs for every sheet are in `data/characters/avner/previews/`. The holds are not
  printed under each drawing (the tool cannot draw text); they are in the tables above and in the cutting table.
- Pictures in place: `node scripts/shots.mjs <folder> lamp-bb` (stance, crouch, normals), `lamp-bb-move`, `lamp-fall`, `lamp-drag`.

## What to play-test

- Does each normal feel snappy at the new holds?
- Do his feet slide during the walks and both dashes?
- 4H: the back hop is only 22 px (a quarter of his width, as written). Is that enough?
- 5H at 95 px reach and 4H at 67 px are much shorter than before. Is that what the new drawings are meant to be?
- 3H covers 210 px in 6 frames. Too fast?
- 2H still slides forward under a drawing that looks planted.
- After a Moonfall hit he lands on top of the opponent.
- Crouch with 5 drawings: is the loop right, or is a sixth drawing coming?
