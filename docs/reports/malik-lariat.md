# Malik: Running Lariat

Nov 23, 2026. Branch `avner-lampbearer`.

## What it is

A new special for Malik: **214 + L / M / H**. He powers up, runs forward and swings his arm through the opponent. The
button picks how far he runs. The EX version (the same input + S, one bar) has armor.

You set the input, the run distance by button and the EX armor. Every number below is my first guess, and all of it
is in his file (`data/characters/malik/malik.toska.json`, moves `lariatL`, `lariatM`, `lariatH`).

| | L | M | H | EX |
| --- | --- | --- | --- | --- |
| Run distance | 120 px | 224 px | 324 px | 322 px |
| Run speed (px a frame) | 12 | 16 | 18 | 23 |
| Startup / active / recovery | 14 / 4 / 24 | 18 / 4 / 24 | 22 / 4 / 26 | 18 / 4 / 24 |
| Damage | 900 | 1000 | 1100 | 1300 |
| Armor | none | none | none | one hit, from the first frame until the swing ends |

- On hit: knockdown. It cannot be cancelled into another special.
- On block: about 10 frames behind, so it is punishable up close.
- Blocked standing or crouching.
- The hitbox is 110 px wide at chest height, in front of him. It is a guess: adjust it in the box editor.

## What I decided, and why

- **The run speeds differ by button.** I first told you 12 px a frame for every version. That cannot give the
  distances and the startups in the table at the same time, and the distances and startups are what you feel when you
  play, so I kept those and let the speed follow.
- **He stops when the swing comes out.** He does not slide through the active frames.
- **The run pushes the opponent.** If he reaches them before the swing, he shoves them along; he does not pass through.
- **Armor still takes the damage** of the hit it absorbs (the engine's armor rule), and it is one hit only: a second
  hit before the swing stops him.
- **The drawings are plain per-drawing holds** (power-up 4 frames, the four run drawings share the run, the swing on
  the active frames, two recovery drawings). The run cycle plays once, slower for M and H, instead of looping. That
  keeps the move editable in the editor's TIMING column. If the H run looks too slow, say so and I will loop it.

## Art

`Malik_SpecialMove_Lariat.png` (8 drawings) → `sheets/lariat.png`, cut to his body size (186 px standing):
drawing 1 the power-up, 2 to 5 the run, 6 the swing, 7 and 8 the recovery. No placeholder.

## Tests

`npm test`: 404 tests, 401 pass. New: `tests/malik-lariat.test.js` (4 tests: the three distances and startups, hit
and knockdown and minus on block, EX armor going through a jab while the plain version is stopped, and a rollback
sync test of Malik against Malik using it at random).

The three failures are not from this move: the two tests of Avner's archived chain kit, and "Malik j.R ... launches up
and forward", which fails because your tuning now launches toward Malik. That one is waiting for your answer.

`npm run build` passes. The draw check passes.

## What to play-test

1. The three distances: does L feel like a short lunge and H like a real run?
2. H at 22 frames of startup: is it too easy to react to?
3. EX through a poke: does the one hit of armor feel right, or should it be two?
4. Being blocked: is 10 frames behind the right price?
