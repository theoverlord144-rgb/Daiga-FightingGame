# Avner's art: Lumen Hook, Reel, Lightstep, idle, brand effects

## What's new, in plain words

Everything you drew is in the game:

- **Idle:** your 8-frame loop, on both sides (the second player's Avner faces the other way).
- **Light punch:** your smear (the 3rd drawing in play order) is now on screen on the two frames the punch can
  hit, so **when it connects, the hitstop freeze holds on the smear**. The full timing: guard (2 frames) → arm out
  (1) → smear (2, the hit) → follow-through (2) → back turned (2) → stance (3).
- **Lumen Hook (L, M, H):** your 6 drawings: the gauntlet glows, he winds up, throws (the smear frame lands right
  before the hit), arm out while the chain is out, pulls back, stance. The stronger versions hold the wind-up
  longer because they're slower.
- **The chain itself** is your link drawing repeated from his gauntlet out to the tip, with your hook head at the
  end. It shoots out with the hit, reels back in over 6 frames on a whiff, and on a hit it runs to the opponent.
- **Brand hit flash:** your 7-frame burst plays where the Hook connects, through the hitstop freeze, and shrinks
  into the brand.
- **Brand mark:** your spinning mark loops on the branded opponent's waist and fades out in the last second. It
  replaces the ring I drew.
- **Reel:** your 5 drawings, the strained yank on the hit frame, with the chain dragging the opponent in.
- **Lightstep:** your 5 drawings: the crouch, the flying lunge while he travels, the landing, the rise, stance.

Everything else (walking, jumping, getting hit, the other normals) still draws the placeholder figure, so he still
switches between art and placeholder until those are drawn.

## Decisions I made

1. **Light punch timing.** "Hitstop on the 3rd frame with the smear" meant moving the smear onto the hit frames.
   The punch's frame data (4 startup, 2 active, 7 recovery) didn't change; only which drawing shows when.
2. **The Hook's hitbox didn't move.** In your drawing the hand is at chest height (about 133 px up), but the hitbox
   is at about 100 px, so the chain angles down slightly from the hand to the tip. If you want the chain dead
   level, the hitbox moves up to the hand. Note that this changes gameplay: a chest-high Hook would go over some
   crouching characters. Your call.
3. **The four drawings with real transparency** (idle, Reel, Lightstep, hook head) kept it. Their faint outer
   halo is dropped (anything under 10% opacity) so there's no smoky box around him. The effects drawn on black (the
   mark and the flash) became glows: brightness turned into opacity, so they look right over any stage.
4. **Lightstep is lined up on his body's centre**, and the flying frame stays in the air as you drew it (the others
   line up on the planted front foot).
5. **Chain, flash and mark are drawing-only data** in Avner's file (`chain`, `hitFx`, `mark`), so other characters
   can use the same features. The game rules never read them.

## Tests

170 tests, all passing (no rule changes this time, so no new tests). The sprite tool's rewrite produced the light
punch sheet byte-for-byte identical to before. Browser-checked: Hook H from range (chain, head, flash, then the
mark looping on the opponent), Reel (yank and chain), the light punch frozen on its smear when it hits, and idle on
both sides.

## What to try first

Training, Avner vs Avner:

1. **J** slowed down (` twice), up close: the freeze on the smear.
2. **236 + H** from far away: chain, flash, mark.
3. **214 + H** while branded: Reel's yank.
4. **214 + L** while branded: Lightstep's flying lunge.
5. Tell me: chain level or angled? Is the mark the right size and height on the body?

## Update: the normals (5L, 5M, 5H, 2L, 2M, launcher)

- **Light and heavy punch swapped**, as you asked: the spinning punch that was on light punch is now **5H**
  (your `Avner_HeavyPunch.png` is the same drawing, kept in your 1,4,3,5,2,6 order), and your new 5-frame jab is
  **5L**.
- New: **5M** (the kick), **2L**, **2M** (the low kick) and the **launcher (5S)** using drawings 1, 2, 3 and 6
  only (no airborne frames).
- **Hitstop on the smear, every move:** each smear drawing sits exactly on the frames the move can hit, so a hit
  freezes on it. The frame data didn't change; only which drawing shows when.
- Crouching moves are sized to match the standing ones (the tool has a new `--scale` option for that).

**Honest flags:**
1. **The art reaches further than the hitboxes.** 5L's drawn fist and 2L's punch nearly touch an opponent the
   hitbox can't reach (both whiffed from about 120 px in my test). Players will feel cheated: "my fist was on
   him." Fix: lengthen those hitboxes to the drawn fist (makes them better pokes) or I can shrink the art. Your call.
2. **5H order:** with 1,4,3,5,2,6 the fully extended fist shows for one frame *before* the smear. If the drawn
   order (wind-up, spin, smear, extended, follow-through, stance) is what you meant for heavy, it's a one-line change.
3. **Launcher recovery** holds the final crouch for 24 frames, because drawings 4 and 5 (in the air) are left out.
   It reads fine but static; a rise-to-stance drawing would smooth it.
