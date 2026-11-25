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
