# Avner: the new Lumen Hook, Halo Rise, jump and crouch art, and the attacker in front

## What's new, in plain words

- **Attacks are no longer hidden behind the other fighter.** Before, the attacker was only drawn in front while the
  hit could connect (2-4 frames). For the rest of the move (the wind-up and the follow-through), the other fighter
  was drawn on top, so arms looked cut off: 5H, 5M, 2M, the launcher, the Hooks and Halo Rise all did it. Now
  whoever is attacking stays in front from the first frame of the move to the last. If both are attacking, the one
  whose hit is out wins. Otherwise whoever was in front stays there, so nothing flickers.
- **Lumen Hook uses your new 9-drawing version.** 8 of the 9 drawings are in play: crouch with the chain, the
  overhead swing, the big loop, the point, the open-hand throw, the two-fisted pull, the swipe, then stance.
- **The chain comes out of his hand.** On the throw it starts at the open palm. On the pull it starts at his fists
  at the chest. Before, it started from a point measured on the old art, which now sat in empty air.
- **Clean frames.** The first cut of the new Hook split the drawn chains across frames: the throw's chain was chopped
  off, and loose links ended up in the next two frames. All 8 frames are whole now, with nothing from a neighbour.
- **Halo Rise** (623 + L/M/H): a rising uppercut that launches, with your glowing arc. M is strike-invincible for 4
  frames and H is fully invincible for 8. L has no invincibility.
- **New art:** crouch, jump squat, jump (rising, then the loop at the top), fall, landing, jumping light, jumping
  medium.

## Decisions I made

1. **The drawn straight chain on the throw and pull frames was erased** (your arm, hand and gauntlet are untouched).
   The game draws its own chain from the hand to wherever the Hook really reaches: 210 px out for L, 250 for M, 290 for H,
   and all the way to the opponent on a hit. A drawn chain has one fixed length and sat on top of the game's chain,
   so you saw two chains. The chain you drew on the other frames (wrapped at his feet, the loop, behind his back, the
   swipe) stays.
2. **The mid-air leap (drawing 5) is left out.** It lifts him off the ground in the middle of the throw, and since the
   move doesn't travel, his feet would pop. If you want it in, the move needs a small hop to go with it.
3. **The Hook's hitbox didn't move, and it doesn't need to any more.** On the new art the hand is at chest height
   (106 px up), and the hitbox already runs from 92 to 110 px. The chain now runs level. Last report's question is
   closed.
4. Timing is unchanged: the open-hand drawing is on the frames that can hit, so the hitstop freeze holds on it.

## Engine pieces (drawing only; the game rules never read them)

- Move `chain.hands`: a hand point per drawing (`{ "4": [58, 106], "5": [19, 106] }`), with `hand` as the fallback.
- Top-level `effects` + timeline `fx`: a named sheet effect played where the fighter is (Halo Rise's arc).
- State `loopFrom`: a looping state restarts from that frame (the jump's top-of-arc loop).
- `sprite-prep.mjs --cuts x1,x2,...`: place the dividing lines between drawings by hand when they overlap.
- The draw order lives in `fight-renderer.js` (`front`, presentation only).

## Tests

170 tests, all passing. No rules changed, so no new tests. `npm run build` passes. Browser-checked, frozen on
exact frames: 5H's follow-through and 5M's recovery up close (the attacker in front), the second player attacking,
Hook L and Hook H on their hit frames (the chain starts at the open palm and runs level to the tip), and the Hook's
pull on a hit (the chain starts at the fists).

## What to try first

Training, Avner vs Avner, up close:

1. **5H** and **5M**, slowed down (` twice): the arm stays in front through the follow-through.
2. **236 + L / M / H** from range: the chain leaves the palm and runs level. On a hit, it follows the fists back on
   the pull.
3. **623 + H** while the dummy attacks: the invincible Halo Rise.
4. Tell me whether you want the leap drawing back in (it needs a hop).
