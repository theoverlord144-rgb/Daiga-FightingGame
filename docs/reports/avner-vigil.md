# Avner: the Vigil stance, the Brand moves, and the longer Back Heavy

Built from your spec, which is kept word for word in `docs/specs/avner-vigil.md` (the paste was cut off at the end of
the Tests list, after "Flare detonate at full screen vs fizzle;").

## What's new, in plain words

- **Vigil (down, down + S)** is now the real thing. 20 frames to get into it, nothing protecting him on the way.
  Then he holds the stance: no walking, no blocking. It ends when you press a follow-up, hold back, or after 120
  frames (2 seconds). Getting hit knocks him out of it like any other hit. The chain ring burns under his feet behind
  him and the light trail circles in front, both in step with the stance drawings.
- **Snap (L in the stance):** the low flick. 7 frames to come out, must be blocked crouching, reaches about a body
  length. On hit it puts the Brand on the opponent. If they already carry it, they are staggered 12 frames longer and
  the Brand stays. He goes back into the stance.
- **Vigil Crescent (M in the stance):** the gold crescent. It leaves his hand on frame 16 and flies forward at 9 px a
  frame at chest height. One hit, 400 damage, blockable standing or crouching. On hit it places the Brand; on an
  already branded opponent it staggers 14 frames longer. It disappears on hit, on block, when it meets an opposing
  projectile (both go), or when it runs out of room. Only one at a time: M does nothing while one is flying.
- **Anchor (H in the stance):** the ground chain. It only touches a branded opponent. An unbranded opponent can
  stand right on it and nothing happens. On a catch it uses up the Brand, drags them to 80 px in front of him, and he
  recovers 20 frames before they do. On a miss he is stuck for 34 frames and ends standing.
- **Flare (S in the stance):** the snap of the fingers. If the opponent is branded, the Brand bursts on frame 11
  wherever they are on the stage: 300 damage, 20 frames of hitstun, cannot be blocked, Brand used up, and he stays in
  the stance. If they are not branded it fizzles and he drops out of the stance, standing.
- **Exit:** holding back or the time limit takes 12 frames, then he is standing.
- **Back Heavy (4 + H)** reaches twice as far, with your new drawings (again without the third, the hop, and with the
  lash on the frames that hit). Startup, active, recovery, damage and self-push are untouched.

## Which file I used for what

| Your file | Used for |
| --- | --- |
| `Avner_VigilStance.png` (the 15:46 version) | Drawing 1: the entry. Drawings 2, 3, 4, 6, 7, 8, 9: the stance loop (drawing 5, the hop, removed as you asked). |
| `Avner_VigilStance_MediumPunch.png` | Vigil Crescent (M), drawings 2 to 6. |
| `Avner_VigilStance_MediumPunch_Projectile_Release_Movement_Impact.png` | The crescent itself: release, flight loop, impact. Your spec calls it `Avner_VigilM_Projectile.png`. |
| `Avner_VigilStance_S.png` | Flare: top row 1 to 3 the turn, 4 to 6 the detonation; bottom row the fizzle. |
| `Avner_VigilStance_Effect_Layer1.png` | The aura behind him (ground chain ring and sparks). |
| `Avner_VigilStance_Effect_Layer2.png` | The light trail in front of him. |
| `Avner_BrandMark.png` | The Brand on the opponent while it lasts (as before). |
| `Avner_BrandHitFlash.png` | The Brand being applied (Snap and the crescent's hit). |
| `Avner_Back_HeavyPunch.png` (the 16:00 version) | Back Heavy. |

**Placeholders** (no sheet found; every one has `placeholder` in its file name, in `sheets/`):

| Placeholder | Made from |
| --- | --- |
| `vigil-snap-placeholder.png` | The stance drawing and the crouching drawing from your M sheet. |
| `vigil-anchor-placeholder.png` | The stance drawing, an M drawing, and the sweep's lash. |
| `vigil-anchor-catch-placeholder.png` | Reel's pulling drawings. |
| `vigil-anchor-miss-placeholder.png` | The sweep's recovery drawings. |
| `vigil-exit-placeholder.png` | The stance drawing, the entry drawing, the idle. |
| `brand-burst-placeholder.png` | A generated gold burst (Flare's detonation on the opponent). |
| `brand-fizzle-placeholder.png` | A generated breaking ring (the Brand fading by itself). |

## Where I had to decide

1. **The Brand is the one that already existed.** Lumen Hook still places it, and Reel and Lightstep still spend it,
   exactly as before. The Vigil moves were added onto the same Brand. Nothing was removed. If the Hook should stop
   placing it, say so; it is one line.
2. **Back Heavy: your numbers and your drawing disagree.** The move reached about 100 px, not 190. I doubled it, as
   the spec says: it now reaches 200 px, with the hitbox length (180 px) in the data. But the new lash is drawn about
   300 px long, so the last third of it does not hit. At 300 px it would outreach Lumen Hook (210). Tell me which you
   want; it is one number.
3. **Vigil M's numbers don't add up, so I kept the frame data.** Startup 16 plus recovery 22 is 38 frames, but your
   holds (3, 5, 4, 4, 10, 8) add to 34 and put drawing 5 one frame after frame 16. I kept startup 16 and recovery 22
   and set the holds to 3, 5, 4, 3, 12, 11, so the crescent still leaves on the first frame of drawing 5.
4. **Flare's recovery is counted the way your holds count it:** the snap drawing (3 frames), then 16 frames. The
   fizzle is the same shape: 3, then 12.
5. **"9 units per frame" is 9 px per frame.** In the engine's own units that would be a tenth of a pixel.
6. **"The edge of the screen" is a distance, because the rules never look at the screen.** The crescent flies up to
   110 frames (about 990 px, a little more than a screen), and also stops at the stage wall. Both numbers are in data.
7. **The projectile sheet is 2048 px, so its cells are about 683 px, not 760.** I scaled your anchor point with it
   (leading edge and vertical centre land where you specified, in proportion). In game the crescent is about as tall
   as he is.
8. **Drawing 1 of M and of Flare is replaced by the stance's first drawing,** as your spec allows: the sheets' own
   first drawings are close but not the same frame.
9. **Back means held back.** If you are still holding back when the stance starts, he steps straight out. A follow-up
   pressed on the same frame wins.
10. **The 120 frames restart each time he comes back into the stance** (after Snap, M or a detonated Flare).
11. **With drawing 5 gone the loop has 7 drawings, and I kept it 24 frames long** (holds 4, 4, 4, 3, 3, 3, 3), so
    the stance's timing and the two effect layers are unchanged. Every follow-up still opens on the loop's first
    drawing (your drawing 2).
12. **The stance sheet's second row is drawn about 9% bigger than its first** (the earlier version was 2.5%). I
    scaled the rows to match by body size. His feet still shift a little between drawings.
13. **Numbers the spec left open, all first guesses in data:** Snap 300 damage and 16 hitstun; crescent 400 damage
    and 18 hitstun; Anchor 500 damage, reach 300 px, hits mid; Flare 300 damage. Follow-ups work whatever direction
    is held.
14. **Anchor can be blocked** (the spec only says Flare can't). A blocked Anchor leaves the Brand on and goes to the
    34-frame miss.

## Engine pieces (general, for any character)

- **Projectiles** are objects in the game state (owner, position, age), so replays and rollback carry them. A move
  spawns one with a timeline event; its speed, hitbox, lifetime and frame data are data.
- **Held stances:** a state can time out, and can be left by holding back.
- **A hit that needs a condition** (Anchor: only when branded), **extra hitstun on a condition** (the staggers), **a
  hit at any distance** (Flare), and **animation branches** (on hit, or by a condition at the end of a state).
- A character's own states can carry art, the way moves do.
- The renderer draws projectiles (additive light), effects in step with a stance, and a fizzle when the Brand runs
  out. It decides nothing.

## Tests

201 tests, all passing (20 new in `tests/avner-vigil.test.js`; the old placeholder-stance test was removed with the
placeholder). `npm run build` passes. The new tests cover everything on your list as far as the paste went:

- Each move's frame data and drawing holds.
- The stance: 20 frames in, 120-frame limit, 12 frames out, back leaves it, no blocking, a hit ends it, follow-ups on
  the first loop frame.
- The Brand: 300 frames, refresh instead of stacking, not removed by getting hit.
- Snap and M on unbranded and branded opponents; Snap blocked low and hitting a standing guard.
- The crescent hitting, blocked high and low, running out of room, hitting the stage wall, clashing with another
  crescent, and M locked out while one is flying.
- Anchor catching a branded opponent (+20, pulled to 80 px, a combo follows) and missing an unbranded one standing in
  its path.
- Flare detonating at full screen through a guard, and fizzling.
- Back Heavy's doubled reach with everything else unchanged.
- The same inputs give the same game, and a save taken with a crescent in the air resumes identically.

Browser-checked on frozen frames: the stance with both layers, the crescent's release and flight, Anchor, Snap, the
fizzle, the Back Heavy's lash.

## Not done

- No art yet for Snap, Anchor (slam, catch, miss), the exit, or the Brand's burst and fizzle. Placeholders stand in.
- Anchor has no drawn chain along the ground yet: the placeholder lash is much shorter than the 300 px it reaches.
- The spec's Tests list was cut off; if more tests were listed after Flare, send the rest.
- Still open from before: 5L / 2L hitboxes shorter than the drawn fist, 5H's frame order, the launcher's still
  recovery, colour swaps on painted art, the Hook's leap drawing.

## What to try first

Training, Avner vs Avner:

1. **Down, down + S**, then do nothing: 2 seconds, then he steps out. Again, and hold back.
2. In the stance: **L** up close. Then **L** again while the mark is on them: the longer stagger.
3. In the stance: **M** from mid screen. Press M again right away: nothing until the first one is gone.
4. Brand them (L or M), then **H** from about three steps away: the pull. Then press 5L right after.
5. **H** on an unbranded dummy standing in front of you: it passes through.
6. Brand them, walk to the far wall, stance, **S**. Then **S** with no Brand.
7. Set the dummy to block and throw **M** at it, then try Flare through the block.
8. **4 + H** from two steps away, and tell me whether 200 px or the full drawn lash feels right.
