# Phase 1: core loop and input

## What I built
- **A 60 Hz heartbeat.** The game rules advance exactly 60 times a second, separately from drawing. A 144 Hz monitor
  draws more often but the game never runs faster; a slow moment drops time instead of speeding up to catch up.
- **Inputs in numpad notation.** Each frame, each player gives one input: a direction (1-9) plus L, M, H, S.
- **An input buffer** holding the last 2 seconds of each player's inputs, and a **motion reader** for 236, 214, 623,
  421, 41236, 63214, 22, and charge [4]6 and [2]8. Motions read relative to facing, so a player on the right side
  does 214 on the stick and gets 236.
- **Every motion is tunable in `data/system/input.json`:** the directions it needs, how many frames you have to do
  it (the window), and a looser "lenient" version with a longer window. Leniency is one switch (on by default).
- **Negative edge** (releasing the button also fires the special) works, as an option each move can turn on in Phase 2.
- **Press buffer:** a button press stays "live" for 4 frames, so a move pressed slightly early comes out.
- **SOCD** (left+right, up+down held together): left+right = neutral, up+down = up, set in data. "Last input wins"
  is also available.
- **Keyboard and gamepad**, rebindable (F1), saved in the browser. Defaults: Player 1 WASD + J K L I; Player 2 arrows
  + Num 1 2 3 5; pads 1 and 2 with the d-pad or left stick.
- **The whole game is one plain object** that can be copied, saved as text and compared, with a checksum. Rollback
  needs exactly that later.
- **The Input Lab** (the page you see when you open the game): both players' input history, like a training mode
  display, and a big "Read as" line showing what the reader recognised.

## What I decided and why
- **Lenient motions** (my starting values, all in data, all yours to change):
  - 236/214: the diagonal can be skipped and the down can be a down-diagonal (2-6, 1-6 count as 236). The window grows from 10 to 14 frames.
  - 623: 3-2-3 counts (the classic shortcut).
  - 41236/63214: 16 frames strict, 22 lenient; the in-between diagonals are optional.
  - 22: any down, then anything that isn't down, then any down.
  - Charges: 30 frames of charge; the release must come within 8 frames of the button (12 lenient); lenient also accepts up-forward/down-forward as the release.
- **When two motions both match** (a half circle contains a quarter circle), the reader reports both, in a priority
  order set in data; half circles and the dragon punch motion come first. The character's moves decide in Phase 2.
- **Left+right = neutral breaks a charge.** That's how most fight-sticks with this rule behave. Flag it if you want
  charge kept through SOCD.

## Tests
- 21 tests, all passing: every motion with and without leniency, facing, the window timing, charge time and release
  timing, the press buffer, negative edge, SOCD (both rule sets), the buffer wrapping, state copying, saving and
  comparing, and "same inputs = same game" over 2,000 frames.
- `npm run build` passes.
- Speed: one game step takes 0.06 microseconds right now; copying the whole state takes 8 microseconds. Rollback's
  worst case (8 frames re-run) uses under 0.1 ms of the 16.7 ms frame. Screen check: a steady 60 fps.

## What to play-test first
1. `npm run dev` in the project folder, open http://localhost:5300.
2. Do your fireballs, dragon punches, half circles and charges on Player 1. Watch "Read as". Purple = special read.
3. Press F2 to turn leniency off and feel the difference. Tell me which windows feel too tight or too loose.
4. F1 opens Controls: plug in a pad or stick and bind your buttons.
