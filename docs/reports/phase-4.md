# Phase 4: movement (UMvC3 speed)

## What I built
- **Dash** (tap forward twice): 16 px a frame for 12 frames (192 px), then a 3-frame stop. From its 4th frame you can
  cancel it into any attack or a jump, so dash-up normals and dash-jump work.
- **Backdash** (tap back twice): 13 px a frame for 14 frames, invincible to strikes and throws for the first 8, then
  6 frames of recovery.
- **Airdash** forward and back (tap twice in the air): flat, no gravity, 15 px a frame for 14 frames (back: 13 for 12).
  It keeps 30% of its speed after, so you drift instead of stopping dead. Cancellable into air attacks from its 5th
  frame. One per jump.
- **Super jump** (down, then up within 8 frames): about twice as high as a normal jump.
- **Double jump**, an option per character. Avner has one.
- **Jump** with 3 pre-jump frames, and **landing recovery** (3 frames).
- **Every number is per character data.** A character file can override any of them. Defaults live in
  `data/system/fighter-defaults.json`.
- **The camera rises** with super jumps so you never leave the screen.

## What I decided and why
- **A button beats a dash.** If you tap forward and press L on the same frame, you get 5L, not a dash. One frame
  later, the L comes out of the dash as soon as the dash can cancel. That keeps buttons reliable.
- **Holding forward never dashes.** The second tap has to be a fresh press.
- **No momentum carries into a dash-cancelled ground normal** (you stop and attack). UMvC3's "wavedash" momentum is a
  one-line change if you want it. Air attacks out of an airdash do keep the airdash's momentum.
- **No dash on two buttons** (UMvC3's L+M dash). With only four buttons I left that slot free for now.
- Normal jumps last about 38 frames and reach about 160 px. Super jumps last about 53 and reach about 320 px. Both are
  placeholders to tune by feel.

## Tests
- 72 tests, all passing. New ones check exact numbers against the data:
  - walk speeds
  - pre-jump frames, airtime, jump height and distance (forward and back)
  - landing recovery
  - super jump frames and height
  - dash distance and frames
  - the dash cancel opening on exactly its frame, and holding forward not dashing
  - backdash distance, its invincible frame count and recovery
  - airdash staying perfectly flat, its exact distance, the speed it keeps after, and the one-per-jump limit
  - back airdash
  - the double jump and its limit; a character without one can't
  - a character with different numbers moving differently
  - the UMvC3-speed targets: 4-frame lights, 3-frame pre-jump, dashes of 180 px or more in 16 frames or less
- I also fixed the random-fight tests. Before, random inputs never brought the fighters together, so they never
  tested combat. Now they walk in and press buttons. A test proves hits and blocks really happen, and the "same
  inputs = same game" checks now cover real fights.
- `npm run build` passes. One frame of the full game costs about 1.4 microseconds (about 700,000 frames a second).

## What to play-test first
1. `npm run dev`, open http://localhost:5300.
2. Dash in and press L straight out of it. Backdash through a jab: it's invincible early.
3. Jump, airdash forward, then j.H. Try a back airdash too.
4. Super jump (down, then up), and double jump in a normal jump.
5. Tell me what feels slow or floaty. Every number above is one line of data.
