# The editor: frame timing, and a CANCELS page

Built Nov 23, 2026, from your pick of the two editors: startup / active / recovery, and what cancels into what.

## The short version

- **HIT SETTINGS has a new first column, TIMING:** Startup, Active, Recovery. Change one and the move gets longer
  or shorter, the drawings stretch or squeeze with it, and the preview's "+5 on hit" line updates on the next loop.
- **A third page, CANCELS** (press **T** to step through the pages, or click the tab). Every move down the side,
  what it can be cancelled into across the top. Click a square to add or remove a route.

370 tests, 368 pass (the same two as before, from your Avner hitbox edits). Build passes. Checked in a real Edge
driven by a script: the grid drew, clicks added and removed routes, the hit-only switch, undo, the page switch and
a startup and recovery change all worked, with no page errors. Not used by hand.

## Timing

- **Startup** counts the first hitting frame, as before (startup 9 = hits on the 9th frame).
- Frames are added or taken **at the end of the part you change**. More startup holds the last wind-up drawing
  longer; more recovery holds the last drawing longer. The hit still lands on the same drawing.
- Everything timed to the move moves with it: hurtbox changes, the moment a projectile comes out, multi-hit
  timing, the move's EX version, cancel windows.
- When you shorten, the drawing in that part loses frames first, then its neighbours. Every drawing keeps at least
  one frame, so the page refuses a move shorter than its number of drawings and tells you why.
- No "back to default" for these three (there is no default to go back to). Use UNDO.

**Not editable there, on purpose:**
- EX versions follow their normal version. Change it there.
- Moves every character shares (Vow, Absolve) keep their shared timing.
- Avner's Vigil M sets its own length in the file, so the page refuses it.

## Cancels

- **Gold square** = on hit or block. **Red** = on hit only. **Blue** = on block only. Dark = no route.
- **The left block (move names across the top)** is chains: this move straight into that move. Click to switch
  one on or off.
- **SPECIAL / SUPER / JUMP** are whole groups: "any special", "any super", "a jump". Each click steps through
  never, on hit, on block, on hit or block. A paler square is the engine's default; nothing is written in the file
  for it.
- **Click a move's name** (or use up / down) to work on it. The panel at the bottom then shows:
  - what chains into it ("Reached from");
  - **CHAINS WORK ON…**: one switch for the whole row, hit or block / hit only / block only;
  - **the cancel window**: the first and last frame the move can be cancelled on. By default it opens on the
    first hitting frame and stays open to the end. Close it earlier to make a cancel tighter.
- Ground moves and air moves are not offered to each other.

## Why this matters for infinites

A loop needs a route back to where it started. On this page a loop is visible: a row that has a gold square in
its own column (5L into 5L) or two rows that point at each other. Both characters have 5L into 5L and 2L into
5L / 2L today. That is normal for lights, and the repeat penalty and hitstun decay end it, but now you can see
every such route and close any you don't want.

## Things I decided

- One hit / block answer per move for all its chains, because that is how the file stores it. Per-route answers
  would need a file format change.
- New chains are kept in the order of the move list, so the file stays tidy.
- Follow-up moves that only come out of a stance or another move (Reel, Lightstep) show up as columns once
  something chains into them.

## What is not in it

- Hand-written cancel windows (Avner's Lightstep has one, the Vigil stance has its follow-ups). The panel says
  when a move has one; they are still file-only.
- Dash cancels, and the Vow cancel (it follows "any special").
- Still file-only from the earlier list: combo scaling, meter gain, bounces.

## Tests

`tests/cancel-editor.test.js`, 7 tests:
- For every move of Malik and Avner, what the grid shows is what the game allows.
- Adding and removing chains, hit-only chains, and "reached from".
- Special, super and jump routes; only what differs from the default is written; the window.
- Timing: for 20+ of Malik's moves, longer startup and recovery make the move exactly that much longer, the
  drawings fill it, the hit and the projectile come out that much later on the same drawing, and going there and
  back leaves the move exactly as it was.
- Shortening never drops a drawing, and refuses what cannot be.
- Saving these changes writes them into the file and changes only a few lines.
