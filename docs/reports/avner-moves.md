# Avner: Back Heavy, the two-swipe Air Heavy, walks, dashes, blocks and Vigil Stance

## What's new, in plain words

- **The cut-off kick is fixed at its source.** 2M's leg was being sliced by the tool that turns your strips into
  game sheets: the soft glow around the drawings made it think two neighbouring drawings were one piece, and it cut
  that piece down the middle. The tool now follows the solid ink only, and hands the glow to whichever drawing it
  surrounds. 2M, the jumping light and Halo Rise were re-cut with it. (Last report's draw-order fix was real too;
  this was the other half.)
- **Back Heavy (4 + H).** Your drawings without number 3, as you asked. The lash (drawing 5) is on the frames that
  hit, so the hitstop freeze holds on it. 11 frames to come out, 850 damage.
- **4 + H is two moves now, the way Marvel does it.** Close enough to grab, you get the back throw. Out of grab
  range, or when the opponent can't be thrown (in the air, in hitstun or blockstun), you get the Back Heavy. 6 + H
  works the same way: forward throw up close, otherwise your standing heavy. A throw never comes out by accident and
  whiffs any more.
- **Air Heavy (j.H) is two hits:** drawings 1, 2, 3, the up-swipe with its gold arc (hit 1), 5, 6, the down-swipe
  with its arc (hit 2), then 8, 9. The swipe drawings were bigger than the rest of the strip, so I scaled them to his
  body and lined every body up on one line so he doesn't jump around mid-move. Hit 1: 450 damage, pops the opponent
  up slightly. Hit 2: 600, knocks them away.
- **Ground dash and back dash** use your drawings, each with its stopping pose.
- **Air dash** uses your four drawings, with 2 and 3 tilted 12° forward as you asked.
- **Back air dash** (44 in the air) has art too, borrowed from the ground back dash (see decision 4).
- **Walking** forward and back uses your two six-drawing cycles, eight frames a drawing, so the feet keep pace
  with the ground instead of sliding.
- **Vigil Stance (down, down + S)** is in, with both gold layers: the chain ring on the ground with its rising sparks, and
  the streak of light circling his waist. Drawing 1 is the wind-up, drawings 2 to 9 are the stance, and drawing 1
  again takes him out of it. **What it does is my first guess, see decision 6.**
- **Crouching heavy (the sweep, 2H)** uses your new drawings without the fifth, as you asked. The lash is on the
  frames that hit, and it reaches as far as the hitbox already did (about 140 px), so nothing was retuned.
- **Blocking** has art: standing, crouching and in the air. Each shows the pushed-back drawing for the first 8
  frames of the block, then holds the guard.

## Decisions I made

1. **Back Heavy is in the combo routes where 5H is:** L and M normals chain into it, and it chains into the sweep,
   Crushing Blow and the launcher. In a combo the opponent can't be thrown, so 4 + H always gives the Back Heavy
   there.
2. **Back Heavy's reach is what you drew: about 100 px.** The grab reaches about 87 px, so from neutral the Back
   Heavy only lands in a thin band between the two (and it's shorter than 5H, 130 px). In combos that doesn't matter.
   If you want it as a poke, the lash needs to be drawn longer or the hitbox stretched past the art. Your call.
3. **Air Heavy's hitboxes cover the first ~200 px of each arc,** as planned. The drawn arcs go further (about 250 px
   up, 310 px down); the tips are for show.
4. **Back air dash (44 in the air) uses the two airborne drawings from your ground back dash:** the tucked hop, then
   the legs-out drift. It has no strip of its own; if you draw one, it drops straight in. The fall after any air
   dash uses your falling drawings.
5. **Hold lengths are my first pass:** dash 3 frames a drawing; back dash 3, 6, 5; air dash 2, 5, 5, 2.
6. **Vigil Stance: you never told me what it does, so this is a placeholder design to react to.** It lasts just
   under a second. While the ring is lit he takes one hit without flinching (full damage, no stun). From the stance
   he can go straight into Lumen Hook or Halo Rise. Normals cancel into it like any special. He cannot go from the
   stance back into the stance. If you meant a counter, a held stance, a power-up or something tied to the Brand,
   tell me and I will rebuild it; the art stays as wired.
7. **The stance drawings in your second row are drawn slightly bigger and wider-footed than the first row.** I
   scaled them to match in height, but the back foot still shifts about 5 px once per loop.

## Engine pieces

- **Throws only come out in range** (`pickCommand` in `fighter.js`): a throw command is skipped unless its grab box
  would touch the opponent right now and they can be thrown; the input then falls to the next move it matches. General
  for every character.
- **A later hit's own frame data is converted properly.** A second hit that set its own pushback or knock-away had
  those distances stored 100× too small (nothing used it until Air Heavy). Fixed.
- **Block and hit states are as long as their art,** then the last drawing holds for as long as the stun lasts.
- **Effects and sparks no longer go missing on a slow display.** The drawing code only looked for new effects once
  per screen refresh, so when the game ran two or more steps between refreshes, anything that started on the earlier
  step never appeared. It now checks after every step. All sheets also load up front, so an effect shows the first
  time it is used.
- **Sprite tool:** glow no longer joins drawings; new `--anchor slot`, `--floor <number>` and `--tilt n:degrees`.

## Tests

182 tests, all passing (12 new: the in-range throw rule from both sides and against an airborne opponent, the
second-hit fix, block art length, and Avner's own data: 4 + H up close and far, Air Heavy's two hits on the two swipe
drawings, every drawn attack's drawings filling the move exactly, dash, walk and block art present, Vigil Stance taking one hit and going into Lumen Hook). `npm run build`
passes. Every sheet scanned for sliced drawings. Browser-checked, frozen on exact frames: Back Heavy's lash and
follow-through, both Air Heavy swipes, dash and its stop, back dash and its stop, air dash, all three blocks (both
drawings), both walks, Vigil Stance with both effect layers at full speed, and 2M's kick.

## Not done

- Still open from before: 5L / 2L hitboxes shorter than the drawn fist, 5H's frame order, the launcher's still
  recovery, colour swaps on painted art, the Hook's leap drawing.

## What to try first

Training, Avner vs Avner:

1. **4 + H** from a step away, then touching: Back Heavy, then the back throw.
2. **5L, 5M, 4 + H, 5S**: Back Heavy in a combo.
3. **Jump, H**: both swipes should hit a standing opponent on the way down. Tell me if the timing feels right.
4. **66, 44**, and both in the air. Watch his feet on the dash stop.
5. Set the dummy to attack and block standing, crouching and in the air.
6. **2M** up close: the whole kick leg.
7. **Down, down + S**, then let the dummy jab you, then **236 + L** out of the stance.
8. Walk both ways and watch the feet.
