# Universal systems: report

Your spec is saved word for word in `docs/specs/universal-systems.md`. Everything in it is built, on the branch
`avner-vigil` (not merged to `main`; that is your call). This report says what was built, what I had to decide, what
clashes with what was there, which tests ran, what to play first, and every slot still waiting for art.

**The short version.** All twelve sections work and are tested: 349 tests, 347 pass. The two that fail are not from
this work. They pin two Avner hitboxes that you have since changed in the box editor (see "Tests"). Rollback and the
sync test pass with every system switched on. Every number is a first guess, in data, waiting for you to tune it in
training mode.

**Update, same night: your art is in.** Malik's new animations and your universal effect sheets are cut and wired
(see "Your art" below). 353 tests, 351 pass, the same two failing. I have now looked at real rendered frames of the
fighters and effects (not the HUD: that is still unseen).

## What was built

1. **Buttons and inputs.** A fifth button, R (Rite): keyboard O / Numpad 6, pad right shoulder, rebindable. An EX
   move is the special's motion + its attack button + S, for one bar. S pressed beside an attack button is ignored, so
   attack + S never gives you the S move by accident.
2. **Devotion.** Four bars of 100. You build 3 per 1% of their health you take off, 1 per 1% a blocked hit would have
   done, 5 for doing a special, and 2 per 1% of your own health you lose (at most 150 per combo). Whiffs build nothing.
   Five archetypes set Give and Take and the extras: balanced, martyr, zealot, penitent, trickster. Avner is balanced,
   Malik is penitent. EX costs 100, a level 1 super 100, a level 3 super 300.
3. **EX moves.** A move gets an EX version by listing what changes under `ex` in its data. Only the engine test
   character has any so far.
4. **Combo rules.** Hard and soft launches (one hard launch a combo), a juggle limit of 10, a flat 50% penalty on
   damage and hitstun for a move used again, and a tech out once a combo runs past 480 frames.
5. **Vow (M+H).** Guard up in 4 frames; hits are absorbed into Debt with 6 frames of hitstop and no hitstun. Let go
   to strike: quick (under 20 frames held), crumple (20 to 44), unblockable crumple (45 and up, automatic at 60).
   Throws, supers and moves flagged `pierce` go through. Debt is forgiven by landing the strike, drains over 3
   seconds, or comes due at +20% the moment you are hit. Free from neutral, 100 to cancel a normal into it, 100 to
   dash out. The strike is a Witness counter if they were attacking within the last 20 frames.
6. **Perfect Link.** Press the next attack in the last 3 frames of hitstop: that hit adds no scaling, you get 2
   Devotion (zealot 5) and a flash. Three per combo.
7. **Absolve (R+S while being comboed).** Once a round, 200 Devotion (300 against a Witness combo). 20 invincible
   frames, the attacker is knocked back half a screen, the combo ends, and they lose all the Devotion that combo gave
   them. If they block it you are stuck for 40 frames. It replaces the old burst.
8. **Rite.** Characters list their Rite moves and an optional gauge. Avner: R enters Vigil (22S no longer does
   anything). Malik: Guardian Palm on R (straight), 2R (low), 6R (rising), j.R (diving). The spirit hand is its own
   object with its own hitbox. Three charges, 240 frames each, unlimited during his install.
9. **Repel and Draw.** Any two of L / M / H during blockstun. Holding back: Repel, the attacker slides a third of
   the screen away, free, 20-frame lockout, penitent +10. Holding forward: Draw, 100 Devotion, the attacker is pulled
   a step in and left at -4; penitent gets 50 back for a punish within 30 frames.
10. **Counters and Witness.** Counter (hit during their startup): +20% hitstun. Witness (hit during their recovery,
    or during a special or super that touched nothing): +50% hitstun, the first 3 hits scale the combo half as much,
    the decay timer runs 120 frames longer, and a 10-frame slow-motion signal for the screen. Zealot gets 25 Devotion.
11. **HUD and training.** Debt in red on the health bar, an Absolve diamond by the health bar, the Rite gauge under
    the Devotion meter, and the words PERFECT / COUNTER / WITNESS. Training shows, per combo: Devotion by source,
    Debt, the decay timer, juggle total, scaling, link timing and counter type. Two toggles in the F2 menu: infinite
    meter, and Absolve always available.
12. **Animation and effect slots.** Listed at the end.

## What I decided, and why

These are the things the spec left open. Each is my call; change any of them.

**Things that could surprise you in play**
- **A whiffed Absolve is nearly safe.** The spec gives the 40-frame recovery only when it is *blocked*. One that
  touches nothing recovers in 12 frames. If you want a whiff punishable too, say so; it is a one-line change in data.
- **Absolve's knock back is a slide along the ground, not a launch.** That is what makes it exactly half a screen.
  The old burst launched. A launch looks bigger but the distance stops being exact.
- **Draw does nothing to an attacker in the air**, and nothing when what you blocked was a projectile whose owner has
  already recovered. It still costs 100. The spec said this for "no attack being blocked"; I read a jump-in as outside
  it because pulling an airborne fighter "one step" has no clean meaning.
- **Repel and Draw only work while blocking on the ground**, not in an air block.
- **S, then M+H within 3 frames, gives Vow for free.** It follows from "S beside an attack button is ignored". It is
  not a cancel, so it costs nothing.
- **Launching specials now jump-cancel on hit.** A launch written as plain `{x, y}` counts as a soft launch, so
  Avner's and Malik's launching specials got the jump cancel and cost 3 juggle points. If that is wrong for a
  particular move, mark it in its data.
- **Malik's Rite moves count as specials**: they build the 5 Devotion and can be cancelled into from normals.
- **Rite charges refill one at a time**, 240 frames each, so three take 12 seconds from empty.

**Rules I had to pin down**
- A second hard launch in the same combo acts as a soft launch instead of doing nothing.
- Past the juggle limit a hit still does damage but has no hitstun, launch or bounce.
- The repeat penalty is a flat 50% for any later use, not stacking.
- The trickster's "switch" bonus counts within one combo (high to low, or changing sides).
- Flat extras (Witness +25, Repel +10, switch +10) are not multiplied by Give. EX moves and supers don't get the +5.
- Only the first hit of a combo can be a counter or a Witness counter. Absolve's own hit is never one.
- A throw makes Debt come due when it *lands*, not if it is broken. Debt does not drain while you hold the guard,
  during the strike, or while held in a throw.
- Malik's install stays on down, down, H+S (nothing collides with it) and is a level 1 super: one bar.
- The universal L → M → H → S chain is checked on each character's own cancel table, not forced by the engine.
- In the air, a blocked Absolve means a helpless fall, then the 40 frames on landing.

**What clashes with what was there**
- The spec replaced the older EX input and cost, the burst, the meter gains, the repeat penalty, the counter-hit
  bonus, the super cost (your two-bar super is now one bar or three), and Vigil's input. Tests that pinned the old
  rules were rewritten to the new ones, each with a comment saying which section replaced it. I took your "yes" to
  the spec as the go-ahead for that. The spec's own rule says to leave a wrong test failing; I did that only for the
  two below, where the question is your art, not the spec.
- Three older tests pinned exact lists (every command Malik has; the order of a test character's commands; what
  counts as contact in the sync test). They now include Vow, the Rite moves, and absorbed hits. Nothing was loosened.

## Tests

353 tests, 351 pass. `npm run build` passes. New test files, one per part of the spec: `systems-input`, `devotion`,
`combo-rules`, `witness-link`, `vow`, `absolve-guard`, `rite`, `systems-readout`, and `slot-art` for the art wiring. Each covers the cases the spec asked
for, including its own rollback run: thousands of frames rewound 8 frames every frame, with the mechanic happening
for real.

**The two failures, both waiting on you:**
- *Avner's Back Heavy reach.* The test pins 180 px. Your box-editor change made it 297.
- *Vigil Crescent's hitbox.* The test pins "30 px wide or thinner". Your box-editor change made it 102.

If those are the sizes you want, tell me and I will update the tests to match. Your Avner hitbox edits are still only
on your disk; I kept them out of every commit.

**What is not tested:** how the HUD looks. It is drawing code nobody has seen on a screen; the only check is that it
runs without crashing (`node scripts/draw-smoke.mjs`). The fighters and effects I have looked at in pictures
(`node scripts/shots.mjs`), which is not the same as watching them move.

## What to play-test first

1. **The HUD.** Open training mode with Malik. Check the Debt stripe on the health bar, the Absolve diamond, the
   Rite pips under the Devotion meter, and that the pop-up words sit somewhere sensible. I placed all of these
   without seeing them. Then watch Malik's new animations in motion: I have only seen them as still frames.
2. **Vow.** Hold M+H and let the dummy hit you. Does 4 frames of startup feel usable? Do the three release timings
   feel distinct? Is the +20% Debt penalty scary enough to matter?
3. **Perfect Link.** Three frames is tight. The training readout tells you how many frames early or late you were.
4. **Witness.** Whiff-punish a special and see whether the longer combo is worth what it costs the other player (300
   to Absolve).
5. **Absolve.** Is 200 the right price, and is half a screen the right distance? Try the bait.
6. **Repel and Draw.** Is a third of a screen too much? Does -4 on Draw give a real punish with each character's
   fastest normal?
7. **Malik's Guardian Palm.** All four numbers are invented. The rising one (6R) most needs your eye as an anti-air.
8. **Devotion flow.** Play a full round each way and see if meter comes at the pace you want.

## Your art

**Malik.** Every sheet is cut to his standing size (186 px) and timed to the rules:

| What | Drawings | How it plays |
| --- | --- | --- |
| Vow, guard coming up | 1 | the 4 startup frames |
| Vow, holding | 4 | drawings 2 to 5 and back again, 6 frames each, as a breathing loop |
| Vow, absorbed hit | 4 | **drawing 2 is the emphasis and holds**: 8 frames, through the whole hitstop; the others 2 frames each |
| Vow strikes: quick, crumple, full | 5 each | the palm-out drawing lands exactly on the first hitting frame |
| Absolve (ground and air) | 5 | curl, burst with arms out on the hit, land |
| Absolve, baited recovery | 3 | over the 40 frames |
| Repel, Draw | 4 each | guard, push or pull, back to stance |
| Crumple | 6 | stagger, to his knees, collapse; the last drawing holds |
| Rite: R, 2R, 6R, j.R | 4 each | the thrust shows on the frame the spirit hand appears |
| Spirit hands | 7 each | appear, travel, burst on impact, fade |

**Universal effects**, the same for every character: the Vow guard aura (opens, then loops while held), the absorb
flash, the Vow strike flash, the stars over a crumpled fighter, the Absolve burst, the dark smoke behind a fighter
stuck in the baited recovery, the Repel wave, the Draw streams between the two fighters, the tech effect, and the
super flash (star burst on the fighter, the black slash across the screen, speed lines around it).

**How I checked it.** A new tool, `node scripts/shots.mjs <folder>`, plays scripted situations with the real rules
and saves pictures of the frames drawn by the real drawing code. I looked at every one of the above in place. It
does not draw the HUD, text or the stage, so those are still unseen.

**Calls I made from the drawings. Change any of them.**
- **6R comes from his hand, tilted up and forward** (your correction). The hand grows out of his palm at 45
  degrees and its hitbox travels along it, 11 px a frame up and forward. Hit point-blank, the burst at the hand's
  tip still shows up and away from the opponent; say if that bothers you.
- **j.R always erupts from the ground** (your correction; it replaces the spec's "j.R = downward"). Whatever his
  height, the hand comes out of the floor 110 px in front of him, with no hitbox in the air. A hit soft launches the
  opponent up and forward. My numbers, change any: 110 px in front, about 110 px wide, reaches 190 px high, launch
  5 forward / 12 up. I left it an overhead, as it was; say if a hand from the floor should be blockable low or
  crouching instead.
- **The Absolve recovery smoke is drawn as painted, dark, behind him.** In front it hid him completely. All the
  other effects are drawn as light.
- **The super's black slash and speed lines go behind the fighters**, so the two fighters stay readable.
- **A Vow strike that lands shows your Vow flash only**, not the orange hit spark on top of it.
- **Crumple stars** start 10 frames in (once he is going down) and sit just above a kneeling head.
- **Malik's guard loop is 36 frames and his absorb pose 14**, set in his file to fit your drawings.
- The Vow hold sheet came on a dark glowing background. I removed it by hand, like the Air S sheet. The edges are
  clean at game size; look at them once zoomed in.

**What is weak**
- The smoke sheet's drawings touch each other, so two of its frames have a straight cut edge on one side.
- The pre-existing heavy orange hit spark shows a faint square around it on a dark stage. Not from this work; I saw
  it in the pictures. Worth a recut.
- Avner has none of this art. Everything of his below is still a stand-in.

## Slots still waiting for art

To fill one, give the character's file an entry with that name and its own `sprite` (how is in
`docs/toska-format.md`). Stand-ins are copies of the character's own sheets, saved as `sheets/<slot>-placeholder.png`.

**Malik:** `drawn` (being pulled in by a Draw: uses his standing hit reaction) and `absolve_recovery_air` (the
baited Absolve while falling: uses his fall).

**Avner, all of them:**

| Slot | Stand-in (a copy of) |
| --- | --- |
| `vow_start`, `vow_hold`, `repel`, `draw` | standing block |
| `vow_absorb` | crouching block |
| `vow_strike_quick` | Standing Heavy |
| `vow_strike`, `vow_strike_full` | Back Heavy |
| `absolve` | Standing S |
| `absolve_air` | Jumping Heavy |
| `absolve_recovery` | crouch |
| `absolve_recovery_air` | fall |
| `drawn` | standing hit reaction |
| `crumple` | crouching hit reaction |

Still waiting from before this work, for Avner: Snap, Anchor (and its catch and miss), the Vigil exit, the Brand burst
and fizzle. There is also no art for the ground tech pose, for throws, or for EX moves (`<move>_ex` shows the normal
move, brightened; Avner and Malik have no EX moves yet anyway).

**Effects still drawn by code** (a simple ring), in `data/effects/`: `perfect_flash-placeholder.png`,
`witness_flash-placeholder.png`, `ex_flash-placeholder.png`.

**Not built as a picture at all:** the Witness slow motion. The game sends the signal (10 frames) but the screen
does not slow down yet.

## Still open from earlier

Avner and Malik need their EX moves designed. Malik's install has no effect on play apart from unlimited Rite
charges. And the questions from before this spec are still waiting: which install effect sits under Malik, three orbs
out at once, orb damage, 5S reach, the Air S cut-out edges, per-strength hit reactions, and merging to `main`.
