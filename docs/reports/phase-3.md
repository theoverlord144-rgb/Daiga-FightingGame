# Phase 3: collision and hits

## What I built
- **Boxes per frame, flipped by facing.** Hitboxes, hurtboxes, pushboxes, throw boxes and throw-hurtboxes all live
  in each frame of the data and turn around with the character.
- **Hits, blocks and the guard rules.**
  - High: blocked standing only.
  - Low: blocked crouching only.
  - Mid: blocked either way.
  - Unblockable: can't be blocked.
  - Air blocking is on by default; a move can be marked "can't be air-blocked".
  - Blocking means holding away from the attacker, so cross-ups block the other way. A cross-up also turns the defender around.
- **Counter hits:** hitting someone mid-move adds 4 frames of hitstun and 3 of hitstop. Set in `battle.json`.
- **Clashes:** when two hitboxes meet and neither reaches a body, both fighters freeze briefly and can cancel.
- **Trades:** both hits land, both take damage, both freeze together.
- **Armor:** a frame can absorb hits. The defender takes the damage, doesn't flinch, and the move keeps going.
- **Throws:** a throw box checked against the throw-hurtbox. Avner has a forward throw (6H) and a back throw (4H,
  swaps sides).
  - After a throw connects there's a 7-frame break window: press H to break it.
  - Two throws on the same frame tech each other.
  - A throw beats a strike on the same frame.
  - You can't throw someone in hitstun or blockstun, or in the air.
- **Hitstop on both fighters**, then hitstun or blockstun. Buttons pressed during hitstop stay buffered, so cancels
  feel right even when hitstop runs longer than the 4-frame buffer.
- **Pushback slides over 8 frames**, fast then slowing, always totalling exactly the move's number.
- **Corner pushback:** if the defender is already in the corner, the attacker slides back instead. If the slide hits
  the wall partway, the part the wall refused moves the attacker.
- **Pushboxes** keep fighters apart. Walking into someone pushes them, and nobody can be pushed through a wall.
- **Guts:** the lower your health, the less damage you take:
  - 90% at half health
  - 80% at 35%
  - 70% at 20%
  - 60% at 10%
- **On screen:** hit, counter, block, clash, armor, throw and tech sparks, plus simple health bars.

## What I decided and why
- **Both fighters act at the same moment.** Each frame runs in stages: both decide, both move, push apart, both land,
  then every hit is checked both ways at once. Player 1 never gets to act first. A test plays 3,000 frames of
  mirrored random inputs and checks the match stays a perfect mirror on every frame.
- **Throws beat strikes on the same frame**, and the break button is H, the same button that starts a throw. Both are
  easy to change if you prefer otherwise.
- **Hitstun 12 means 12 frames stuck, acting on the 13th.** That keeps the frame-advantage maths (Phase 6) simple:
  advantage = stun minus the attacker's remaining frames.
- **Counter hits don't add damage** (BlazBlue style). That's one number in `battle.json` if you want a bonus.
- **Knockdown, KO and wake-up are basic for now.** At zero health nothing special happens yet; rounds come with the
  game screens in Phase 9. Air tech and untechable time arrive with the combo system in Phase 5.

## Tests
- 59 tests, all passing. New:
  - Box flipping.
  - Damage, hitstop on both fighters, exact hitstun length.
  - Multi-hit moves.
  - Every guard rule (high, low, mid, unblockable, not holding back).
  - Blockstun and block pushback; air block allowed and refused.
  - Air hits and the landing knockdown; knockdown moves.
  - Counter hit; clash; trade.
  - Armor takes exactly one hit.
  - Throw connect, the break window, back throw swap, throw vs throw, no throwing out of blockstun, throw beats strike.
  - The pushback slide shape and total; corner pushback; the wall-transfer case.
  - Pushboxes holding up, including in the corner.
  - Guts at every step of the table.
  - The mirror-match fairness check.
- `npm run build` passes. A game frame still costs well under a tenth of a millisecond.

## What to play-test first
1. `npm run dev`, open http://localhost:5300. Player 2 is the arrows and Num 1 2 3 5, or a second pad.
2. Hit Player 2 with L, then M, then H, and the launcher (S). The chains work on hit and on block.
3. Hold back on Player 2 and try highs, lows and jump-ins. Then try 6H and 4H up close, and break the throw with H on Player 2.
4. Push Player 2 into the corner and attack: you'll slide back instead of them.
5. F3 shows the boxes; F4's labels show state, hitstop and stun counting down.
