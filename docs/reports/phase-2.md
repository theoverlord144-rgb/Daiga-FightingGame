# Phase 2: the character script

## What I built
- **Every character is a state machine, written as data.** Each state (stand, crouch, walk, jump, landing, every
  attack, hit, block, knockdown, wake-up) is a timeline of frames. On each frame the data can set:
  - the sprite
  - speed changes
  - gravity on or off
  - hitboxes, hurtboxes, pushboxes, throw boxes
  - invincibility (strike, throw)
  - armor
  - counter-hit state
  - sound and effect cues
  - cancel windows
- **Moves carry their frame data:** startup, active, recovery, hitstun, blockstun, hitstop, pushback on hit and block,
  self pushback, damage, guard type (high, mid, low, unblockable), reach. The engine builds each move's timeline from
  those numbers. Startup counts the first active frame, so a 4-frame move hits on its 4th frame.
- **The Toska editor format loads.** Version 1 (`{ engine: "Toska", version: 1, character, moves[] }`) is upgraded to
  version 2 on load. Version 2 adds explicit timelines, cancel windows and character stats. Sprite sheets (columns,
  rows, count, frame holds) drive the sprite frames. The full format is written up in `docs/toska-format.md`.
- **Inputs become moves.** A move's `input` in numpad notation (`5L`, `2M`, `6H`, `j.H`, `236L`, `[4]6H`) is its
  command. When several fit, the engine picks in this order: supers, then specials (longer motions first), then
  exact-direction normals (`6H` beats `5H`), then the rest. One press is one move: holding a button never repeats it.
- **Avner** has 11 placeholder normals at UMvC3-speed targets:
  - 5L and 2L: 4 frames.
  - 5M: 6 frames. 2M: 7 frames.
  - 5H: 9 frames. 2H: a 9-frame low sweep.
  - 5S: an 8-frame launcher.
  - j.L, j.M, j.H, j.S: air normals.
  - Basic chains: lights into mediums, into heavies, into the launcher. On hit, the launcher cancels into a jump.
- **The Sandbox** (the page that opens now): two Avners, walk, crouch, jump, attack, with input history on both
  sides.
  - F3 shows the boxes: green hurt, red hit, white push.
  - F4 shows each fighter's state name and frame.
  - R resets.
  - The Input Lab moved to `?mode=lab`.
- **Placeholder figure:** until a move has sprites, each fighter is a coloured block with a head. During active frames
  a limb reaches out to the real hitbox, so you can see each move's range while testing.

## What I decided and why
- **Your Toska export wasn't here, so I defined version 1 from your brief and wrote Avner's moves myself.** Every
  number is a placeholder. When you send the real export, I'll map its fields onto this. Anything it has that I
  don't know yet will be kept, not lost.
- **Cancel windows are frame ranges with a condition** (on hit, on block, on whiff) and a list of what they cancel
  into: specific moves, or whole groups (`#special`, `#super`, `#jump`). Phase 5's gatling table will fill these in
  from a simpler table, so you won't write frame ranges by hand.
- **The whole move is in counter-hit state by default**, from first frame to last. That's the BlazBlue way. It can be
  changed per move (`startup+active` or `none`).
- **Pressing during the last frames of a move still works.** A button pressed up to 4 frames before you can act comes
  out on the first frame you can. Tests confirm it neither cancels early nor gets dropped.

## Tests
- 35 tests, all passing. New this phase:
  - A move plays every frame in order, then returns to stand.
  - Hitboxes appear on exactly the active frames.
  - Speed changes, sound cues, invincibility ranges and multi-hit numbering fire on the right frames.
  - Cancel windows open on time (a buffered press comes out on the window's first frame) and close on time.
  - Cancels only go where the list allows, and never on whiff unless allowed.
  - Command priority.
  - One press = one move.
  - Version 1 files load (frame data, sprite holds, evenly spread sprites, a sprite for the idle stance).
  - Bad files are refused with a clear message.
  - Every number in the game state stays a whole number.
- `npm run build` passes. One game frame costs about 0.04 ms (about 0.25% of a frame's budget).

## What to play-test first
1. `npm run dev`, open http://localhost:5300.
2. Press F3 for boxes. Try every normal: L, M, H, S; crouching with down; in the air after a jump.
3. Watch the startup feel: L comes out on frame 4, H on frame 9. Tell me if anything feels sluggish or too quick.
4. The fighters pass through each other and can't hit yet. That's Phase 3, next.
