# Avner, the Lantern-Bearer (Nov 27)

Branch `avner-lantern`. Nothing is committed yet. Tests: `tests/lantern.test.js` (21 tests). Full suite: 568 of 568 pass. `npm run build` and `node scripts/draw-smoke.mjs` both pass.

## What was built

His lantern is now an object of its own. He sets it on the stage, it works there by itself, and he calls it back. Everything that decides a result is in the rules (`src/core/relic.js`) and in his file. The drawing side only draws it.

- **The lantern's states**
  - In his hand, set on the stage, or coming home.
  - It holds 3 flames. In his hand it gets 1 flame back every 120 frames.
  - At 0 flames it goes dark, flies home in about 30 frames, and can't be set again until a flame is back.
  - After 480 frames on the stage it comes home by itself.
  - If Avner is hit while it's set, it loses a flame and stops what it was doing.
  - The opponent can hit it. It loses a flame, then can't be hit again for 20 frames.
  - The 3 flames show beside his name under the health bar.
- **Setting it (R)**
  - **5R Hang** hangs it in front of him at chest height.
  - **6R Lob** arcs it to mid-screen, where it hangs high.
  - **2R Slide** skims it along the floor and leaves it low. It hits on the way, and a hit carries a sliding opponent with it.
  - **j.R** leaves it where he is in the air.
  - The lantern leaves his hand on the frame the drawing lets go. His back foot stays planted while his stance changes.
- **With it set**
  - **5R / j.R Recall** brings it home. Holding R delays the return by up to 40 frames. If he's standing free when it arrives, he plays the catch drawings; otherwise it snaps into his hand.
  - **2R Pendulum** costs 1 flame. It swings for 120 frames and hits 4 times, the first on his frame 16.
- **Empty-hand moves**
  - New normals: 5L, 5M, 5H, 5S, 2L, 2M, 2H, 3H, j.L, j.M, j.H, 4H, and 6H.
  - 4H and 2H make his upper body invulnerable. 3H hits low and 6H is an overhead.
  - 6H on an airborne opponent spikes them into a slide toward the lantern, once per combo.
  - While the lantern is in his hand there's a lantern 6H overhead (22 / 4 / 22).
- **Specials**
  - **214 with it in hand = Moonstruck.** It marks on hit and on block, slides them on hit, and cancels into 2R Slide on hit only.
  - **214 with it set = Pulse.**
    - Near the lantern it always hits and pops them toward him, for 1 flame.
    - Far away it only hits a marked opponent, and uses up the mark.
    - A blocked Pulse marks them and costs nothing.
    - From the second Pulse in a combo it launches lower and does 0.8 of the damage.
  - **236 Crescent through a set lantern** costs a flame and becomes the Full Crescent: bigger, 2 hits, floats them. A low lantern sends it along the floor; a high one sends it down from above. A marked opponent gets one that homes in.
  - **623 Rising Moon** is invincible only with the lantern in hand. With it set, he loses the invincibility and a second moon rises from the lantern, for 1 flame.
  - **The rekka's Full Moon** with the lantern set throws them at it and they bounce back off it for a pickup, for 1 flame. A marked opponent floats longer and the mark is used.
- **The old kit is archived:** the Moonlit Rite, Tide and Moon Snap. They're whole in `data/characters/_archive/avner_moonlit/`, and the old tests read them there.

## Numbers picked (all first guesses, all in his file)

| Move | Input | Startup | Active | Recovery | Damage | Hits |
| --- | --- | --- | --- | --- | --- | --- |
| e5L / e2L | 5L / 2L | 5 | 2 | 9 | 380 / 330 | mid / low |
| e5M / e2M | 5M / 2M | 8 | 3 | 14 / 15 | 580 / 520 | mid / low |
| e5H | 5H | 11 | 4 | 19 | 800 | mid |
| e5S | 5S | 10 | 4 | 22 | 700 | mid |
| e2H | 2H | 10 | 5 | 22 | 800 | mid, upper body invulnerable frames 5-14 |
| e3H | 3H | 12 | 3 | 22 | 800 | low |
| e4H | 4H | 13 | 4 | 20 | 800 | mid, upper body invulnerable frames 7-16 |
| e6H | 6H | 24 | 4 | 22 | 900 | overhead |
| ej.L / M / H | air | 5 / 7 / 10 | 3 / 4 / 5 | 10 / 14 / 18 | 380 / 580 / 780 | overhead |
| lantern 6H | 6H | 22 | 4 | 22 | 900 | overhead |
| Moonstruck | 214 | 12 | 4 | 20 | 700 | -4 on block |
| Halo, lantern set | 623 | 5 | 6 | 90 | 900 | no invincibility |

Rite moves are free on frames 20 (Hang), 26 (Lob), 30 (Slide), 18 (Leave and Recall) and 16 (Pendulum), as the brief gives. The lantern hits for:

- Slide: 400.
- Pendulum: 250 a hit.
- Pulse: 600 near, 450 far.
- Second moon: 600.
- Full Crescent: 450 a hit.

## The main route

The midscreen route connects as the brief describes: L > M > H > 214 Moonstruck > 2R Slide > 214 Pulse > 6H spike > 214 Pulse.

- That's 7 hits for about 3,204 damage.
- Flames go 3 > 2 > 1.
- The second Pulse launches lower.
- `route.gif` in this folder is the real renderer playing it.

**In the corner it breaks after 6 hits (2,644 damage).**

1. The Slide can't get behind them, so the lantern stops on top of them by the wall.
2. The 6H spike then slides them toward the lantern, back out of the corner and under Avner.
3. The last 214 now reads backwards and comes out as 236.

This needs a decision from you: a different corner ender, or a corner rule for the spike. I haven't changed anything for it.

## Missing art (placeholders in place)

- **No empty-hand drawings yet:** crouch, walks, dashes, blocks, hit reactions, 236, 623 and the rekka. He's drawn holding the lantern in those even when it's set. You can see this in the crescent and pendulum pictures.
- **The catch** has 6 drawings, and the brief's holds list 8. Fitted to 6.
- **Moonstruck's arc** is painted into the body sheet; there's no separate arc sheet.
- 6M, j.2H, j.S and the throws use the lantern art.
- **No sound exists in the engine**, so nothing plays for the snuff or the relight.

## Drawings I changed or flagged

- **Last drawings swapped:** Hang, Lob and Slide each end on a drawing of him still holding the lantern. I swapped their last drawings for the empty-hand stance.
- **Steps drawn into the art:** e5H and e6H step forward in the drawings, but the moves don't move him. He'll look like he slides back at the end until a step is added or the drawings change.
- **Lantern light:** at 1 and 2 flames the light art is just the lit glass (only 3 flames has the big halo), so it's drawn over the lantern as light.

## Play-test first

1. The Hang / Recall / catch loop, for feel and timing.
2. The midscreen route, and the corner problem above.
3. Pulse near versus far, and the mark.
4. Crescent through a low lantern versus a high one.
5. Whether 480 frames before the lantern comes home on its own is too long.
6. The empty-hand 4H and 2H upper-body invulnerability, as anti-airs.

## Pictures

All are from the real renderer, in this folder:

- `route.gif`
- Moves: `hang.jpg`, `catch.jpg`, `lob.jpg`, `leave.jpg`, `pendulum.jpg`, `pulse.jpg`, `halo.jpg`
- Crescents: `crescent-low.jpg`, `crescent-high.jpg`, `crescent-marked.jpg`
- The lantern's state: `struck.jpg`, `dark.jpg`
- `corner.jpg`

To film them again: `node scripts/shots.mjs <folder> lant` (`LANT_EVERY=1` films every frame).

## Same day, later: scale, light and Moonstruck (owner's request)

- **Scale.** The empty-hand set was about 8% too big. His head, measured from the top of the forehead under the locs to the chin, is 27.5 px in the empty-hand idle and 25.4 px in the lantern idle.
  - Every empty-hand sheet is now cut at its old size × **0.92**: `E_FIX` in `scripts/avner-prep.mjs`.
  - Old sizes (sheet px per drawn px): idle 0.709, base 0.235, jump 0.807, normals 0.616 to 0.762, Recall 0.725, Pendulum 0.716, Pulse 0.704, Leave 0.619.
  - One raw factor for every sheet wasn't possible: the drawings on the 2688 x 1520 canvases aren't drawn at one size (the base is one big figure; the idle has twelve small ones).
  - The lantern base sprite isn't used in the game; the in-game lantern idle is a different, upright pose. So the two in-game idles were matched instead.
  - Left at their sizes:
    - The catch: it's sized by its last drawing, which is the lantern stance.
    - Hang, Lob and Slide: their empty-hand drawings sit on the lantern sheet at the lantern scale. Only their swapped-in last drawing shrinks.
  - His rear-foot offset in the empty-hand stance went from 72 to 66 px. The Rite moves' 42 px position shift was kept (no gameplay change), so the foot slips about 6 px on the release frame.
  - Hurtboxes aren't tied to the drawings and did not move.
  - Comparison picture: `scale-preview.png` in this folder.
- **Lantern light.** It's now drawn behind the lantern: behind his whole sprite for the held lantern, behind the lantern object when it's set.
  - The white disc on the held lantern was the old Lampbearer's code-drawn moon-phase placeholder (full white at full Devotion). It's removed from his file; `drawLantern` now only draws one where a character still has it.
  - At 1 and 2 flames the light art is only a lit square the size of the glass, so behind the lantern it's mostly hidden.
- **Moonstruck** now uses the owner's GIF (`Avner_SpecialMove_Moonstruck.png` is a GIF under that name; it replaced the earlier raw sheet).
  - Its 12 frames are laid out by ffmpeg into `Avner_SpecialMove_Moonstruck_Gif.png` and cut from there, with the same holds. The hit is still on drawing 7, the swing with the arc.
  - The GIF is small (288 px), so the sheet is enlarged about 1.5x and looks softer than the others.

## Same day, evening: the owner's new effects

Ten effect sheets were redrawn or added after they were last cut.

- **The game's hit sparks** (Light, Medium, Heavy, Slash in `data/UniversalEffects/`): re-cut with `scripts/hit-fx-prep.mjs`. Same drawing counts and cell sizes, so `data/system/effects.json` is unchanged. The Heavy sheet's big first glows touch, so its cuts are now set by hand. Picture: `avner-lantern/hit-sparks.jpg`.
- **Avner's effects** (three crescents, Half Moon arc, Full Moon burst, Lunar Halo burst, Rising Moon orb): re-cut and the new cell sizes copied into his file. The Half Moon sheet is now one row of 7 (it was 4 + 3).
- **Moonstruck arc** (`Avner_SpecialMove_Moonstruck_Effect.png`, new): cut as `moonstruck-arc` and played as a layer on all three Moonstruck buttons (effect `moonstruckArc`, opacity 0.6).
  - Its 6 drawings play from frame 10. The second lands on frame 12, the first hit frame, and the arc is gone by frame 22.
  - The GIF body already has a pale arc painted on drawings 7-8. The effect sits on that swing and glows under it. If it reads as doubled, take the arc out of those two GIF drawings.
  - Picture: `avner-lantern/moonstruck-arc.jpg`.
- No frame data, damage or hitboxes changed.

## Same day, evening: the Sliver (236 with the lantern set or coming home)

- **Moves:** `sliverL/M/H`, listed ahead of Rising Moon with `requires lantern [1, 2]`. In hand, 236 is still Rising Moon. EX 236 is still the EX Rising Moon in both stances.
- **Body:** the owner's GIF `Avner_SpecialMove_Silver.gif`, 9 frames, laid out by ffmpeg into `Avner_SpecialMove_Silver_Gif.png` and cut as `sliver`.
  - The brief's holds list 12; fitted to the 9 drawings with the same timing: 2,2,2,2,2,2,[2],10,12.
  - The shot leaves on frame 13 (the push drawing) and he's free on 36 (startup 14, recovery 23).
- **Shot:** `sliverL/M/H`, cut from `Avner_SpecialMove_Silver_effect.png` as `sliver-fx`.
  - Speed 8 and damage 630 are 0.8x and 0.7x of the Crescent's 10 and 900. One hit.
  - Hitbox 34 x 76, matching the thin crescent (the Crescent's is 70 x 100). It leaves from the palm, 80 px in front and 115 px up.
  - The same lifetimes and pass-through rule as the Crescent: through a set lantern it becomes the Full Crescent.
  - Only one shot at a time, shared with the moon orbs.
- **Tests and pictures:** test "236 with the lantern set or coming home is the Sliver" in `tests/lantern.test.js`. The crescent film scenes now wait for the Sliver. New scene `lant-sliver`; picture `avner-lantern/sliver.jpg`.

## Same day, evening: the pendulum's trail and hit

- **Trail** (`Avner_NoLantern_Rite_Pendulum_Effect1.png`, 6 drawings, cut as `pendulum-trail`): the named effect `pendulumTrail`, which his `art.relic.trail` names.
  - It plays once per pass of the swing, behind the lantern, centred on its ring. The bottom drawing is centred on each hit frame, and it flips on the way back.
  - The drawings are pieces of one circle, placed by the circle's centre (read off the sheet), so the arc doesn't drift.
  - Picture: `avner-lantern/pendulum-trail.jpg`.
- **Hit** (`Avner_NoLantern_Rite_Pendulum_Effect2.png`, 5 drawings, cut as `pendulum-hit`): his `art.relic.hitFx.pendulum`. It plays where each swing hits, in place of the generic spark. The renderer now looks up a set object's hit art by action. Picture: `avner-lantern/pendulum-hit.jpg`.
- The art sweeps wider than the lantern's 60° swing (`art.relic.swing`, drawing only). Raise that if the trail should match the lantern's reach.

## Not done

`docs/baseline` still doesn't match. That's from Malik's earlier changes, which were already waiting on your word to re-record. Avner's new moves only show up there as "new".
