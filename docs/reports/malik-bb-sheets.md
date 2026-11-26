# Malik's newer drawings (Nov 25)

All 50 new Malik sheets are cut and in the game. Data, the cutting tools, picture scenes and tests changed; no rule
code and no drawing code changed.

## What is in

| Part of him | What changed |
| --- | --- |
| Stance, walks, dashes, backdash, air dash, jump squat, jump, fall, landing | New drawings. Walking back is the forward walk played in reverse. |
| Blocks (stand, crouch, air) | New: the impact for 4 frames, then the guard. |
| Hit reactions | Standing and crouching hits now show two drawings (recoil, then settling). Air hit, spin, tumble and crumple are new. |
| Ground normals | 5L (7 drawings), 5M (8, hits on 3 and 4), 5H (7, all used now), 2L, 2M, 2H, 5S (8, hit on the high kick), Back Heavy. |
| Air normals | j.L, j.M, j.H (with its spirit hand), j.S, which now has a light arc that follows the heel. |
| Throws | Forward and back: the grab, the hold and the finish each have their drawings. |
| Spirit Orb | L, M and H each have their own sheet, and each orb its own: two drawings forming, four flying, three bursting. The H orb is the big painted one. |
| Resilience Pillar | New body drawings and a new pillar, standing on the floor. |
| Running Lariat | New drawings, plus a speed trail behind him while he runs (all three buttons and EX). |
| Vow strikes | One sheet of six for all three strikes, with a blast in front of the palm on the hit frame. |
| Air Rite (j.R) | New body drawings (the clap). See the first question below. |
| Spirit Install | The change itself is now 12 drawings across the 40-frame super. Installed, he has new idle, walk, dash, dash stop, jump squat, jump, fall and landing drawings. |

## Two new moves (numbers are my first guesses)

- **Stomp, forward + M.** Startup 10, active 3, recovery 22, 600 damage, mid. It is marked to hit a fighter lying in a
  hard knockdown. 5H, 2H and the guardian's heavy chain into it. A shock wave plays at his foot. I have not tested the
  hit on a downed fighter in play.
- **Guardian Ward, back + R.** Startup 8, recovery 26, costs a Rite charge like the others. A ward forms around him for
  6 frames and bursts: 600 damage, a soft launch, hits on both sides of him.

Because the recorded test match has Malik pressing forward + M, the match now plays out differently from frame 191. I
checked this directly: with the two new moves switched off, the old and new Malik play the whole 3,000-frame match
identically (the only difference is six frames of drawing cues). No existing move's frame data changed. The baseline
is re-recorded.

## Things you should know

1. **The sheets are small JPEGs.** They are 1280 x 426, so each drawing is enlarged about 1.3 to 2 times to reach his
   size in the game, and JPEG leaves soft edges. He looks softer than Avner. Full-size PNGs would fix this, and
   re-cutting is one command now.
2. **No holds came with them.** Every hold is my reading of the drawings, fitted to the frame data each move already
   had. Which drawing each hit lands on is written at the top of his file.
3. **Hitboxes and hurtboxes were not moved.** They are where they were for the old drawings. Most still fit; check
   them in the box editor, starting with 5S, 2H, Back Heavy and j.S, whose poses changed most.
4. **5H** has a small white sliver behind him on drawings 3 to 5, where neighbouring drawings touched on the sheet.
5. **Guardian attacks while installed.** The new install drawings have the guardian painted in with him, so I turned
   the separate idle guardian off. During its three attacks he switches to the older drawing of him alone, with the
   separate guardian striking. It works, but there is a visible pop between the two looks.
6. **Still the old style** (no new sheet came): crouch, back air dash, knockdown and get-up, 5R / 2R / 6R and their
   hands, Vow start, guard and absorb, Absolve, Repel, Draw, throw tech, and the guardian's attacks.
7. Malik's orb still shares its name with its move, so its hit shows the heavy burst, not the projectile burst.

## Questions for you

1. **Air Rite.** The new sheet shows a clap with two lights closing (I cut that effect, it is not used). On Nov 22
   you decided the j.R hand always erupts from the ground. I kept that rule and only swapped his body drawings. Do you
   want the clap to replace the ground hand, or stay as it is?
2. Are the stomp and Guardian Ward meant to be what I built (a hit on a downed fighter; a burst around him)?

## Checks

- Tests: 451, 448 pass. The 3 failures are the same three as before this work (archived Back Heavy, Vigil M, Malik
  j.R). Eleven tests that named the old drawings (counts, which drawing hits) were rewritten to the new ones; none was
  loosened.
- Build passes; the draw smoke test passes.
- Real-screen frame time: 8.7 ms average, 14.2 worst 5% (8.5 / 13.6 before).
- Pictures: `node scripts/shots.mjs <folder> mk` films every move, a still every 2 frames.

## To play-test

Every normal for timing against the new drawings; orb L / M / H; the stomp after a hard knockdown; back + R up
close; the install change and moving around installed; guardian attacks (the pop in point 5).

## Tools

`node scripts/avner-prep.mjs --char malik [--only name,name] [--analyze]` cuts his sheets from the table in
`scripts/malik-sheets.mjs` and writes `sheets/manifest.json` and `previews/`. `sheets/install-change.png` is the two
install sheets joined; `sheets/install-solo.png` is the older install idle of him alone.

## Nov 25, evening: the full-size sheets

The owner replaced Malik's raw folder with 44 full-size PNG sheets (2172 px wide, was 1280 px JPEGs). They are the
same drawings as the morning's set under new file names, so nothing about how he plays changed: the cutting table
(`scripts/malik-sheets.mjs`) points at the new files, 42 sheets were cut again, and the sprite sizes in his file were
updated in place (223 numbers in 54 sheets; no move numbers or boxes touched).

- **5H is cut cleanly now.** The morning's cut chopped a fist and a foot at fixed split points; the clean PNG lets the
  tool split by shape.
- **Medium Spirit Orb has six drawings now** (was eight). Holds refitted by me to the same 40 frames: 7, 5, 3, 9, 8, 8,
  the palm on drawing 4 from frame 15, the orb leaving on 18 as before.
- **Kept from the morning's cut, because no new sheet came:** the light Spirit Orb motion, the Vow strikes and their
  blast, the install jump, the second half of the install change, the back dash. Their source files are no longer in
  the folder (the cut sheets the game uses are).
- **Not built: `Malik_Dash_Effect.PNG` (7 drawings) and `Malik_Air_Dash_Effect.PNG` (5 drawings).** New art. Dash
  effects are system-wide today; a per-character one needs a small drawing-code change, which needs the owner's yes.
- Checks: 462 tests, 457 pass (the same five failures), build and draw check pass, the recorded match and every
  state's frame data are identical. Looked at in the real renderer through `shots.mjs mk`, not on the live screen.

## Nov 25, night: Light, Medium, Heavy and Back Heavy redrawn

The owner replaced four raw sheets with new animations (2688 x 1520, drawings in rows, a leaner build than his other
sheets). Cut and wired in. **No move number or box changed**: the recorded match and every state's frame data are
identical. Only the four sprite lines in his file, the cutting table and three tests that describe the drawings.

| Move | Drawings | The hit lands on | Frames per drawing (mine) |
| --- | --- | --- | --- |
| Light (5L) | 6 | 3 | 1, 2, 2, 2, 3, 2 |
| Medium (5M) | 5 of the 9 drawn | 2 and 6 of the drawn sheet | 3, 4, 3, 6, 6 |
| Heavy (5H) | 8 | 5 | 2, 2, 2, 2, 3, 7, 6, 5 |
| Back Heavy (4H) | 8 | 4 | 3, 4, 3, 3, 4, 6, 6, 6 |

- **Size.** Each sheet ends in the same upright pose, so that pose sizes them: 219 px, which puts the fighting stance
  in the same drawings at his 186. Medium's upright pose is drawn about 12% small beside its own punches, so that
  sheet is brought down by eye to match the other three and its upright pose is left out.
- **Medium leaves out four drawings.** Its two hits are 2 frames apart (frames 6 and 8). The new sheet shows the
  first punch, then three drawings of pulling back and winding up, then the second punch: there is no room for
  those three without moving the second hit later, which is a number change. Open with the owner.
- **The upright end pose** (Light, Heavy, Back Heavy) is 33 px taller than his idle, and his idle is still the
  older, heavier build, so the end of each move steps up and then drops back into the stance.
- **Boxes not moved.** Measured on the hit drawing: Light's palm reaches 89 px (hitbox to 70), Medium's fists 105
  and 116 (hitboxes to 64 and 74), Heavy's palm 107 (hitbox to 137), Back Heavy's palms 93 (hitbox to 144).
- Snap timing (the look-only polish) has no entry for the new holds, so these four play at the holds above.
- Tests 462, 457 pass, the same five failures. Build and draw check pass. Looked at through `shots.mjs mk` in the
  real renderer (`SHOT_BOXES=1` was added for box pictures; it did not draw them in filmed scenes), not on the
  live screen.
- **Not wired: `Malik_Idle.png`**, replaced at 19:16 while this was being done (12 drawings, 4 x 3). It is a clean
  see-through cut-out (I first called it a dark glowing background: that was only how it looked flattened; wrong).
  `Malik_BaseSprite.png` is a single reference picture, not a sheet.

## Nov 25, night: crouching attacks, air attacks and the launcher redrawn

Eight more sheets in the leaner build, clean see-through cut-outs (Air Light on magenta). Cut and wired in. **No move
number or box changed**; the recorded match and every state's frame data are identical.

| Move | Drawings | The hit lands on | Frames per drawing |
| --- | --- | --- | --- |
| Crouching Light (2L) | 6 | 3 | 1, 2, 2, 3, 3, 2 (mine) |
| Crouching Medium (2M) | 7 | 4 | 2, 2, 2, 3, 5, 4, 4 (mine) |
| Sweep (2H) | 8 | 4 | 3, 3, 2, 3, 5, 6, 6, 5 (mine) |
| Launcher (5S) | 8 | 4 | 3, 3, 2, 3, 8, 6, 5, 5 (as before) |
| Air Light | 6 | 3 | 2, 1, 4, 2, 3, 3 (as before) |
| Air Medium | 6 | 3 | 3, 2, 4, 4, 4, 4 (mine) |
| Air Heavy | 6 | 3, with the spirit hand | 4, 5, 3, 3, 3, 3 (as before) |
| Air S | 5 of 7 | 4 | 3, 3, 2, 6, 16 (mine) |

- **Size.** The launcher and Air S end in the upright pose (219 px). The crouching attacks are sized by the crouch
  they end in, 152 px, and Air Light / Medium / Heavy by their last drawing at 208 px: both numbers are mine, set so
  the bodies match the sized sheets, then checked by eye side by side.
- **Air S leaves out its last two drawings** (a landing crouch and the upright pose): the move has no landing state,
  so they would show in mid-air. Its last air drawing holds for 16 frames.
- **Air S has two arcs now.** The new drawings have the kick's arc painted in, and the earlier `axeArc` effect still
  plays over it. Left for the owner to choose.
- **Boxes not moved.** The sweep's foot reaches 191 px and its hitbox ends at 95. Crouching Medium's palm reaches 122
  and its hitbox runs to 181.
- **The table's idle entry now reads the new idle to measure only** (`measureOnly`); `sheets/idle.png` is still the
  earlier cut. Sheets with no `ref` (jump, air dash, air hit reactions) would be sized from the new build if recut.
- **Also in the folder, not wired** (not asked for yet): the new idle, `Malik_Crouching.png` (6 drawings, numbered),
  `Malik_Jump.png` (a labelled sheet: 9 jump drawings and an 8-drawing idle, with text on it), and at 19:38 new
  `Malik_Forward_Dash.PNG`, `Malik_Backdash.png`, `Malik_Forward_Walk.png`, `Malik_Back_Walk.png`.
- Tests 462, 457 pass, the same five failures (two tests that name the hit drawings were brought in line). Build
  and draw check pass. Looked at through `shots.mjs mk`, not on the live screen.

## Nov 25, night: idle, walks, dashes, air dashes and 5R redrawn

Cut and wired in, the leaner build. **No rule changed**: every state keeps its length, the recorded match and every
state's frame data are identical. Frames per drawing are mine throughout (none came with the sheets).

| State | Drawings | Frames per drawing |
| --- | --- | --- |
| Idle | 12 | 5 each (60, as before) |
| Walk forward, walk back | 8 each, a sheet each now | 6 each (48, as before) |
| Dash | 5, then the stop 2 | 2, 3, 2, 3, 2, then 2, 1 |
| Back dash | 4, then the stop 2 | 2, 4, 4, 4, then 4, 2 |
| Air dash | 4, then one drawing after it (was two) | 2, 4, 4, 4 |
| Back air dash | 4 | 2, 4, 4, 2 |
| 5R Guardian Palm ("Rite Neutral") | 5, the palm goes out on 3 | 5, 6, 6, 9, 7 |
| Its spirit hand | 7: 1-2 leaving, 3-4 flying, 5-7 the impact | as before |

- **The spirit hand is painted now**, not light: it is drawn as an ordinary picture (the `additive` switch is off on
  `palm5`), cut on an even grid about its middle, 110 px tall on drawing 3 (mine).
- **Sizes (mine).** Idle 186 as before. Walks: the first drawing 205. Dashes and 5R by their upright end pose, 219.
  Air dashes by the falling pose that ends them (208 forward; the back one is drawn stretched out, 250 by body area).
- **The air dashes were checked on the cut sheets only**: there is no filmed scene for them yet.
- **Still the older, heavier build:** crouch, jump / fall / land, blocks, hit reactions, knockdown and get-up,
  throws, specials, 2R / 6R / j.R / 4R, Vow, Absolve, Repel, Draw, and everything in Spirit Install.
- **In the folder, not wired** (not asked for yet): `Malik_Crouching.png`, `Malik_Jump.png` (labelled, with text),
  `Malik_Rite_Down.png` and its effect, `Malik_Rite_Air.png` and its effect.
- Tests 462, 457 pass, the same five failures (two tests that count the drawings were brought in line). Build and
  draw check pass. Idle, walk, dashes and 5R looked at through `shots.mjs` (`mk`, `rite-5R`), not on the live screen.

## Nov 25, night: Rites, Energy Sphere, Lariat, Pillar and the launcher redrawn; size and colour evened out

**No rule changed in any of this**: the recorded match and every state's frame data are identical. Frames per drawing
are mine (none came with the sheets). Tests 462, 457 pass, the same five failures; build and draw check pass.

| Move | Drawings | What lands where |
| --- | --- | --- |
| 4R Guardian Ward ("Rite Back") | 7, same holds | the ward effect is redrawn, 7 drawings |
| 2R ("Rite Down") | 5 (5, 8, 9, 7, 7) | the hand slams the floor on 3; its effect is now an orb rolling along the floor (light, 7 drawings) in place of the low hand |
| j.R ("Rite Air") | 5, same holds | the clap on 3. **The ground hand is kept** (the owner's Nov 22 rule); the new clap effect plays on his hands as a picture only (`riteClap`), bursting on the clap |
| Energy Sphere L / M / H | 6 / 8 / 10 | the strike is drawing 4 / 5 / 8, the orb leaves on the next. All three orbs redrawn; the heavy one is painted, not light |
| Running Lariat | 9 (was 8) | power-up 1 for four frames, the swing is drawing 6; the streak effect is six drawings placed by the head |
| Resilience Pillar | 7, same holds | the pillar effect is redrawn, 8 drawings |
| S launcher | 8, same holds | re-saved at 20:34 with new drawings; brought in |

- One test that names the Energy Sphere strike drawings was brought in line (4 / 5 / 8).
- Checked through `shots.mjs` (`mk-orb`, `mk-lariat`, `mk-pillar`, `mk-rite4`, `mk-riteJ`, `mk-5S`, `rite-2R`), not on the live screen.

### Size and colour (the owner: "size is sporadic and sometimes his colour changes slightly from frame to frame")

What was measured, per drawing, on the cut sheets:

- **Size.** A body's area changes little with the pose (the idle's twelve drawings stay within 2%). In several sheets
  the action drawings were 8 to 15% bigger than the upright pose the sheet was sized by (Heavy 1-6, Heavy Sphere 1-9,
  Lariat 2-5), and the air dashes, j.R and 2R were 5 to 10% small. The back walk was 5% smaller than the forward walk.
- **Colour.** Inside a sheet the colours hold. Between sheets they do not: pants ran from maroon-brown (the idle) to
  bright purple, skin from 158 to 186 in red. So he changed colour each time a move started.

What the cutting tool does about it now (two new options in `avner-prep.mjs`, set per sheet in `malik-sheets.mjs`):

- `even`: each drawing is resized so its body area stays inside a band round the idle's (94% to 103%, never moved by
  more than 12% down or 6% up). Heavy's action drawings shrink about 7%, Heavy Sphere's 5 to 9%, Lariat's run 3 to 4%;
  air dashes, j.R, 2R and the first 5R drawings grow 3 to 6%. Most drawings do not move. The back walk has `fix: 1.05`.
- `tone`: pants, skin, hair and sash are each multiplied to one palette (the middle of what the sheets measured). The
  idle's pants needed their own hint (`pantsBand`), being painted too brown for the colour rule to find.
- 31 sheets recut (all the redrawn body sheets), sprite sizes updated in place in his file.

**Limits, plainly:**
- Size is evened by area, not by measuring his head, so it is a correction of the worst cases, not a guarantee. A lunge
  shows more body than a stance and a tuck shows less; the band allows for that, so up to about 5% can remain.
- Heavy's hair is painted purple in the source and stays purple: the rule cannot tell purple hair from pants.
- The older-build sheets (hit reactions, blocks, crouch, jump, throws, Vow, install) are not touched: different art.
- A head-size measure was tried first and thrown out (too noisy).
