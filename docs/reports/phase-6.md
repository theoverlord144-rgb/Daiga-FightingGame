# Phase 6: training mode

## What I built
Training mode is now the screen the game opens on. Player 2 is a training dummy. A second controller can still play
Player 2 on top of it, so two-player free play works as before.

- **Frame meter (F8 hides it).** Two bars, one cell per frame, one row per player:
  - Colours: green startup, red active, blue recovery, yellow stun (hit or block), grey busy (jumping, dashing),
    dark free. A white stripe marks invincible frames.
  - Under the bars: each player's last move, measured as it played (startup, active, recovery).
  - Above them: the frame advantage of the last hit or block, green when you're plus, red when you're minus. If you
    cancelled, it says so instead of showing a wrong number.
- **Dummy settings (F2 menu, saved in the browser):**
  - Stance: stand, crouch, jump.
  - Blocking: none, all, after the first hit, or random (a coin flip per attack).
  - Block height: correct, standing only, crouching only. Use standing only to check that your lows really are lows.
  - Air recovery: tech as soon as possible, or never.
  - Health refill: on or off.
  - Start position: centre, left corner, right corner. R resets to it.
- **Record and playback.**
  - F6 records the dummy: your Player 1 controls drive it until you press F6 again. Your own fighter stands still.
  - F7 plays the recording back on a loop.
  - The recording remembers forward and back, not left and right, so it still works after you switch sides. Use it
    to practise against a specific option.

## What I decided and why
- **The meter measures, it doesn't copy the data.** It watches what actually happens frame by frame, so it shows the
  truth even after a move's data is edited. The tests then prove the measurement matches the data, both ways.
- **Hitstop frames don't appear on the bar.** That's the usual convention, and it keeps a heavy hit from stretching
  the bar.
- **The bar holds still between exchanges.** After 8 quiet frames it stops, so you can read it at leisure. Your next
  action starts a fresh bar.
- **"After first hit" blocking:** the first hit lands, then the dummy blocks until it's been left alone for a second.
- **The dummy blocks perfectly**, reading the attacker's move the moment it starts. That's what a training dummy is
  for. A human-like CPU comes in Phase 9.
- **Not yet:** forced counter hits, dummy reversals on wake-up, and frame-step pause. All are straightforward to add
  once specials exist (Phase 8). Tell me which ones matter most.

## Tests
- 100 tests, all passing. New:
  - For every Avner ground normal, startup, active and recovery match the data exactly.
  - For every Avner ground normal, the advantage on hit and on block matches the data exactly. 5M shows +3 on hit,
    the same as 17 hitstun minus the 14 frames 5M has left.
  - Advantage is still right when you mash, pressing again on the very first frame you can act.
  - A cancelled chain is reported as cancelled, and the follow-up is measured on its own.
  - The frame bar's order and colours, and its hold-then-fresh behaviour.
  - The dummy blocks lows crouching and mids standing; standing-only blocking loses to a low.
  - "After first hit" gives hit, block, then hit again once things calm down.
  - Random block mixes both, and the same seed gives the same sequence.
  - Air tech on and off.
  - A recording played back from the other side walks the same distance the other way.
  - Health refill on and off, and both corner positions.
- I found and fixed one real meter bug along the way: a move that restarts itself (mashing 5H) wasn't seen as
  ending, so no advantage showed.
- `npm run build` passes.
- Speed: a game frame plus the dummy and the meter takes about 2.6 microseconds, against a budget of 16,700 per frame.
  The overlay draws about 200 small rectangles a frame, negligible on any laptop. The test browser I screenshot with
  runs headless at about 17 fps no matter what, so it can't confirm the real 60. On your machine, the corner readout
  should show 60 steps a second.

## What to play-test first
1. `npm run dev`, open http://localhost:5300. You're in training mode.
2. Press 5M near the dummy: you should see startup 6 · active 3 · recovery 12, and +3 on hit.
3. F2 → Dummy blocks: all. Do 5L 5M 5H on block and read how minus each one leaves you.
4. Set Block height to standing only and check that 2L and 2M hit.
5. F6, make the dummy do something (a jab, a jump), F6 again, then F7 to loop it.
6. Tell me if the colours and layout read well at a glance, and which missing options you want first.
